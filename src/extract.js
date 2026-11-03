// Project-state reconstruction and evidence-linked claim extraction (blueprint §5, §7.4).
//
// Deliberately deterministic: patterns plus record state produce candidate claims,
// and every claim is linked to the excerpts that support it. Lexical overlap with
// inverse-document-frequency weighting stands in for embeddings, so the pipeline
// runs with no vector database and no model provider.

import { all, get, json, now, parseJson, run, uid } from './db.js';
import { componentIndex, detectGaps, SEVERITY_RANK } from './gaps.js';
import { componentFromPath } from './ingest.js';

export const CLAIM_CATEGORIES = {
  decision: 'Technical decision',
  completed: 'Work completed',
  in_progress: 'Work in progress',
  unfinished: 'Unfinished work',
  blocker: 'Blocker',
  dependency: 'Dependency',
  risk: 'Risk',
  responsibility: 'Responsibility',
  question: 'Open question',
  next_action: 'Next action',
};

const STOPWORDS = new Set(
  `about above after again against all also and any are been before being below between both but can cannot could did does doing down during each few for from further had has have having here how into its itself just more most must not now off once only other our out over own same should some such than that the their them then there these they this those through under until very was were what when where which while who why will with would you your added add fix fixed fixes new old used uses using make made take taken still also able back via per lot well much many yet ever never always only even though although because since so just like need needs needed`.split(
    /\s+/,
  ),
);

const CATEGORY_RULES = [
  {
    category: 'blocker',
    patterns: [/\bblocked (?:by|on)\b/i, /\bwaiting on\b/i, /\bcannot (?:ship|proceed|merge|be)\b/i, /\bblocks?\b/i],
  },
  {
    category: 'question',
    patterns: [/\bopen question\b/i, /\bunresolved\b/i, /\bwho owns\b/i, /\?\s*$/, /\bTBD\b/],
  },
  {
    category: 'responsibility',
    patterns: [/\bowns?\b/i, /\bmaintainer\b/i, /\bresponsible for\b/i, /\bassigned to\b/i],
  },
  {
    category: 'decision',
    patterns: [
      /\bwe (?:decided|chose|will (?:use|keep|reject|move|stay|retain))\b/i,
      /\bdecision\b/i,
      /\bADR-\d+\b/i,
      /\brationale\b/i,
      /\bconsistent with #\d+\b/i,
      /\bchose .+ over\b/i,
      /\bretain(?:ed|s)?\b.{0,60}\b\d+\s*(?:hour|hours|day|days|week|weeks)\b/i,
    ],
  },
  {
    category: 'risk',
    patterns: [
      /\brisk\b/i,
      /\bdouble[- ]charg/i,
      /\bnot (?:covered|tested|implemented|visible)\b/i,
      /\bno tests\b/i,
      /\bTODO\b/,
      /\btech(?:nical)? debt\b/i,
      /\bwould be hard to detect\b/i,
      /\bthundering herd\b/i,
    ],
  },
  {
    category: 'dependency',
    patterns: [/\bdepends on\b/i, /\brequires?\b/i, /\brelies on\b/i, /\bdependency\b/i],
  },
  {
    category: 'unfinished',
    patterns: [/\bTODO\b/i, /\bnot ready\b/i, /\bpending\b/i, /\bin progress\b/i, /\bWIP\b/i, /\btemporary\b/i, /\brevert it\b/i],
  },
];

const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function shorten(text, limit = 200) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

export function significantTerms(text) {
  return [...new Set(
    normalize(text)
      .split(' ')
      .filter((word) => word.length >= 5 && !STOPWORDS.has(word) && !/^\d+$/.test(word)),
  )].slice(0, 14);
}

function classify(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.category;
  }
  return null;
}

function recordLabel(record) {
  const meta = parseJson(record.metadata);
  if (record.type === 'document') return meta.filename ?? record.title ?? 'document';
  if (record.type === 'pull_request') return `PR #${meta.number ?? '?'}`;
  if (record.type === 'issue') return `Issue #${meta.number ?? '?'}`;
  if (record.type === 'commit') return `Commit ${meta.sha ?? record.external_id}`;
  if (record.type === 'review_comment') return meta.pullNumber ? `Review on PR #${meta.pullNumber}` : 'Review comment';
  return record.external_id;
}

