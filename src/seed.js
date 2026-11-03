// Creates the workspace project and imports a real public GitHub repository.
//
//   npm run seed                       # imports the default repository
//   npm run seed -- novuhq/novu        # picks one of the featured repositories
//   npm run seed -- owner/name --reset # wipes the database first
//   GITHUB_TOKEN=ghp_… npm run seed    # raises the GitHub API rate limit
//
// Nothing synthetic is inserted: if GitHub cannot be reached, the source is left
// in an error state and the command exits non-zero instead of fabricating data.

import './env.js';
import { addMember } from './auth.js';
import { get, now, run, uid } from './db.js';
import { reconstruct } from './extract.js';
import { ensureHandover } from './handover.js';
import { importLiveGithub } from './ingest.js';
import { ensureInstall, installAccountList } from './install.js';
import { DEFAULT_REPO, isRepoSlug } from './repos.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const repoArg = args.find((arg) => !arg.startsWith('--'));
const repo = repoArg ?? process.env.GITHUB_REPO ?? DEFAULT_REPO;

if (!isRepoSlug(repo)) {
  console.error(`"${repo}" is not a repository. Pass owner/name, for example: npm run seed -- novuhq/novu`);
  process.exit(1);
}

const install = ensureInstall({ reset });
const { userIds } = install;

let project = get('SELECT * FROM projects ORDER BY created_at LIMIT 1');
if (!project) {
  const projectId = uid('prj');
  run(
    `INSERT INTO projects (id, org_id, name, description, transition_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    install.orgId,
    repo.split('/')[1],
    `Knowledge continuity for the public ${repo} repository. The departing engineer hands this over to the incoming member.`,
    userIds.departing,
    userIds.admin,
    now(),
  );
  project = get('SELECT * FROM projects WHERE id = ?', projectId);
}

for (const account of ['admin', 'reviewer', 'departing', 'incoming', 'viewer']) {
  addMember(project.id, userIds[account], account === 'departing' ? 'manager' : account === 'incoming' ? 'member' : account);
}

let source = get("SELECT * FROM sources WHERE project_id = ? AND kind = 'github'", project.id);
if (!source) {
  const sourceId = uid('src');
  run(
    `INSERT INTO sources (id, project_id, kind, name, ref, visibility, status, meta, created_by, created_at)
     VALUES (?, ?, 'github', ?, ?, 'team', 'connecting', ?, ?, ?)`,
    sourceId,
    project.id,
    `GitHub — ${repo}`,
    repo,
    JSON.stringify({ mode: 'live', repo }),
    userIds.admin,
    now(),
  );
  source = get('SELECT * FROM sources WHERE id = ?', sourceId);
}

let imported = 0;
try {
  const result = await importLiveGithub(project.id, source.id, { repo, token: process.env.GITHUB_TOKEN });
  imported = result.imported;
  run(
    'INSERT INTO audit_logs (id, project_id, user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('aud'),
    project.id,
    userIds.admin,
    'source.import',
    source.id,
    `${repo} (${imported} records)`,
    now(),
  );
} catch (error) {
  run('UPDATE sources SET status = ?, meta = ? WHERE id = ?', 'error', JSON.stringify({ mode: 'live', repo, error: error.message }), source.id);
  console.error(`\nGitHub import failed for ${repo}: ${error.message}`);
  console.error('Nothing was fabricated. Retry from Sources, or set GITHUB_TOKEN to raise the rate limit.');
  process.exitCode = 1;
}

let summary = null;
if (imported > 0) {
  summary = reconstruct(project.id, { transitionUserId: userIds.departing });
  ensureHandover(project.id, { transitionUserId: userIds.departing, createdBy: userIds.admin });
}

console.log(`\nContextBridge workspace ready — ${repo}`);
console.log(`  project:  ${project.id} (${project.name})`);
console.log(`  records:  ${imported} imported from GitHub`);
if (summary) {
  console.log(`  claims:   ${summary.claims} ${JSON.stringify(summary.byCategory)}`);
  console.log(`  gaps:     ${summary.gaps}`);
}
console.log(`\n  Sign in with password "${process.env.INSTALL_PASSWORD || 'contextbridge'}":`);
for (const account of installAccountList()) {
  console.log(`    ${account.email.padEnd(34)} ${account.role.padEnd(9)} ${account.title}`);
}
console.log('');
