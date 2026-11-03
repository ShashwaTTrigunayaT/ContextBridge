// End-to-end checks for the workflow the blueprint says judges will test:
// reconstruction, evidence, gap detection, review, approval and permission-aware sharing.
//
// The project under test is the local fixture in test/fixtures.js — the product itself
// imports live GitHub repositories and ships no synthetic dataset.
//
// Run with: npm test

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

process.env.CONTEXTBRIDGE_DB = join(tmpdir(), `contextbridge-test-${Date.now()}.db`);

const { seedFixture, FIXTURE_ACCOUNTS, FIXTURE_PASSWORD } = await import('./fixtures.js');
const seed = seedFixture();
const { createApp } = await import('../src/api.js');

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const project = seed.projectId;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try {
    rmSync(process.env.CONTEXTBRIDGE_DB, { force: true });
  } catch {
    // A locked temp file on Windows is harmless.
  }
});

async function call(cookie, method, path, body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
}

async function login(email) {
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: FIXTURE_PASSWORD }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  const raw = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  return raw.split(';')[0];
}

const admin = await login(FIXTURE_ACCOUNTS.admin.email);
const reviewer = await login(FIXTURE_ACCOUNTS.reviewer.email);
const member = await login(FIXTURE_ACCOUNTS.incoming.email);

let claims = [];
let restrictedRecordId = null;
let rejectedText = null;

test('reconstruction produced claims, evidence and gaps', () => {
  assert.ok(seed.summary.records >= 10, 'expected source records');
  assert.ok(seed.summary.claims >= 12, 'expected extracted claims');
  assert.ok(seed.gaps >= 8, 'expected detected gaps');
});

test('every claim is linked to supporting evidence', async () => {
  const { status, data } = await call(admin, 'GET', `/projects/${project}/claims`);
  assert.equal(status, 200);
  claims = data.claims;
  assert.ok(claims.length >= 12);

  for (const claim of claims) {
    assert.ok(claim.evidence.length > 0, `claim has no evidence: ${claim.text}`);
  }

  const categories = new Set(claims.map((claim) => claim.category));
  for (const expected of ['decision', 'unfinished', 'risk', 'completed', 'next_action', 'question']) {
    assert.ok(categories.has(expected), `missing category ${expected}`);
  }

  const corroborated = claims.filter((claim) => new Set(claim.evidence.map((item) => item.sourceName)).size >= 2);
  assert.ok(corroborated.length >= 1, 'expected claims corroborated by two or more sources');

  const restricted = claims.flatMap((claim) => claim.evidence).find((item) => item.sourceVisibility === 'restricted');
  assert.ok(restricted, 'expected evidence from the restricted document');
  restrictedRecordId = restricted.recordId;
});

test('gaps cover ownership, review state, dependencies and conflicts', async () => {
  const { status, data } = await call(admin, 'GET', `/projects/${project}/gaps`);
  assert.equal(status, 200);
  const kinds = new Set(data.gaps.map((gap) => gap.kind));
  for (const expected of [
    'ownership_gap',
    'dependency_risk',
    'conflicting_information',
    'awaiting_review',
    'unassigned_task',
    'stale_work',
    'unresolved_question',
  ]) {
    assert.ok(kinds.has(expected), `missing gap kind ${expected}`);
  }
  const conflict = data.gaps.find((gap) => gap.kind === 'conflicting_information' && gap.restricted);
  assert.ok(conflict, 'expected a conflict gap that depends on a restricted source');
});

test('restricted sources are enforced server-side, not hidden in the UI', async () => {
  assert.ok(restrictedRecordId);

  const reviewerRead = await call(reviewer, 'GET', `/projects/${project}/records/${restrictedRecordId}`);
  assert.equal(reviewerRead.status, 403, 'reviewer must not read a restricted record');

  const adminRead = await call(admin, 'GET', `/projects/${project}/records/${restrictedRecordId}`);
  assert.equal(adminRead.status, 200);
  assert.ok(adminRead.data.record.body.length > 0);

  const memberClaims = await call(member, 'GET', `/projects/${project}/claims`);
  assert.equal(memberClaims.status, 403, 'incoming members cannot browse draft claims');

  const memberDraft = await call(member, 'GET', `/projects/${project}/handover`);
  assert.equal(memberDraft.status, 403, 'incoming members cannot see the draft');

  const memberApprove = await call(member, 'POST', `/projects/${project}/handover/approve`, { summary: 'nope' });
  assert.equal(memberApprove.status, 403);
});

