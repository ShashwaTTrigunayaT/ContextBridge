// Knowledge-gap and risk detection (blueprint §5).
// Deterministic, relationship-aware checks run first; an LLM is never required
// for a gap to exist. Each gap keeps a pointer back to the record or claim.

import { parseJson } from './db.js';
import { componentFromPath } from './ingest.js';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export { SEVERITY_RANK };

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;

const DURATION_PATTERN = /(\d+)\s*(hour|hours|day|days|week|weeks)\b/gi;
const durationHours = (value, unit) => {
  const n = Number(value);
  if (/hour/i.test(unit)) return n;
  if (/day/i.test(unit)) return n * 24;
  return n * 168;
};

const TOPICS = ['idempotency', 'retry', 'webhook', 'settlement', 'token', 'session', 'metrics'];

function topicsOf(text) {
  const lower = String(text ?? '').toLowerCase();
  return TOPICS.filter((topic) => lower.includes(topic));
}

function evidenceRecords(claim) {
  return (claim.evidence ?? []).map((item) => item.sourceId).filter(Boolean);
}

export function detectGaps({ project, records, sources, claims, components, transitionUser }) {
  const gaps = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const recordByExternalId = new Map(records.map((record) => [record.external_id, record]));
  const restrictedSources = new Set(sources.filter((source) => source.visibility === 'restricted').map((source) => source.id));
  const transitionName = transitionUser?.name ?? 'the departing member';
  const isRestricted = (claim) => evidenceRecords(claim).some((sourceId) => restrictedSources.has(sourceId));

  const push = (gap) => {
    const duplicate = gaps.some((existing) => existing.kind === gap.kind && existing.title === gap.title);
    if (!duplicate) gaps.push(gap);
  };

  // 1. Open work without an owner.
  for (const record of records) {
    const meta = parseJson(record.metadata);
    if (record.type !== 'issue' || record.state !== 'open') continue;
    const assignees = meta.assignees ?? [];
    if (assignees.length > 0) continue;
    const labels = (meta.labels ?? []).map((label) => String(label).toLowerCase());
    const risky = labels.some((label) => ['risk', 'blocked', 'critical', 'security'].includes(label));
    push({
      kind: 'unassigned_task',
      severity: risky ? 'high' : 'medium',
      title: `Issue #${meta.number} has no owner`,
      detail: `${record.title}. Nobody is assigned, so the work will be unattended after the handover.`,
      record_id: record.id,
      refs: { issueNumber: meta.number, topic: record.title },
    });
  }

  // 2. Open pull requests waiting on review, or left as drafts.
  for (const record of records) {
    const meta = parseJson(record.metadata);
    if (record.type !== 'pull_request' || record.state !== 'open') continue;
    if (meta.draft) {
      push({
        kind: 'incomplete_implementation',
        severity: 'low',
        title: `PR #${meta.number} is still a draft`,
        detail: `${record.title}. The change is not ready for review and will be orphaned by the transition.`,
        record_id: record.id,
        refs: { prNumber: meta.number, topic: record.title },
      });
    } else if (!meta.reviews) {
      push({
        kind: 'awaiting_review',
        severity: 'medium',
        title: `PR #${meta.number} has no review`,
        detail: `${record.title} is open with no reviewer assigned. Unreviewed changes rarely survive a handover.`,
        record_id: record.id,
        refs: { prNumber: meta.number, topic: record.title },
      });
    }
  }

  // 3. Stale open work.
  for (const record of records) {
    if (record.state !== 'open') continue;
    const idle = Math.round(daysSince(record.occurred_at));
    if (idle < 45) continue;
    const meta = parseJson(record.metadata);
    const ref = meta.number ? `${record.type === 'issue' ? 'Issue' : 'PR'} #${meta.number}` : record.external_id;
    push({
      kind: 'stale_work',
      severity: 'medium',
      title: `${ref} has been idle for ${idle} days`,
      detail: `${record.title}. Confirm whether this work is still wanted before it is transferred.`,
      record_id: record.id,
      refs: { topic: record.title },
    });
  }

  // 4. Unresolved questions extracted from the records.
  for (const claim of claims.filter((item) => item.category === 'question' && item.status !== 'rejected')) {
    push({
      kind: 'unresolved_question',
      severity: 'medium',
      title: `Unresolved: ${claim.text.replace(/\s+/g, ' ').slice(0, 90)}`,
      detail: claim.text,
      claim_id: claim.id,
      restricted: isRestricted(claim) ? 1 : 0,
      refs: { topic: claim.text },
    });
  }

  // 5. Ownership concentration: components only the departing member knows.
  const soleComponents = components
    .map((component) => {
      const others = component.contributors.filter((person) => person.name !== transitionName);
      const departing = component.contributors.find((person) => person.name === transitionName);
      return { ...component, others, departing };
    })
    .filter((component) => component.departing && component.others.length === 0)
    .sort((a, b) => b.records - a.records)
    .slice(0, 2);

  for (const component of soleComponents) {
    push({
      kind: 'ownership_gap',
      severity: 'high',
      title: `${component.name} has no maintainer other than ${transitionName}`,
      detail: `${component.records} record(s) touch ${component.name} and every contribution comes from ${transitionName}. Nobody else can review changes to this area.`,
      refs: { component: component.name },
    });
  }

  // 6. Open issues referenced as blockers/dependencies from other claims.
  const blockedIssues = new Set();
  for (const claim of claims) {
    if (!['blocker', 'dependency'].includes(claim.category)) continue;
    const reference = /#(\d+)/.exec(claim.text);
    if (!reference) continue;
    const issue = recordByExternalId.get(`issue/${reference[1]}`);
    if (!issue || issue.state !== 'open' || blockedIssues.has(reference[1])) continue;
    blockedIssues.add(reference[1]);
    push({
      kind: 'dependency_risk',
      severity: 'high',
      title: `Open work depends on unresolved issue #${reference[1]}`,
      detail: `${claim.text} Issue #${reference[1]} “${issue.title}” is still open.`,
      claim_id: claim.id,
      record_id: issue.id,
      refs: { issueNumber: Number(reference[1]), topic: issue.title },
    });
  }

  // 7. Conflicting quantitative facts (for example two different retention windows).
  const durationClaims = claims
    .filter((claim) => claim.status !== 'rejected')
    .map((claim) => {
      const matches = [...String(claim.text).matchAll(DURATION_PATTERN)].map((match) => durationHours(match[1], match[2]));
      return { claim, values: [...new Set(matches)], topics: topicsOf(claim.text) };
    })
    .filter((entry) => entry.values.length === 1 && entry.topics.length > 0);

  for (let i = 0; i < durationClaims.length; i += 1) {
    for (let j = i + 1; j < durationClaims.length; j += 1) {
      const left = durationClaims[i];
      const right = durationClaims[j];
      const shared = left.topics.filter((topic) => right.topics.includes(topic));
      if (shared.length === 0) continue;
      if (left.values[0] === right.values[0]) continue;
      const restricted = isRestricted(left.claim) || isRestricted(right.claim) ? 1 : 0;
      push({
        kind: 'conflicting_information',
        severity: 'high',
        title: `Conflicting ${shared[0]} retention values`,
        detail: `“${left.claim.text.slice(0, 140)}” conflicts with “${right.claim.text.slice(0, 140)}”.`,
        claim_id: left.claim.id,
        restricted,
        refs: { topic: shared[0], conflictClaimId: right.claim.id },
      });
      break;
    }
  }

  // 8. Conflicting implementation strategy for the same component.
  const strategyClaims = claims.filter((claim) => claim.status !== 'rejected' && claim.component);
  const byComponent = new Map();
  for (const claim of strategyClaims) {
    if (!byComponent.has(claim.component)) byComponent.set(claim.component, []);
    byComponent.get(claim.component).push(claim);
  }
  for (const [component, componentClaims] of byComponent) {
    const backoff = componentClaims.find((claim) => /exponential backoff/i.test(claim.text) && !/fixed .*interval/i.test(claim.text));
    const fixed = componentClaims.find((claim) => /fixed .*interval/i.test(claim.text) && !/exponential backoff/i.test(claim.text));
    if (!backoff || !fixed) continue;
    push({
      kind: 'conflicting_information',
      severity: 'high',
      title: `Two retry strategies recorded for ${component}`,
      detail: `One record describes exponential backoff, another describes a fixed interval. Only one can be correct in production.`,
      claim_id: backoff.id,
      restricted: isRestricted(backoff) || isRestricted(fixed) ? 1 : 0,
      refs: { topic: 'retry strategy', component, conflictClaimId: fixed.id },
    });
  }

  // 9. Decisions with weak evidence.
  for (const claim of claims.filter((claim) => claim.category === 'decision' && claim.evidence_strength === 'low')) {
    push({
      kind: 'ambiguous_decision',
      severity: 'medium',
      title: `Decision recorded in only one place: ${claim.text.slice(0, 70)}`,
      detail: 'A single unconfirmed record supports this decision. Confirm the reasoning before it is treated as settled.',
      claim_id: claim.id,
      restricted: isRestricted(claim) ? 1 : 0,
      refs: { topic: claim.text },
    });
  }

  // 10. Important components with no documentation.
  for (const component of components) {
    if (component.records < 3) continue;
    const documented = records.some(
      (record) =>
        record.type === 'document' &&
        (String(record.body ?? '').toLowerCase().includes(component.name) ||
          String(record.body ?? '').toLowerCase().includes(component.name.split('/')[1])),
    );
    if (documented) continue;
    push({
      kind: 'missing_documentation',
      severity: 'low',
      title: `${component.name} has no written documentation`,
      detail: `${component.records} record(s) touch ${component.name}, but no document explains why it works this way.`,
      refs: { component: component.name },
    });
  }

  return gaps
    .map((gap) => ({ restricted: 0, ...gap }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function componentIndex(records) {
  const index = new Map();
  for (const record of records) {
    const meta = parseJson(record.metadata);
    const names = new Set();
    for (const file of meta.files ?? []) {
      const component = componentFromPath(file);
      if (component) names.add(component);
    }
    for (const name of names) {
      if (!index.has(name)) index.set(name, { name, records: 0, contributors: new Map(), recordIds: [] });
      const entry = index.get(name);
      entry.records += 1;
      entry.recordIds.push(record.id);
      if (record.author) entry.contributors.set(record.author, (entry.contributors.get(record.author) ?? 0) + 1);
    }
  }
  return [...index.values()]
    .map((entry) => ({
      name: entry.name,
      records: entry.records,
      recordIds: entry.recordIds,
      contributors: [...entry.contributors.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.records - a.records);
}
