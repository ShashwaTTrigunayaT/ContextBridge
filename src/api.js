import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, now, parseJson, run, uid } from './db.js';
import {
  addMember,
  can,
  createSession,
  createUser,
  destroySession,
  membersOf,
  roleFor,
  ROLE_LABELS,
  seesRestrictedSources,
  userForSession,
  verifyPassword,
} from './auth.js';
import { importDocument, importLiveGithub } from './ingest.js';
import { claimEvidence, CLAIM_CATEGORIES, reconstruct } from './extract.js';
import { approvedSnapshot, approveHandover, buildHandover, ensureHandover } from './handover.js';
import { answerQuestion, auditTrail } from './assistant.js';
import { ensureInstall, installAccountList } from './install.js';
import { isRepoSlug } from './repos.js';
import { llmEnabled, llmModel } from './llm.js';

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function audit(projectId, userId, action, target, detail) {
  run(
    'INSERT INTO audit_logs (id, project_id, user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('aud'),
    projectId ?? null,
    userId ?? null,
    action,
    target ?? null,
    detail ?? null,
    now(),
  );
}

function projectSummary(projectId, userId, role) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  const sources = all('SELECT * FROM sources WHERE project_id = ? ORDER BY created_at', projectId);
  const counts = get(
    `SELECT
       (SELECT COUNT(*) FROM source_records WHERE project_id = ?) AS records,
       (SELECT COUNT(*) FROM claims WHERE project_id = ?) AS claims,
       (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status = 'pending') AS pendingClaims,
       (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status IN ('verified','edited')) AS reviewedClaims,
       (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status = 'rejected') AS rejectedClaims,
       (SELECT COUNT(*) FROM gaps WHERE project_id = ? AND status = 'open') AS openGaps,
       (SELECT COUNT(*) FROM gaps WHERE project_id = ? AND status = 'open' AND severity IN ('critical','high')) AS severeGaps,
       (SELECT COUNT(*) FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE project_id = ?)) AS evidenceRows,
       (SELECT COUNT(DISTINCT claim_id) FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE project_id = ?)) AS claimsWithEvidence,
       (SELECT COUNT(*) FROM (SELECT claim_id FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE project_id = ?) GROUP BY claim_id HAVING COUNT(DISTINCT source_id) >= 2)) AS corroborated`,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
  );

  const handover = get('SELECT * FROM handovers WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', projectId);
  const approved = approvedSnapshot(projectId);
  const transitionUser = project.transition_user_id
    ? get('SELECT id, name, email, title FROM users WHERE id = ?', project.transition_user_id)
    : null;

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.created_at,
    },
    role,
    roleLabel: ROLE_LABELS[role] ?? role,
    permissions: ['project:manage', 'source:connect', 'reconstruct', 'claim:review', 'handover:read-draft', 'handover:approve', 'evidence:restricted', 'audit:read'].filter(
      (permission) => can(role, permission),
    ),
    viewer: { id: userId, seesRestrictedSources: seesRestrictedSources(role) },
    transitionUser,
    members: membersOf(projectId),
    sources: sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      name: source.name,
      ref: source.ref,
      visibility: source.visibility,
      status: source.status,
      createdAt: source.created_at,
      lastSyncedAt: source.last_synced_at,
      records: get('SELECT COUNT(*) AS count FROM source_records WHERE source_id = ?', source.id)?.count ?? 0,
      error: parseJson(source.meta, {}).error ?? null,
    })),
    components: all("SELECT name, metadata FROM entities WHERE project_id = ? AND type = 'component'", projectId)
      .map((row) => ({ name: row.name, ...parseJson(row.metadata) }))
      .sort((a, b) => (b.records ?? 0) - (a.records ?? 0)),
    counts: {
      records: counts.records,
      claims: counts.claims,
      pendingClaims: counts.pendingClaims,
      reviewedClaims: counts.reviewedClaims,
      rejectedClaims: counts.rejectedClaims,
      openGaps: counts.openGaps,
      severeGaps: counts.severeGaps,
      evidenceRows: counts.evidenceRows,
      claimsWithEvidence: counts.claimsWithEvidence,
      corroborated: counts.corroborated,
      evidenceCoverage: counts.claims ? Math.round((counts.claimsWithEvidence / counts.claims) * 100) : 0,
      corroborationRate: counts.claims ? Math.round((counts.corroborated / counts.claims) * 100) : 0,
    },
    handover: {
      id: handover?.id ?? null,
      status: handover?.status ?? 'draft',
      currentVersion: handover?.current_version ?? 0,
      approvedVersion: approved?.version ?? null,
      approvedAt: approved?.approved_at ?? null,
      approvedBy: approved?.created_by
        ? get('SELECT name FROM users WHERE id = ?', approved.created_by)?.name ?? null
        : null,
    },
    assistant: { llmEnabled: llmEnabled(), model: llmEnabled() ? llmModel() : 'deterministic-retrieval' },
  };
}