function* sentencesOf(record) {
  for (const rawLine of String(record.body ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^(```|\||>)/.test(line)) continue;
    const cleaned = line.replace(/^[-*+]\s+/, '').replace(/^>\s*/, '').trim();
    if (!cleaned) continue;
    for (const sentence of cleaned.split(/(?<=[.!?])\s+/)) {
      const text = sentence.trim();
      if (text.length >= 25 && text.length <= 400) yield text;
    }
  }
}

function componentsFromText(text, known) {
  const found = new Set();
  const lower = String(text ?? '').toLowerCase();
  for (const name of known) {
    if (lower.includes(name)) found.add(name);
  }
  for (const match of lower.matchAll(/src\/[a-z0-9-]+\/[a-z0-9-]+/g)) {
    const component = componentFromPath(match[0]);
    if (component) found.add(component);
  }
  return [...found];
}

function buildLinker(chunks) {
  const df = new Map();
  const index = chunks.map((chunk) => {
    const terms = new Set(significantTerms(chunk.text));
    for (const term of terms) df.set(term, (df.get(term) ?? 0) + 1);
    return { chunk, terms };
  });

  return function link(claimText, ownRecordId) {
    const terms = significantTerms(claimText);
    if (terms.length === 0) return [];
    const scored = [];
    for (const entry of index) {
      if (entry.chunk.record_id === ownRecordId) continue;
      let score = 0;
      let rare = 0;
      for (const term of terms) {
        if (!entry.terms.has(term)) continue;
        score += 1;
        if ((df.get(term) ?? 0) <= 2) rare += 1;
      }
      score += rare * 1.5;
      if (score < 2) continue;
      scored.push({ chunk: entry.chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);

    const picked = [];
    const usedRecords = new Set();
    for (const item of scored) {
      if (picked.length >= 3) break;
      if (usedRecords.has(item.chunk.record_id)) continue;
      usedRecords.add(item.chunk.record_id);
      picked.push(item.chunk);
    }
    return picked;
  };
}

function strengthFor(sources, evidenceCount) {
  if (sources >= 2 && evidenceCount >= 3) return 'high';
  if (sources >= 2 || evidenceCount >= 2) return 'medium';
  return 'low';
}

const STRENGTH_RANK = { high: 0, medium: 1, low: 2 };
export { STRENGTH_RANK };

function actionTextFor(gap) {
  const refs = gap.refs ?? {};
  switch (gap.kind) {
    case 'unassigned_task':
      return `Assign an owner to issue #${refs.issueNumber} (“${shorten(refs.topic, 70)}”) and confirm the next step.`;
    case 'awaiting_review':
      return `Review PR #${refs.prNumber} (“${shorten(refs.topic, 70)}”) so it is not left unreviewed.`;
    case 'incomplete_implementation':
      return `Decide whether PR #${refs.prNumber} (“${shorten(refs.topic, 70)}”) should be finished or closed.`;
    case 'stale_work':
      return `Confirm whether “${shorten(refs.topic, 70)}” is still wanted before it is transferred.`;
    case 'unresolved_question':
      return `Get a recorded decision on: ${shorten(refs.topic, 110)}`;
    case 'ownership_gap':
      return `Name a new maintainer for ${refs.component} before the handover is shared.`;
    case 'dependency_risk':
      return `Unblock issue #${refs.issueNumber} (“${shorten(refs.topic, 70)}”) before continuing dependent work.`;
    case 'conflicting_information':
      return `Resolve the conflicting records about ${refs.topic} with a reviewer.`;
    case 'ambiguous_decision':
      return `Add supporting evidence for the decision: ${shorten(refs.topic, 90)}`;
    case 'missing_documentation':
      return `Write down why ${refs.component} works the way it does.`;
    default:
      return null;
  }
}

export function reconstruct(projectId, { transitionUserId } = {}) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) throw new Error('Project not found');

  const transitionId = transitionUserId ?? project.transition_user_id;
  const transitionUser = transitionId ? get('SELECT * FROM users WHERE id = ?', transitionId) : null;
  const sources = all('SELECT * FROM sources WHERE project_id = ?', projectId);
  const records = all('SELECT * FROM source_records WHERE project_id = ? ORDER BY occurred_at', projectId);
  const chunks = all('SELECT * FROM chunks WHERE project_id = ? ORDER BY ordinal', projectId);
  const components = componentIndex(records);
  const knownComponents = components.map((component) => component.name);

  // Derived data is rebuilt from the records each run.
  run('DELETE FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE project_id = ?)', projectId);
  run('DELETE FROM claims WHERE project_id = ?', projectId);
  run('DELETE FROM gaps WHERE project_id = ?', projectId);
  run('DELETE FROM relationships WHERE project_id = ?', projectId);
  run('DELETE FROM entities WHERE project_id = ?', projectId);

  if (transitionId && project.transition_user_id !== transitionId) {
    run('UPDATE projects SET transition_user_id = ? WHERE id = ?', transitionId, projectId);
  }

  const recordById = new Map(records.map((record) => [record.id, record]));
  const chunksByRecord = new Map();
  for (const chunk of chunks) {
    if (!chunksByRecord.has(chunk.record_id)) chunksByRecord.set(chunk.record_id, []);
    chunksByRecord.get(chunk.record_id).push(chunk);
  }
  const link = buildLinker(chunks);

  const componentForRecord = (record) => {
    const meta = parseJson(record.metadata);
    for (const file of meta.files ?? []) {
      const component = componentFromPath(file);
      if (component) return component;
    }
    const fromText = componentsFromText(`${record.title} ${record.body}`, knownComponents);
    return fromText[0] ?? null;
  };

  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    const key = `${candidate.category}:${normalize(candidate.text).slice(0, 100)}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, key });
  };

  // Sentence-level extraction.
  for (const record of records) {
    const component = componentForRecord(record);
    for (const sentence of sentencesOf(record)) {
      const category = classify(sentence);
      if (!category) continue;
      addCandidate({
        category,
        text: sentence,
        component: componentForRecord(record) ?? componentsFromText(sentence, knownComponents)[0] ?? component,
        signal: 'rule:sentence',
        record,
      });
    }
  }

  // State-level extraction: open work, completed work.
  for (const record of records) {
    const meta = parseJson(record.metadata);
    const component = componentForRecord(record);
    if (record.type === 'pull_request') {
      if (record.state === 'merged') {
        addCandidate({
          category: 'completed',
          text: `PR #${meta.number} “${record.title}” was merged.`,
          component,
          signal: 'state:merged_pull_request',
          record,
        });
      } else if (record.state === 'open' && meta.draft) {
        addCandidate({
          category: 'unfinished',
          text: `PR #${meta.number} “${record.title}” is still a draft pull request.`,
          component,
          signal: 'state:draft_pull_request',
          record,
        });
      } else if (record.state === 'open') {
        addCandidate({
          category: 'unfinished',
          text: `PR #${meta.number} “${record.title}” is open and has not been merged yet.`,
          component,
          signal: 'state:open_pull_request',
          record,
        });
      }
    }

    if (record.type === 'issue' && record.state === 'open') {
      const assignees = meta.assignees ?? [];
      addCandidate({
        category: 'unfinished',
        text: `Issue #${meta.number} “${record.title}” is open${assignees.length ? ` and assigned to ${assignees.join(', ')}` : ' with no assignee'}.`,
        component,
        signal: 'state:open_issue',
        record,
      });
    }

    if (record.type === 'commit' && /^(feat|fix|refactor)/i.test(record.title ?? '')) {
      addCandidate({
        category: 'completed',
        text: `Commit ${meta.sha ?? record.external_id} “${record.title}” was merged${meta.branch ? ` to ${meta.branch}` : ''}.`,
        component,
        signal: 'state:merged_commit',
        record,
      });
    }
  }

  const persistEvidence = (claimId, items) => {
    for (const item of items) {
      run(
        'INSERT INTO evidence (id, claim_id, record_id, source_id, location, excerpt, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        uid('evd'),
        claimId,
        item.recordId,
        item.sourceId,
        item.location,
        item.excerpt,
        now(),
      );
    }
  };

  const persistedClaims = [];
  for (const candidate of candidates) {
    const ownChunks = chunksByRecord.get(candidate.record.id) ?? [];
    const needle = normalize(candidate.text).slice(0, 40);
    const primary =
      ownChunks.find((chunk) => normalize(chunk.text).includes(needle)) ?? ownChunks[0] ?? null;

    const evidence = [];
    if (primary) {
      evidence.push({
        recordId: candidate.record.id,
        sourceId: candidate.record.source_id,
        location: `${recordLabel(candidate.record)} · excerpt ${primary.ordinal + 1}`,
        excerpt: shorten(primary.text, 320),
      });
    }
    for (const chunk of link(candidate.text, candidate.record.id)) {
      const record = recordById.get(chunk.record_id);
      evidence.push({
        recordId: chunk.record_id,
        sourceId: chunk.source_id,
        location: `${record ? recordLabel(record) : 'record'} · excerpt ${chunk.ordinal + 1}`,
        excerpt: shorten(chunk.text, 320),
      });
    }
    if (evidence.length === 0) continue;

    const distinctSources = new Set(evidence.map((item) => item.sourceId)).size;
    const strength = strengthFor(distinctSources, evidence.length);
    const claimId = uid('clm');
    run(
      `INSERT INTO claims
         (id, project_id, transition_user_id, record_id, category, text, component, status, evidence_strength, signal, claim_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      claimId,
      projectId,
      transitionId ?? null,
      candidate.record.id,
      candidate.category,
      candidate.text,
      candidate.component ?? null,
      strength,
      candidate.signal,
      candidate.key,
      now(),
    );
    persistEvidence(claimId, evidence);

    persistedClaims.push({
      id: claimId,
      project_id: projectId,
      record_id: candidate.record.id,
      category: candidate.category,
      text: candidate.text,
      component: candidate.component ?? null,
      status: 'pending',
      evidence_strength: strength,
      signal: candidate.signal,
      claim_key: candidate.key,
      evidence,
    });
  }

  // Gap and risk detection uses the reconstructed claims and relationships.
  const gaps = detectGaps({
    project,
    records,
    sources,
    claims: persistedClaims,
    components,
    transitionUser,
  });

  // Next actions derived from the most severe gaps, each carrying evidence.
  const claimById = new Map(persistedClaims.map((claim) => [claim.id, claim]));
  const actions = [];
  const actionKeys = new Set();
  for (const gap of [...gaps].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])) {
    if (actions.length >= 6) break;
    const text = actionTextFor(gap);
    if (!text) continue;
    const key = normalize(text).slice(0, 100);
    if (actionKeys.has(key)) continue;

    const evidence = [];
    const related = gap.claim_id ? claimById.get(gap.claim_id) : null;
    for (const item of related?.evidence ?? []) {
      if (!evidence.some((existing) => existing.recordId === item.recordId)) evidence.push({ ...item });
    }
    if (gap.record_id) {
      const record = recordById.get(gap.record_id);
      const chunk = (chunksByRecord.get(gap.record_id) ?? [])[0];
      if (record && chunk && !evidence.some((item) => item.recordId === record.id)) {
        evidence.push({
          recordId: record.id,
          sourceId: record.source_id,
          location: `${recordLabel(record)} · excerpt 1`,
          excerpt: shorten(chunk.text, 320),
        });
      }
    }
    if (evidence.length === 0) continue;

    actionKeys.add(key);
    const priority = SEVERITY_RANK[gap.severity] <= 1 ? 'P1' : SEVERITY_RANK[gap.severity] === 2 ? 'P2' : 'P3';
    actions.push({ text, priority, gap, evidence: evidence.slice(0, 3) });
  }

  for (const action of actions) {
    const claimId = uid('clm');
    const strength = strengthFor(new Set(action.evidence.map((item) => item.sourceId)).size, action.evidence.length);
    const originRecordId = action.gap.record_id ?? action.evidence[0]?.recordId ?? null;
    run(
      `INSERT INTO claims
         (id, project_id, transition_user_id, record_id, category, text, component, status, evidence_strength, signal, claim_key, created_at)
       VALUES (?, ?, ?, ?, 'next_action', ?, ?, 'pending', ?, 'derived:next_action', ?, ?)`,
      claimId,
      projectId,
      transitionId ?? null,
      originRecordId,
      `${action.priority} — ${action.text}`,
      action.gap.refs?.component ?? null,
      strength,
      `next_action:${normalize(action.text).slice(0, 100)}`,
      now(),
    );
    persistEvidence(claimId, action.evidence);
    persistedClaims.push({
      id: claimId,
      project_id: projectId,
      record_id: originRecordId,
      category: 'next_action',
      text: `${action.priority} — ${action.text}`,
      component: action.gap.refs?.component ?? null,
      status: 'pending',
      evidence_strength: strength,
      signal: 'derived:next_action',
      evidence: action.evidence,
    });
  }

  // Persist gaps.
  const gapRows = [];
  for (const gap of gaps) {
    const id = uid('gap');
    run(
      `INSERT INTO gaps (id, project_id, kind, severity, title, detail, claim_id, record_id, restricted, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      id,
      projectId,
      gap.kind,
      gap.severity,
      gap.title,
      gap.detail ?? null,
      gap.claim_id ?? null,
      gap.record_id ?? null,
      gap.restricted ?? 0,
      now(),
    );
    gapRows.push({ id, ...gap });
  }

  // Entities and relationships.
  for (const component of components) {
    run(
      'INSERT OR IGNORE INTO entities (id, project_id, type, name, metadata) VALUES (?, ?, ?, ?, ?)',
      uid('ent'),
      projectId,
      'component',
      component.name,
      json({ records: component.records, contributors: component.contributors }),
    );
    for (const person of component.contributors) {
      run(
        'INSERT OR IGNORE INTO entities (id, project_id, type, name, metadata) VALUES (?, ?, ?, ?, ?)',
        uid('ent'),
        projectId,
        'person',
        person.name,
        json({}),
      );
      run(
        `INSERT INTO relationships (id, project_id, from_type, from_name, type, to_type, to_name, record_id, created_at)
         VALUES (?, ?, 'person', ?, 'CONTRIBUTED_TO', 'component', ?, NULL, ?)`,
        uid('rel'),
        projectId,
        person.name,
        component.name,
        now(),
      );
    }
  }

  for (const record of records.slice(0, 80)) {
    const component = componentForRecord(record);
    if (!component) continue;
    run(
      `INSERT INTO relationships (id, project_id, from_type, from_name, type, to_type, to_name, record_id, created_at)
       VALUES (?, ?, 'record', ?, 'TOUCHES', 'component', ?, ?, ?)`,
      uid('rel'),
      projectId,
      recordLabel(record),
      component,
      record.id,
      now(),
    );
  }

  for (const claim of persistedClaims) {
    if (claim.category !== 'dependency' || !claim.component) continue;
    for (const target of componentsFromText(claim.text, knownComponents)) {
      if (target === claim.component) continue;
      run(
        `INSERT INTO relationships (id, project_id, from_type, from_name, type, to_type, to_name, record_id, created_at)
         VALUES (?, ?, 'component', ?, 'DEPENDS_ON', 'component', ?, NULL, ?)`,
        uid('rel'),
        projectId,
        claim.component,
        target,
        now(),
      );
    }
  }

  const byCategory = {};
  for (const claim of persistedClaims) {
    byCategory[claim.category] = (byCategory[claim.category] ?? 0) + 1;
  }

  return {
    projectId,
    records: records.length,
    sources: sources.length,
    claims: persistedClaims.length,
    gaps: gapRows.length,
    byCategory,
    components: components.map((component) => ({ name: component.name, records: component.records, contributors: component.contributors })),
    transitionUser: transitionUser ? { id: transitionUser.id, name: transitionUser.name } : null,
  };
}

export function claimEvidence(claimId, { includeRestricted }) {
  const rows = all(
    `SELECT e.id, e.record_id, e.source_id, e.location, e.excerpt,
            s.name AS source_name, s.visibility AS source_visibility,
            r.type AS record_type, r.title AS record_title, r.external_id, r.url
       FROM evidence e
       LEFT JOIN sources s ON s.id = e.source_id
       LEFT JOIN source_records r ON r.id = e.record_id
      WHERE e.claim_id = ?
      ORDER BY e.added_at`,
    claimId,
  );
  return rows
    .filter((row) => includeRestricted || row.source_visibility !== 'restricted')
    .map((row) => ({
      id: row.id,
      recordId: row.record_id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceVisibility: row.source_visibility,
      recordType: row.record_type,
      recordTitle: row.record_title,
      externalId: row.external_id,
      url: row.url,
      location: row.location,
      excerpt: row.excerpt,
    }));
}
