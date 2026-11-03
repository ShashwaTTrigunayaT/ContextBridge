// Test fixture: a small, self-contained project used only by the test suite.
// It is not shipped with the app and is never seeded into a real workspace — the
// running product imports live GitHub repositories only.

import { get, now, run, uid } from '../src/db.js';
import { addMember, createUser } from '../src/auth.js';
import { importDocument, upsertRecord } from '../src/ingest.js';
import { reconstruct } from '../src/extract.js';
import { ensureHandover } from '../src/handover.js';

const TABLES = [
  'source_records',
  'chunks',
  'entities',
  'relationships',
  'evidence',
  'claims',
  'gaps',
  'reviews',
  'handover_versions',
  'handovers',
  'acknowledgements',
  'github_connections',
  'sources',
  'audit_logs',
  'memberships',
  'projects',
  'organizations',
  'sessions',
  'users',
];

export const FIXTURE_PASSWORD = 'contextbridge';

export const FIXTURE_ACCOUNTS = {
  admin: { email: 'admin@fixture.test', name: 'Fixture Admin', title: 'Administrator', role: 'admin' },
  reviewer: { email: 'reviewer@fixture.test', name: 'Fixture Reviewer', title: 'Reviewer', role: 'reviewer' },
  departing: {
    email: 'departing@fixture.test',
    name: 'Robin Vale',
    title: 'Gateway engineer (departing)',
    role: 'manager',
  },
  incoming: { email: 'incoming@fixture.test', name: 'Incoming Engineer', title: 'Incoming engineer', role: 'member' },
};

export const DEPARTING_NAME = FIXTURE_ACCOUNTS.departing.name;

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

const GITHUB_RECORDS = [
  {
    externalId: 'commit/c1',
    type: 'commit',
    title: 'feat(gateway): add idempotency keys to ingest',
    body: 'Ingest requests now send an Idempotency-Key header derived from the vendor reference.',
    author: DEPARTING_NAME,
    state: 'merged',
    occurredAt: daysAgo(80),
    metadata: { sha: 'c1', files: ['src/gateway/ingest.ts'], branch: 'main' },
  },
  {
    externalId: 'commit/c2',
    type: 'commit',
    title: 'fix(gateway): retry failed deliveries',
    body: 'We chose exponential backoff for failed gateway deliveries.',
    author: DEPARTING_NAME,
    state: 'merged',
    occurredAt: daysAgo(60),
    metadata: { sha: 'c2', files: ['src/gateway/retry.ts'], branch: 'main' },
  },
  {
    externalId: 'commit/c3',
    type: 'commit',
    title: 'chore(gateway): staging retry override',
    body: 'Staging keeps a fixed retry interval until the queue migration lands, which is temporary.',
    author: DEPARTING_NAME,
    state: 'merged',
    occurredAt: daysAgo(55),
    metadata: { sha: 'c3', files: ['src/gateway/retry.ts'], branch: 'staging' },
  },
  {
    externalId: 'pull/12',
    type: 'pull_request',
    title: 'Gateway retry rewrite',
    body: [
      '## Summary',
      'Rewrites gateway retries around the queue worker.',
      'Decision: we will retain idempotency keys for 24 hours.',
      'Depends on the queue worker in src/gateway/retry.ts.',
      'No tests cover the duplicate-delivery path, so a double delivery would be hard to detect.',
    ].join('\n'),
    author: DEPARTING_NAME,
    state: 'merged',
    occurredAt: daysAgo(40),
    metadata: {
      number: 12,
      mergedAt: daysAgo(38),
      files: ['src/gateway/retry.ts'],
      labels: ['gateway'],
      reviews: 2,
    },
  },
  {
    externalId: 'pull/15',
    type: 'pull_request',
    title: 'Gateway metrics',
    body: 'WIP: dashboard panels for retry outcomes and dead-letter depth, pending the metrics schema review.',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(20),
    metadata: { number: 15, draft: true, mergedAt: null, files: ['src/gateway/metrics.ts'], labels: [], reviews: 0 },
  },
  {
    externalId: 'pull/18',
    type: 'pull_request',
    title: 'Gateway ingest documentation',
    body: 'Adds reference documentation for the ingest headers and the idempotency key format.',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(50),
    metadata: { number: 18, mergedAt: null, files: ['src/gateway/ingest.ts'], labels: ['docs'], reviews: 0 },
  },
  {
    externalId: 'issue/7',
    type: 'issue',
    title: 'Dead-letter queue has no consumer',
    body: 'The dead-letter queue is not implemented for retries; the consumer is blocked by #21.',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(30),
    metadata: { number: 7, labels: ['risk', 'gateway'], assignees: [], files: ['src/gateway/retry.ts'] },
  },
  {
    externalId: 'issue/21',
    type: 'issue',
    title: 'Queue migration plan',
    body: 'Depends on the vendor rate limits before the queue migration can start.',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(35),
    metadata: { number: 21, labels: ['blocked'], assignees: [], files: ['src/gateway/retry.ts'] },
  },
  {
    externalId: 'issue/9',
    type: 'issue',
    title: 'Ownership of the gateway after handover',
    body: 'Open question: who owns the retry queue after the handover?',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(10),
    metadata: { number: 9, labels: ['question'], assignees: [], files: ['src/gateway/retry.ts'] },
  },
  {
    externalId: 'issue/11',
    type: 'issue',
    title: 'Rotate ingest keys',
    body: 'The gateway ingest path is owned by Robin Vale and the rotation runbook is assigned to Robin Vale.',
    author: DEPARTING_NAME,
    state: 'open',
    occurredAt: daysAgo(15),
    metadata: { number: 11, labels: ['security'], assignees: [DEPARTING_NAME], files: ['src/gateway/ingest.ts'] },
  },
];