test('reviewers can verify, correct and reject claims', async () => {
  const draftClaim = claims.find((claim) => claim.category === 'unfinished' && /still a draft|draft pull request/.test(claim.text));
  assert.ok(draftClaim, 'expected a draft pull request claim');
  rejectedText = draftClaim.text;

  const rejected = await call(reviewer, 'POST', `/projects/${project}/claims/${draftClaim.id}/review`, {
    action: 'reject',
    comment: 'Draft work was abandoned before the handover.',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.claim.status, 'rejected');

  const decision = claims.find((claim) => claim.category === 'decision' && /exponential backoff/i.test(claim.text));
  assert.ok(decision, 'expected the backoff decision claim');
  const verified = await call(reviewer, 'POST', `/projects/${project}/claims/${decision.id}/review`, { action: 'verify' });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.claim.status, 'verified');

  const risk = claims.find((claim) => claim.category === 'risk');
  assert.ok(risk, 'expected a risk claim');
  const corrected = await call(reviewer, 'POST', `/projects/${project}/claims/${risk.id}/review`, {
    action: 'edit',
    text: `${risk.text} (confirmed by reviewer)`,
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.claim.status, 'edited');

  const rejectionWithoutReason = await call(reviewer, 'POST', `/projects/${project}/claims/${claims[0].id}/review`, {
    action: 'reject',
  });
  assert.equal(rejectionWithoutReason.status, 400, 'rejections require a reason');
});

test('approval freezes a restricted-free shared handover', async () => {
  const approved = await call(reviewer, 'POST', `/projects/${project}/handover/approve`, {
    summary: 'Reviewed retry, ownership and dependency claims.',
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.version, 1);
  assert.ok(approved.data.excludedClaims >= 1, 'restricted-derived claims must be excluded from the shared copy');

  const snapshot = JSON.stringify(approved.data.content ?? {});
  assert.ok(!snapshot.includes('vendor-schedule'), 'restricted source name leaked into shared content');
  assert.ok(!snapshot.includes('Section 4.2'), 'restricted clause reference leaked into shared content');
  assert.ok(!snapshot.includes('duplicate settlement files'), 'restricted clause text leaked into shared content');
  assert.ok(!snapshot.includes(rejectedText), 'rejected claim leaked into shared content');

  const memberHandover = await call(member, 'GET', `/projects/${project}/handover`);
  assert.equal(memberHandover.status, 200);
  assert.equal(memberHandover.data.status, 'approved');
  assert.equal(memberHandover.data.version, 1);
  assert.equal(memberHandover.data.content.meta.forShared, true);

  const serialized = JSON.stringify(memberHandover.data.content);
  assert.ok(!serialized.includes('vendor-schedule'));
  assert.ok(!serialized.includes('Section 4.2'));
  assert.ok(!serialized.includes('duplicate settlement files'));

  const restrictedEvidence = Object.values(memberHandover.data.content.sections)
    .flat()
    .flatMap((item) => item.evidence)
    .find((evidence) => evidence.sourceVisibility === 'restricted');
  assert.equal(restrictedEvidence, undefined, 'member handover must not include restricted evidence');
  assert.ok(memberHandover.data.content.sections.nextActions.length > 0, 'member needs prioritized next actions');
  assert.ok(memberHandover.data.content.sections.unfinishedWork.length > 0);

  const versions = await call(admin, 'GET', `/projects/${project}/handover/versions`);
  assert.equal(versions.data.versions.length, 1);
  assert.equal(versions.data.versions[0].version, 1);

  const frozen = await call(admin, 'POST', `/projects/${project}/reconstruct`, {});
  assert.equal(frozen.status, 409, 'approved history must not be silently rewritten');
});

test('assistant answers only from the approved handover', async () => {
  const grounded = await call(member, 'POST', `/projects/${project}/assistant`, {
    question: 'What should I work on first?',
  });
  assert.equal(grounded.status, 200);
  assert.equal(grounded.data.insufficient, false);
  assert.ok(grounded.data.citations.length > 0);
  assert.ok(grounded.data.answer.length > 20);

  const unsupported = await call(member, 'POST', `/projects/${project}/assistant`, {
    question: 'What is the wifi password for the office?',
  });
  assert.equal(unsupported.status, 200);
  assert.equal(unsupported.data.insufficient, true);
  assert.equal(unsupported.data.reason, 'insufficient_evidence');
});

test('audit log records approvals and denied access', async () => {
  const { status, data } = await call(admin, 'GET', `/projects/${project}/audit`);
  assert.equal(status, 200);
  const actions = data.entries.map((entry) => entry.action);
  assert.ok(actions.includes('handover.approve'));
  assert.ok(actions.includes('claim.reject'));
  assert.ok(actions.includes('evidence.access_denied'));
});
