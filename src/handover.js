// Handover draft generation and the human approval step (blueprint §5 modules 6-7).

import { all, get, json, now, parseJson, run, uid } from './db.js';
import { STRENGTH_RANK } from './extract.js';
import { SEVERITY_RANK } from './gaps.js';

const SECTION_FOR = {
  completed: 'workCompleted',
  responsibility: 'responsibilities',
  unfinished: 'unfinishedWork',
  in_progress: 'unfinishedWork',
  blocker: 'unfinishedWork',
  decision: 'decisions',
  dependency: 'dependencies',
  risk: 'risks',
  question: 'openQuestions',
  next_action: 'nextActions',
};

export const SECTION_TITLES = {
  workCompleted: 'Work completed',
  responsibilities: 'Responsibilities',
  unfinishedWork: 'Unfinished work',
  decisions: 'Technical decisions',
  dependencies: 'Dependencies',
  risks: 'Known risks',
  openQuestions: 'Unresolved questions',
  nextActions: 'Next actions',
};

export function ensureHandover(projectId, { transitionUserId, createdBy } = {}) {
  const existing = get('SELECT * FROM handovers WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', projectId);
  if (existing) {
    if (transitionUserId && existing.transition_user_id !== transitionUserId) {
      run('UPDATE handovers SET transition_user_id = ? WHERE id = ?', transitionUserId, existing.id);
      existing.transition_user_id = transitionUserId;
    }
    return existing;
  }
  const id = uid('hnd');
  run(
    `INSERT INTO handovers (id, project_id, transition_user_id, status, current_version, created_by, created_at)
     VALUES (?, ?, ?, 'draft', 0, ?, ?)`,
    id,
    projectId,
    transitionUserId ?? null,
    createdBy ?? null,
    now(),
  );
  return get('SELECT * FROM handovers WHERE id = ?', id);
}

function loadEvidence(projectId) {
  const rows = all(
    `SELECT e.id, e.claim_id, e.record_id, e.source_id, e.location, e.excerpt,
            s.name AS source_name, s.visibility AS source_visibility,
            r.type AS record_type, r.title AS record_title, r.external_id, r.url
       FROM evidence e
       LEFT JOIN sources s ON s.id = e.source_id
       LEFT JOIN source_records r ON r.id = e.record_id
      WHERE e.claim_id IN (SELECT id FROM claims WHERE project_id = ?)
      ORDER BY e.added_at`,
    projectId,
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.claim_id)) grouped.set(row.claim_id, []);
    grouped.get(row.claim_id).push(row);
  }
  return grouped;
}

function mapEvidence(row, includeRestricted) {
  if (!includeRestricted && row.source_visibility === 'restricted') return null;
  return {
    sourceName: row.source_name,
    sourceVisibility: row.source_visibility,
    recordType: row.record_type,
    recordTitle: row.record_title,
    externalId: row.external_id,
    url: row.url,
    location: row.location,
    excerpt: row.excerpt,
  };
}

