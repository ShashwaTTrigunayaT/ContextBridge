// Checks for the completed workflow: file ingestion, departure scope, the
// incoming member's acknowledgement and GitHub connection handling.
//
// Model extraction is switched off so these tests never make a network call.
// Parsers are exercised with generated PDF and DOCX fixtures.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

process.env.CONTEXTBRIDGE_DB = join(tmpdir(), `contextbridge-workflow-${Date.now()}.db`);
process.env.LLM_EXTRACTION = 'false';
delete process.env.GROQ_API_KEY;
delete process.env.GITHUB_CLIENT_ID;
delete process.env.GITHUB_CLIENT_SECRET;

const { seedFixture, FIXTURE_ACCOUNTS, FIXTURE_PASSWORD } = await import('./fixtures.js');
const seed = seedFixture();
const { createApp } = await import('../src/api.js');
const { extractDocumentText } = await import('../src/documents.js');

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
  return { status: response.status, data };
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
const manager = await login(FIXTURE_ACCOUNTS.departing.email);
const incoming = await login(FIXTURE_ACCOUNTS.incoming.email);

// ── Generated file fixtures ──────────────────────────────────────────
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const crc = crc32(data);
    const compressed = deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuffer, compressed);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

function makeDocx(text) {
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ]);
}

function makePdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    out += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const DOCX_TEXT = 'Decision: we chose a hosted queue over self-hosting the worker.';
const PDF_TEXT = 'Risk: the settlement cache invalidation path is untested.';

// ── Tests ────────────────────────────────────────────────────────────
test('document extraction reads PDF, DOCX, Markdown and text', async () => {
  const docx = await extractDocumentText({
    filename: 'adr-004.docx',
    base64: makeDocx(DOCX_TEXT).toString('base64'),
  });
  assert.equal(docx.format, 'docx');
  assert.equal(docx.text, DOCX_TEXT);

  const pdf = await extractDocumentText({
    filename: 'architecture.pdf',
    base64: makePdf(PDF_TEXT).toString('base64'),
  });
  assert.equal(pdf.format, 'pdf');
  assert.equal(pdf.pages, 1);
  assert.match(pdf.text, /settlement cache invalidation/);

  const markdown = await extractDocumentText({
    filename: 'notes.md',
    text: '# Notes\n\nDecision: keep the retry policy.',
  });
  assert.equal(markdown.format, 'markdown');
  assert.match(markdown.text, /keep the retry policy/);

  await assert.rejects(
    () => extractDocumentText({ filename: 'legacy.doc', base64: 'AA==' }),
    /Unsupported document/,
  );
});