const DOCUMENTS = [
  {
    filename: 'architecture-notes.md',
    title: 'Gateway architecture notes',
    visibility: 'team',
    author: DEPARTING_NAME,
    occurredAt: daysAgo(45),
    body: [
      '# Gateway architecture notes',
      'We will retain idempotency keys for 24 hours after capture.',
      'Decision: gateway work stays on the self-hosted queue rather than moving to a hosted queue.',
      'The queue migration is owned by Robin Vale until the handover completes.',
    ].join('\n'),
  },
  {
    filename: 'vendor-schedule.txt',
    title: 'Vendor processing schedule',
    visibility: 'restricted',
    author: 'Vendor integration team',
    occurredAt: daysAgo(120),
    body: [
      '# Vendor processing schedule',
      'Section 4.2: the merchant must retain idempotency keys for 7 days so duplicate settlement files can be matched.',
      'Section 6.1: failed settlement attempts must be reported within 24 hours.',
    ].join('\n'),
  },
];

export function seedFixture({ reset = true } = {}) {
  if (reset) {
    for (const table of TABLES) run(`DELETE FROM ${table}`);
  }

  const orgId = uid('org');
  run('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', orgId, 'Fixture Labs', now());

  const userIds = {};
  for (const [key, account] of Object.entries(FIXTURE_ACCOUNTS)) {
    userIds[key] = createUser({
      name: account.name,
      email: account.email,
      title: account.title,
      password: FIXTURE_PASSWORD,
    });
  }

  const projectId = uid('prj');
  run(
    `INSERT INTO projects (id, org_id, name, description, transition_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    orgId,
    'Gateway Platform',
    'Gateway retries, ingest keys and queue ownership for the fixture platform.',
    userIds.departing,
    userIds.admin,
    now(),
  );

  addMember(projectId, userIds.admin, 'admin');
  addMember(projectId, userIds.reviewer, 'reviewer');
  addMember(projectId, userIds.departing, 'manager');
  addMember(projectId, userIds.incoming, 'member');

  const githubSourceId = uid('src');
  run(
    `INSERT INTO sources (id, project_id, kind, name, ref, visibility, status, meta, created_by, created_at)
     VALUES (?, ?, 'github', ?, ?, 'team', 'connecting', ?, ?, ?)`,
    githubSourceId,
    projectId,
    'GitHub — fixture/gateway',
    'fixture/gateway',
    JSON.stringify({ mode: 'live', repo: 'fixture/gateway' }),
    userIds.admin,
    now(),
  );
  for (const record of GITHUB_RECORDS) {
    upsertRecord(projectId, githubSourceId, { url: null, ...record });
  }
  run('UPDATE sources SET status = ?, last_synced_at = ? WHERE id = ?', 'synced', now(), githubSourceId);

  for (const document of DOCUMENTS) {
    const sourceId = uid('src');
    run(
      `INSERT INTO sources (id, project_id, kind, name, ref, visibility, status, meta, created_by, created_at)
       VALUES (?, ?, 'document', ?, ?, ?, 'connecting', ?, ?, ?)`,
      sourceId,
      projectId,
      document.filename,
      document.filename,
      document.visibility,
      JSON.stringify({ classification: document.visibility }),
      userIds.admin,
      now(),
    );
    importDocument(projectId, sourceId, document);
  }

  const summary = reconstruct(projectId, { transitionUserId: userIds.departing });
  ensureHandover(projectId, { transitionUserId: userIds.departing, createdBy: userIds.admin });

  return {
    projectId,
    summary,
    accounts: FIXTURE_ACCOUNTS,
    get gaps() {
      return get('SELECT COUNT(*) AS count FROM gaps WHERE project_id = ?', projectId)?.count ?? 0;
    },
  };
}