export function buildHandover(projectId, { viewerAllowsRestricted = false, forShared = false } = {}) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) throw new Error('Project not found');
  const handover = get('SELECT * FROM handovers WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', projectId);
  const transitionUser = handover?.transition_user_id
    ? get('SELECT id, name, email, title FROM users WHERE id = ?', handover.transition_user_id)
    : null;

  const sources = all('SELECT * FROM sources WHERE project_id = ?', projectId);
  const records = all('SELECT * FROM source_records WHERE project_id = ? ORDER BY occurred_at', projectId);
  const claims = all('SELECT * FROM claims WHERE project_id = ? ORDER BY created_at', projectId);
  const evidenceByClaim = loadEvidence(projectId);
  const recordSources = new Map(records.map((record) => [record.id, record.source_id]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const components = all("SELECT * FROM entities WHERE project_id = ? AND type = 'component'", projectId).map((row) => ({
    name: row.name,
    ...parseJson(row.metadata),
  }));

  const sections = {
    workCompleted: [],
    responsibilities: [],
    unfinishedWork: [],
    decisions: [],
    dependencies: [],
    risks: [],
    openQuestions: [],
    nextActions: [],
  };

  let excludedRestricted = 0;
  let evidenceCoverage = 0;
  let corroborated = 0;
  let reviewed = 0;
  let pending = 0;
  let rejected = 0;

  for (const claim of claims) {
    if (claim.status === 'rejected') {
      rejected += 1;
      continue;
    }
    if (claim.status === 'pending') pending += 1;
    else reviewed += 1;

    const rawEvidence = evidenceByClaim.get(claim.id) ?? [];
    const restrictedOnly = rawEvidence.length > 0 && rawEvidence.every((row) => row.source_visibility === 'restricted');
    const originSourceId = claim.record_id ? recordSources.get(claim.record_id) : null;
    const restrictedOrigin = Boolean(originSourceId && sourceById.get(originSourceId)?.visibility === 'restricted');

    // A shared handover never carries a claim derived from a restricted source,
    // and never carries a restricted excerpt even as corroboration.
    if (forShared ? restrictedOrigin || restrictedOnly : restrictedOnly && !viewerAllowsRestricted) {
      excludedRestricted += 1;
      continue;
    }

    const evidence = rawEvidence.map((row) => mapEvidence(row, viewerAllowsRestricted && !forShared)).filter(Boolean);
    if (evidence.length === 0) {
      excludedRestricted += 1;
      continue;
    }

    if (rawEvidence.length > 0) evidenceCoverage += 1;
    const distinctSources = new Set(rawEvidence.map((row) => row.source_id)).size;
    if (distinctSources >= 2) corroborated += 1;

    const section = SECTION_FOR[claim.category];
    if (!section) continue;

    sections[section].push({
      id: claim.id,
      text: claim.text,
      category: claim.category,
      component: claim.component,
      verification: claim.status,
      evidenceStrength: claim.evidence_strength,
      restrictedOnly,
      reviewNote: claim.review_note ?? null,
      evidence,
    });
  }

  for (const key of Object.keys(sections)) {
    sections[key].sort((a, b) => {
      const strength = (STRENGTH_RANK[a.evidenceStrength] ?? 3) - (STRENGTH_RANK[b.evidenceStrength] ?? 3);
      if (strength !== 0) return strength;
      return a.verification === 'pending' ? 1 : -1;
    });
  }

  const gaps = all('SELECT * FROM gaps WHERE project_id = ? ORDER BY created_at', projectId)
    .filter((gap) => gap.status === 'open')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .map((gap) => {
      const redacted = Boolean(gap.restricted) && (forShared || !viewerAllowsRestricted);
      return {
        id: gap.id,
        kind: gap.kind,
        severity: gap.severity,
        title: redacted ? 'Conflicting or restricted records need reviewer attention' : gap.title,
        detail: redacted
          ? 'This gap is supported only by a restricted source. An administrator must review it before it can be shared.'
          : gap.detail,
        restricted: Boolean(gap.restricted),
      };
    });

  const dates = records.map((record) => record.occurred_at).filter(Boolean).sort();
  const people = all("SELECT * FROM entities WHERE project_id = ? AND type = 'person'", projectId).map((row) => row.name);

  const content = {
    meta: {
      project: { id: project.id, name: project.name, description: project.description },
      transitionUser: transitionUser
        ? { id: transitionUser.id, name: transitionUser.name, title: transitionUser.title }
        : null,
      generatedAt: now(),
      handoverId: handover?.id ?? null,
      status: handover?.status ?? 'draft',
      version: handover?.current_version ?? 0,
      viewerAllowsRestricted,
      forShared,
    },
    overview: {
      description: project.description,
      // A shared copy does not name the restricted sources it drew from.
      sources: sources
        .filter((source) => !(forShared && source.visibility === 'restricted'))
        .map((source) => ({
          name: source.name,
          kind: source.kind,
          visibility: source.visibility,
          status: source.status,
        })),
      records: records.length,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      components,
      contributors: people,
      counts: { claims: claims.length, reviewed, pending, rejected, excludedRestricted, gaps: gaps.length },
    },
    sections,
    gaps,
    metrics: {
      claimsWithEvidence: evidenceCoverage,
      evidenceCoverage: claims.length ? Math.round((evidenceCoverage / claims.length) * 100) : 0,
      corroborated,
      corroborationRate: claims.length ? Math.round((corroborated / claims.length) * 100) : 0,
      reviewed,
      pending,
      rejected,
      excludedRestricted,
    },
  };

  return content;
}

export function approveHandover({ projectId, userId, summary }) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) throw new Error('Project not found');
  const handover = ensureHandover(projectId, { transitionUserId: project.transition_user_id, createdBy: userId });

  const shared = buildHandover(projectId, { viewerAllowsRestricted: true, forShared: true });
  const pendingClaims = shared.metrics.pending;
  const excludedClaims = shared.metrics.excludedRestricted;
  const version = (handover.current_version ?? 0) + 1;
  const versionId = uid('ver');

  run(
    `INSERT INTO handover_versions
       (id, handover_id, version, content, summary, pending_claims, excluded_claims, created_by, created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    versionId,
    handover.id,
    version,
    json(shared),
    summary ?? null,
    pendingClaims,
    excludedClaims,
    userId,
    now(),
    now(),
  );
  run('UPDATE handovers SET status = ?, current_version = ? WHERE id = ?', 'approved', version, handover.id);
  run(
    'INSERT INTO reviews (id, handover_id, claim_id, reviewer_id, action, comment, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
    uid('rev'),
    handover.id,
    userId,
    'approve_handover',
    summary ?? null,
    now(),
  );

  return { versionId, version, pendingClaims, excludedClaims, content: shared };
}

export function approvedSnapshot(projectId) {
  return get(
    `SELECT v.* FROM handover_versions v
       JOIN handovers h ON h.id = v.handover_id
      WHERE h.project_id = ? AND h.status = 'approved'
      ORDER BY v.version DESC LIMIT 1`,
    projectId,
  );
}