test('document upload stores extracted text and rejects unsupported files', async () => {
  const uploaded = await call(admin, 'POST', `/projects/${project}/sources/documents`, {
    filename: 'queue-migration.docx',
    title: 'Queue migration decision',
    visibility: 'team',
    content: makeDocx(DOCX_TEXT).toString('base64'),
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.format, 'docx');
  assert.ok(uploaded.data.characters > 20);

  const summary = await call(admin, 'GET', `/projects/${project}`);
  const source = summary.data.sources.find((entry) => entry.name === 'queue-migration.docx');
  assert.ok(source, 'uploaded document should appear as a source');
  assert.equal(source.format, 'docx');
  assert.equal(source.mode, 'upload');

  const rejected = await call(admin, 'POST', `/projects/${project}/sources/documents`, {
    filename: 'old.doc',
    body: 'plain text',
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /Unsupported document/);

  const empty = await call(admin, 'POST', `/projects/${project}/sources/documents`, {
    filename: 'empty.md',
    body: '',
  });
  assert.equal(empty.status, 400);
});

test('reconstruction stays deterministic when model extraction is off', async () => {
  const result = await call(admin, 'POST', `/projects/${project}/reconstruct`, {});
  assert.equal(result.status, 200);
  assert.equal(result.data.ai.enabled, false);
  assert.ok(result.data.claims >= 12);

  const claims = await call(admin, 'GET', `/projects/${project}/claims`);
  const assist = await call(reviewer, 'POST', `/projects/${project}/claims/${claims.data.claims[0].id}/assist`, {});
  assert.equal(assist.status, 503, 'model assistance is reported as unconfigured, not faked');
});

test('departure scope records a contributor and their responsibilities', async () => {
  const before = await call(admin, 'GET', `/projects/${project}/transition`);
  assert.equal(before.status, 200);
  assert.equal(before.data.locked, false);
  assert.ok(before.data.members.length >= 4);
  assert.ok(before.data.candidates.length >= 3);

  const choices = before.data.candidates.filter((claim) => claim.category === 'unfinished').slice(0, 2);
  assert.equal(choices.length, 2);

  const save = await call(manager, 'POST', `/projects/${project}/transition`, {
    contributor: FIXTURE_ACCOUNTS.departing.name,
    contributorUserId: before.data.members.find((member) => member.name === FIXTURE_ACCOUNTS.departing.name)?.userId,
    responsibilities: choices.map((claim) => ({
      claimId: claim.id,
      text: claim.text,
      category: claim.category,
      component: claim.component,
    })),
    components: ['gateway/retry'],
  });
  assert.equal(save.status, 200);
  assert.equal(save.data.focus.contributor, FIXTURE_ACCOUNTS.departing.name);
  assert.equal(save.data.focus.responsibilities.length, 2);

  const draft = await call(admin, 'GET', `/projects/${project}/handover`);
  assert.equal(draft.status, 200);
  assert.equal(draft.data.content.transfer.contributor, FIXTURE_ACCOUNTS.departing.name);
  assert.equal(draft.data.content.transfer.responsibilities.length, 2);
  assert.ok(draft.data.content.transfer.components.includes('gateway/retry'));

  const forbidden = await call(reviewer, 'POST', `/projects/${project}/transition`, {
    contributor: 'Robin Vale',
    responsibilities: [{ text: 'Own the gateway' }],
  });
  assert.equal(forbidden.status, 403, 'only managers and admins may change the departure scope');
});

test('acknowledgement requires an approved handover and is idempotent', async () => {
  const early = await call(incoming, 'POST', `/projects/${project}/handover/acknowledge`, { note: 'Too soon' });
  assert.equal(early.status, 409);

  const approved = await call(reviewer, 'POST', `/projects/${project}/handover/approve`, {
    summary: 'Reviewed the departure scope and retry claims.',
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.version, 1);

  const handover = await call(incoming, 'GET', `/projects/${project}/handover`);
  assert.equal(handover.data.canAcknowledge, true);
  assert.equal(handover.data.acknowledgements.length, 0);

  const acknowledged = await call(incoming, 'POST', `/projects/${project}/handover/acknowledge`, {
    note: 'I have the retry context.',
    questions: ['Who signs off the vendor rota?'],
  });
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.data.acknowledgement.version, 1);
  assert.equal(acknowledged.data.acknowledgement.note, 'I have the retry context.');

  const again = await call(incoming, 'POST', `/projects/${project}/handover/acknowledge`, {
    note: 'Updated: retry context confirmed.',
  });
  assert.equal(again.status, 200);
  assert.equal(again.data.acknowledgement.note, 'Updated: retry context confirmed.');

  const readBack = await call(incoming, 'GET', `/projects/${project}/handover`);
  assert.equal(readBack.data.canAcknowledge, false);
  assert.equal(readBack.data.acknowledgement.note, 'Updated: retry context confirmed.');

  const departing = await call(manager, 'POST', `/projects/${project}/handover/acknowledge`, { note: 'self' });
  assert.equal(departing.status, 403, 'the departing member cannot acknowledge their own handover');

  const summary = await call(admin, 'GET', `/projects/${project}`);
  assert.ok(summary.data.handover.acknowledgement, 'the dashboard should expose the acknowledgement');
});

test('GitHub connection is reported and guarded until configured', async () => {
  const status = await call(admin, 'GET', '/github/status');
  assert.equal(status.status, 200);
  assert.equal(status.data.connected, false);
  assert.equal(status.data.configured, false);

  const repos = await call(admin, 'GET', '/github/repos');
  assert.equal(repos.status, 400);

  const start = await call(admin, 'GET', '/github/oauth/start');
  assert.equal(start.status, 400, 'an unconfigured deployment explains how to fix it');
});

test('demo role switching issues a new session for install accounts only', async () => {
  const viewer = await login(FIXTURE_ACCOUNTS.incoming.email);
  const switched = await call(viewer, 'POST', '/accounts/switch', { email: FIXTURE_ACCOUNTS.admin.email });
  assert.equal(switched.status, 200);
  assert.equal(switched.data.user.email, FIXTURE_ACCOUNTS.admin.email);

  // The previous session was ended as part of the switch.
  const oldSession = await call(viewer, 'GET', '/me');
  assert.equal(oldSession.status, 401);

  const stranger = await call(viewer, 'POST', '/accounts/switch', { email: 'someone@else.test' });
  assert.equal(stranger.status, 401, 'the old session cannot switch again');

  const fresh = await login(FIXTURE_ACCOUNTS.incoming.email);
  const unknown = await call(fresh, 'POST', '/accounts/switch', { email: 'someone@else.test' });
  assert.equal(unknown.status, 404, 'an unknown account cannot be switched to');
});

test('only repository sources can be re-synced', async () => {
  const summary = await call(admin, 'GET', `/projects/${project}`);
  const document = summary.data.sources.find((source) => source.kind === 'document');
  assert.ok(document);

  const resync = await call(admin, 'POST', `/projects/${project}/sources/${document.id}/sync`, {});
  assert.equal(resync.status, 400);
  assert.match(resync.data.error, /Only repository sources/);
});