export function createApp() {
  const app = express();
  // A fresh database gets its organization and sign-in accounts. No project or
  // source is created: the workspace stays empty until a repository is connected.
  ensureInstall();
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionId = cookies.cb_session ?? null;
    req.user = userForSession(req.sessionId);
    next();
  });

  // Mounted on "/api", so req.path here is relative ("/login", not "/api/login").
  const publicPaths = new Set(['/login', '/accounts', '/health', '/site-stats']);
  app.use('/api', (req, res, next) => {
    if (publicPaths.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    return next();
  });

  function projectContext(req, res, permission = null) {
    const project = get('SELECT * FROM projects WHERE id = ?', req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    const role = roleFor(req.user.id, project.id);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this project' });
      return null;
    }
    if (permission && !can(role, permission)) {
      res.status(403).json({ error: `Your role (${ROLE_LABELS[role]}) cannot perform this action` });
      return null;
    }
    return { project, role };
  }

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'contextbridge' }));

  // Aggregate figures for the public pages: counts only. No claim text, record
  // body or excerpt is exposed, and nothing here identifies a person beyond a
  // contributor count.
  app.get('/api/site-stats', (req, res) => {
    const project = get('SELECT * FROM projects ORDER BY created_at LIMIT 1');
    if (!project) return res.json({ project: null, counts: null });

    const counts = get(
      `SELECT
         (SELECT COUNT(*) FROM source_records WHERE project_id = ?) AS records,
         (SELECT COUNT(*) FROM claims WHERE project_id = ?) AS claims,
         (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status = 'pending') AS pendingClaims,
         (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status IN ('verified','edited')) AS reviewedClaims,
         (SELECT COUNT(*) FROM claims WHERE project_id = ? AND status = 'rejected') AS rejectedClaims,
         (SELECT COUNT(*) FROM (SELECT claim_id FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE project_id = ?) GROUP BY claim_id HAVING COUNT(DISTINCT source_id) >= 2)) AS corroborated,
         (SELECT COUNT(*) FROM gaps WHERE project_id = ? AND status = 'open') AS gaps,
         (SELECT COUNT(*) FROM gaps WHERE project_id = ? AND status = 'open' AND severity IN ('critical','high')) AS severeGaps,
         (SELECT COUNT(*) FROM entities WHERE project_id = ? AND type = 'person') AS contributors,
         (SELECT COUNT(*) FROM entities WHERE project_id = ? AND type = 'component') AS components`,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
      project.id,
    );

    const sources = all('SELECT kind, ref, visibility, status FROM sources WHERE project_id = ?', project.id);
    const repoSource = sources.find((source) => source.kind === 'github');
    const approved = approvedSnapshot(project.id);

    return res.json({
      project: { name: project.name, repo: repoSource?.ref ?? null, sourceStatus: repoSource?.status ?? null },
      counts: { ...counts, sources: sources.length, roles: Object.keys(ROLE_LABELS).length, sections: 8 },
      handover: { approved: Boolean(approved), version: approved?.version ?? 0 },
    });
  });

  // Sign-in accounts for this installation. Passwords are included only while
  // EXPOSE_INSTALL_ACCOUNTS is not "false"; set it to false outside local use.
  app.get('/api/accounts', (req, res) => res.json({ accounts: installAccountList() }));

  app.post('/api/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = get('SELECT * FROM users WHERE email = ?', email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const session = createSession(user.id);
    res.cookie('cb_session', session.id, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5, path: '/' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, title: user.title } });
  });

  app.post('/api/logout', (req, res) => {
    destroySession(req.sessionId);
    res.clearCookie('cb_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    const memberships = all(
      `SELECT p.id, p.name, m.role FROM memberships m JOIN projects p ON p.id = m.project_id
        WHERE m.user_id = ? ORDER BY p.created_at`,
      req.user.id,
    );
    res.json({
      user: req.user,
      projects: memberships.map((row) => ({ id: row.id, name: row.name, role: row.role, roleLabel: ROLE_LABELS[row.role] })),
    });
  });

  app.get('/api/projects', (req, res) => {
    const projects = all(
      `SELECT p.id, p.name, p.description, m.role FROM memberships m JOIN projects p ON p.id = m.project_id
        WHERE m.user_id = ? ORDER BY p.created_at`,
      req.user.id,
    );
    res.json({
      projects: projects.map((project) => ({ ...project, roleLabel: ROLE_LABELS[project.role] })),
    });
  });

  app.post('/api/projects', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Project name is required' });
    let org = get('SELECT * FROM organizations ORDER BY created_at LIMIT 1');
    if (!org) {
      const orgId = uid('org');
      run('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', orgId, 'ContextBridge', now());
      org = { id: orgId };
    }
    const projectId = uid('prj');
    run(
      'INSERT INTO projects (id, org_id, name, description, transition_user_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      projectId,
      org.id,
      name,
      String(req.body?.description ?? '').trim() || null,
      null,
      req.user.id,
      now(),
    );
    addMember(projectId, req.user.id, 'admin');
    ensureHandover(projectId, { createdBy: req.user.id });
    audit(projectId, req.user.id, 'project.create', projectId, name);
    return res.status(201).json({ project: { id: projectId, name } });
  });

  app.get('/api/projects/:projectId', (req, res) => {
    const context = projectContext(req, res);
    if (!context) return;
    res.json(projectSummary(context.project.id, req.user.id, context.role));
  });

  app.get('/api/projects/:projectId/sources', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const summary = projectSummary(context.project.id, req.user.id, context.role);
    res.json({ sources: summary.sources });
  });

  app.post('/api/projects/:projectId/sources/github', async (req, res) => {
    const context = projectContext(req, res, 'source:connect');
    if (!context) return;
    const repo = String(req.body?.repo ?? '').trim();
    if (!isRepoSlug(repo)) {
      return res.status(400).json({ error: 'Repository must look like "owner/name" — for example twentyhq/twenty.' });
    }
    const visibility = req.body?.visibility === 'restricted' ? 'restricted' : 'team';
    const name = String(req.body?.name ?? `GitHub — ${repo}`).trim();
    const sourceId = uid('src');
    run(
      `INSERT INTO sources (id, project_id, kind, name, ref, visibility, status, meta, created_by, created_at)
       VALUES (?, ?, 'github', ?, ?, ?, 'connecting', ?, ?, ?)`,
      sourceId,
      context.project.id,
      name,
      repo,
      visibility,
      JSON.stringify({ mode: 'live', repo }),
      req.user.id,
      now(),
    );
    try {
      const result = await importLiveGithub(context.project.id, sourceId, {
        repo,
        token: req.body?.token,
      });
      audit(context.project.id, req.user.id, 'source.import', sourceId, `${repo} (${result.imported} records)`);
      return res.status(201).json({ sourceId, ...result });
    } catch (error) {
      run('UPDATE sources SET status = ?, meta = ? WHERE id = ?', 'error', JSON.stringify({ mode: 'live', repo, error: error.message }), sourceId);
      audit(context.project.id, req.user.id, 'source.error', sourceId, error.message);
      return res.status(502).json({ error: `Ingestion failed: ${error.message}`, sourceId });
    }
  });

  app.post('/api/projects/:projectId/sources/documents', (req, res) => {
    const context = projectContext(req, res, 'source:connect');
    if (!context) return;
    const filename = String(req.body?.filename ?? '').trim();
    if (!filename) return res.status(400).json({ error: 'A document filename is required' });
    if (!String(req.body?.body ?? '').trim()) return res.status(400).json({ error: 'Document content is empty' });
    if (!/\.(md|txt|markdown)$/i.test(filename)) {
      return res.status(400).json({ error: 'Only .md, .markdown and .txt documents are supported in this build (PDF/DOCX extraction is listed as future work).' });
    }
    const visibility = req.body?.visibility === 'restricted' ? 'restricted' : 'team';
    const sourceId = uid('src');
    run(
      `INSERT INTO sources (id, project_id, kind, name, ref, visibility, status, meta, created_by, created_at)
       VALUES (?, ?, 'document', ?, ?, ?, 'connecting', '{}', ?, ?)`,
      sourceId,
      context.project.id,
      filename,
      filename,
      visibility,
      req.user.id,
      now(),
    );
    try {
      importDocument(context.project.id, sourceId, {
        filename,
        title: req.body?.title,
        body: req.body.body,
        author: req.user.name,
        visibility,
      });
      audit(context.project.id, req.user.id, 'source.document', sourceId, `${filename} (${visibility})`);
      return res.status(201).json({ sourceId, imported: 1 });
    } catch (error) {
      run('UPDATE sources SET status = ?, meta = ? WHERE id = ?', 'error', JSON.stringify({ error: error.message }), sourceId);
      return res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/projects/:projectId/sources/:sourceId', (req, res) => {
    const context = projectContext(req, res, 'source:connect');
    if (!context) return;
    const source = get('SELECT * FROM sources WHERE id = ? AND project_id = ?', req.params.sourceId, context.project.id);
    if (!source) return res.status(404).json({ error: 'Source not found' });

    // Revoking a source removes its records and any claim that loses all evidence.
    run('DELETE FROM evidence WHERE source_id = ?', source.id);
    run('DELETE FROM evidence WHERE record_id IN (SELECT id FROM source_records WHERE source_id = ?)', source.id);
    run('DELETE FROM claims WHERE project_id = ? AND id NOT IN (SELECT claim_id FROM evidence)', context.project.id);
    run(
      'DELETE FROM gaps WHERE project_id = ? AND claim_id IS NOT NULL AND claim_id NOT IN (SELECT id FROM claims WHERE project_id = ?)',
      context.project.id,
      context.project.id,
    );
    run('DELETE FROM gaps WHERE record_id IN (SELECT id FROM source_records WHERE source_id = ?)', source.id);
    run('DELETE FROM chunks WHERE source_id = ?', source.id);
    run('DELETE FROM source_records WHERE source_id = ?', source.id);
    run('DELETE FROM sources WHERE id = ?', source.id);
    audit(context.project.id, req.user.id, 'source.disconnect', source.id, source.name);
    return res.json({ ok: true });
  });

  app.post('/api/projects/:projectId/reconstruct', (req, res) => {
    const context = projectContext(req, res, 'reconstruct');
    if (!context) return;
    if (approvedSnapshot(context.project.id)) {
      return res.status(409).json({
        error: 'This project already has an approved handover. Create a new transition project before reconstructing again, so approved history is never silently rewritten.',
      });
    }
    let transitionUserId = req.body?.transitionUserId ?? context.project.transition_user_id;
    if (transitionUserId && !roleFor(transitionUserId, context.project.id)) {
      return res.status(400).json({ error: 'The departing member must be a member of this project' });
    }
    try {
      // Claims are rebuilt from scratch, so a re-run always reflects the current sources.
      run('DELETE FROM reviews WHERE claim_id IS NOT NULL AND claim_id IN (SELECT id FROM claims WHERE project_id = ?)', context.project.id);
      const summary = reconstruct(context.project.id, { transitionUserId });
      ensureHandover(context.project.id, { transitionUserId, createdBy: req.user.id });
      audit(
        context.project.id,
        req.user.id,
        'project.reconstruct',
        context.project.id,
        `${summary.claims} claims, ${summary.gaps} gaps from ${summary.records} records`,
      );
      res.json({ ...summary, summary: projectSummary(context.project.id, req.user.id, context.role) });
    } catch (error) {
      res.status(500).json({ error: `Reconstruction failed: ${error.message}` });
    }
  });

  app.get('/api/projects/:projectId/claims', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const includeRestricted = seesRestrictedSources(context.role);
    const filters = ['project_id = ?'];
    const params = [context.project.id];
    if (req.query.category) {
      filters.push('category = ?');
      params.push(String(req.query.category));
    }
    if (req.query.status) {
      filters.push('status = ?');
      params.push(String(req.query.status));
    }
    const claims = all(`SELECT * FROM claims WHERE ${filters.join(' AND ')} ORDER BY created_at`, ...params).map((claim) => {
      const evidence = claimEvidence(claim.id, { includeRestricted });
      return {
        id: claim.id,
        category: claim.category,
        categoryLabel: CLAIM_CATEGORIES[claim.category] ?? claim.category,
        text: claim.text,
        component: claim.component,
        status: claim.status,
        evidenceStrength: claim.evidence_strength,
        signal: claim.signal,
        reviewNote: claim.review_note,
        reviewer: claim.reviewer_id ? get('SELECT name FROM users WHERE id = ?', claim.reviewer_id)?.name ?? null : null,
        evidence,
        restrictedOnly: evidence.length === 0,
      };
    });
    res.json({ claims, categories: CLAIM_CATEGORIES });
  });

  app.get('/api/projects/:projectId/claims/:claimId', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const claim = get('SELECT * FROM claims WHERE id = ? AND project_id = ?', req.params.claimId, context.project.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json({
      claim: {
        id: claim.id,
        category: claim.category,
        categoryLabel: CLAIM_CATEGORIES[claim.category] ?? claim.category,
        text: claim.text,
        component: claim.component,
        status: claim.status,
        evidenceStrength: claim.evidence_strength,
        reviewNote: claim.review_note,
      },
      evidence: claimEvidence(claim.id, { includeRestricted: seesRestrictedSources(context.role) }),
    });
  });

  app.post('/api/projects/:projectId/claims/:claimId/review', (req, res) => {
    const context = projectContext(req, res, 'claim:review');
    if (!context) return;
    const claim = get('SELECT * FROM claims WHERE id = ? AND project_id = ?', req.params.claimId, context.project.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const action = String(req.body?.action ?? '');
    if (!['verify', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({ error: 'action must be verify, reject or edit' });
    }
    const comment = String(req.body?.comment ?? '').trim() || null;
    let text = claim.text;

    if (action === 'verify') {
      run("UPDATE claims SET status = 'verified', reviewer_id = ?, reviewed_at = ?, review_note = ? WHERE id = ?", req.user.id, now(), comment, claim.id);
    } else if (action === 'reject') {
      if (!comment) return res.status(400).json({ error: 'A rejection reason is required' });
      run("UPDATE claims SET status = 'rejected', reviewer_id = ?, reviewed_at = ?, review_note = ? WHERE id = ?", req.user.id, now(), comment, claim.id);
    } else {
      text = String(req.body?.text ?? '').trim();
      if (text.length < 12) return res.status(400).json({ error: 'Corrected claim text is too short' });
      run("UPDATE claims SET status = 'edited', text = ?, reviewer_id = ?, reviewed_at = ?, review_note = ? WHERE id = ?", text, req.user.id, now(), comment, claim.id);
    }

    run(
      'INSERT INTO reviews (id, handover_id, claim_id, reviewer_id, action, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('rev'),
      get('SELECT id FROM handovers WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', context.project.id)?.id ?? null,
      claim.id,
      req.user.id,
      action,
      comment,
      now(),
    );
    audit(context.project.id, req.user.id, `claim.${action}`, claim.id, comment ?? '');

    res.json({
      claim: {
        id: claim.id,
        status: get('SELECT status FROM claims WHERE id = ?', claim.id).status,
        text: get('SELECT text FROM claims WHERE id = ?', claim.id).text,
        reviewer: req.user.name,
        reviewNote: comment,
      },
    });
  });

  app.get('/api/projects/:projectId/gaps', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const includeRestricted = seesRestrictedSources(context.role);
    const gaps = all('SELECT * FROM gaps WHERE project_id = ? ORDER BY created_at', context.project.id)
      .filter((gap) => includeRestricted || !gap.restricted)
      .map((gap) => ({
        id: gap.id,
        kind: gap.kind,
        severity: gap.severity,
        title: gap.title,
        detail: gap.detail,
        claimId: gap.claim_id,
        recordId: gap.record_id,
        restricted: Boolean(gap.restricted),
        status: gap.status,
      }));
    res.json({ gaps });
  });

  app.get('/api/projects/:projectId/handover', (req, res) => {
    const context = projectContext(req, res);
    if (!context) return;
    if (can(context.role, 'handover:read-draft')) {
      const content = buildHandover(context.project.id, {
        viewerAllowsRestricted: seesRestrictedSources(context.role),
      });
      return res.json({
        status: content.meta.status,
        version: content.meta.version,
        content,
        canApprove: can(context.role, 'handover:approve'),
        canReview: can(context.role, 'claim:review'),
      });
    }
    const approved = approvedSnapshot(context.project.id);
    if (!approved) {
      return res.status(403).json({ error: 'The handover has not been approved yet. Ask your reviewer to approve it.' });
    }
    return res.json({
      status: 'approved',
      version: approved.version,
      approvedAt: approved.approved_at,
      content: parseJson(approved.content, {}),
      canApprove: false,
      canReview: false,
    });
  });

  app.post('/api/projects/:projectId/handover/approve', (req, res) => {
    const context = projectContext(req, res, 'handover:approve');
    if (!context) return;
    const claimCount = get('SELECT COUNT(*) AS count FROM claims WHERE project_id = ?', context.project.id)?.count ?? 0;
    if (claimCount === 0) return res.status(400).json({ error: 'There is nothing to approve yet. Run reconstruction first.' });
    try {
      const result = approveHandover({
        projectId: context.project.id,
        userId: req.user.id,
        summary: String(req.body?.summary ?? '').trim() || null,
      });
      audit(context.project.id, req.user.id, 'handover.approve', result.versionId, `version ${result.version}`);
      res.json({
        version: result.version,
        pendingClaims: result.pendingClaims,
        excludedClaims: result.excludedClaims,
        metrics: result.content.metrics,
      });
    } catch (error) {
      res.status(500).json({ error: `Approval failed: ${error.message}` });
    }
  });

  app.get('/api/projects/:projectId/handover/versions', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const versions = all(
      `SELECT v.version, v.summary, v.pending_claims, v.excluded_claims, v.created_at, v.approved_at, u.name AS approved_by
         FROM handover_versions v
         JOIN handovers h ON h.id = v.handover_id
         LEFT JOIN users u ON u.id = v.created_by
        WHERE h.project_id = ?
        ORDER BY v.version DESC`,
      context.project.id,
    );
    res.json({ versions });
  });

  app.get('/api/projects/:projectId/records/:recordId', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    const record = get('SELECT * FROM source_records WHERE id = ? AND project_id = ?', req.params.recordId, context.project.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const source = get('SELECT * FROM sources WHERE id = ?', record.source_id);
    if (source?.visibility === 'restricted' && !seesRestrictedSources(context.role)) {
      audit(context.project.id, req.user.id, 'evidence.access_denied', record.id, `${source.name} is restricted`);
      return res.status(403).json({ error: 'This source is restricted for your role.' });
    }
    if (source?.visibility === 'restricted') {
      audit(context.project.id, req.user.id, 'evidence.access', record.id, source.name);
    }
    res.json({
      record: {
        id: record.id,
        type: record.type,
        title: record.title,
        body: record.body,
        author: record.author,
        state: record.state,
        url: record.url,
        externalId: record.external_id,
        occurredAt: record.occurred_at,
        metadata: parseJson(record.metadata),
      },
      source: source ? { name: source.name, kind: source.kind, visibility: source.visibility } : null,
    });
  });

  app.get('/api/projects/:projectId/relationships', (req, res) => {
    const context = projectContext(req, res, 'handover:read-draft');
    if (!context) return;
    res.json({
      relationships: all('SELECT from_type, from_name, type, to_type, to_name FROM relationships WHERE project_id = ?', context.project.id),
      components: all("SELECT name, metadata FROM entities WHERE project_id = ? AND type = 'component'", context.project.id).map((row) => ({
        name: row.name,
        ...parseJson(row.metadata),
      })),
    });
  });

  app.post('/api/projects/:projectId/assistant', async (req, res) => {
    const context = projectContext(req, res);
    if (!context) return;
    const question = String(req.body?.question ?? '').trim();
    if (!question) return res.status(400).json({ error: 'Ask a question first' });
    const result = await answerQuestion({ projectId: context.project.id, question });
    audit(context.project.id, req.user.id, 'assistant.ask', null, question.slice(0, 160));
    res.json(result);
  });

  app.get('/api/projects/:projectId/audit', (req, res) => {
    const context = projectContext(req, res, 'audit:read');
    if (!context) return;
    res.json({ entries: auditTrail(context.project.id) });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

  // The React client is built into dist/. In development run `npm run dev` instead.
  const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const indexFile = join(distDir, 'index.html');
  if (existsSync(indexFile)) {
    // Hashed assets can be cached, but the shell must never be: a stale
    // index.html points at asset names a rebuild has already deleted.
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => res.sendFile(indexFile, { headers: { 'Cache-Control': 'no-store, must-revalidate' } }));
  } else {
    app.get('*', (req, res) =>
      res
        .status(503)
        .type('text/plain')
        .send('ContextBridge UI is not built. Run "npm run build", or "npm run dev" for the Vite dev server.'),
    );
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('[contextbridge]', error);
    return res.status(500).json({ error: error.message ?? 'Unexpected server error' });
  });

  return app;
}

export { createUser, addMember };
