// Install bootstrap: the organization and the sign-in accounts this deployment
// needs. These are workspace accounts, not project data — no project, source or
// record is created here, and nothing is imported until someone connects a repo.

import './env.js';
import { get, now, run, uid } from './db.js';
import { createUser } from './auth.js';

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

export const INSTALL_ACCOUNTS = [
  {
    key: 'admin',
    email: 'admin@contextbridge.local',
    name: 'Workspace Admin',
    title: 'Administrator',
    role: 'admin',
  },
  {
    key: 'reviewer',
    email: 'reviewer@contextbridge.local',
    name: 'Reviewer',
    title: 'Technical reviewer',
    role: 'reviewer',
  },
  {
    key: 'departing',
    email: 'departing@contextbridge.local',
    name: 'Departing Engineer',
    title: 'Handing the project over',
    role: 'manager',
  },
  {
    key: 'incoming',
    email: 'incoming@contextbridge.local',
    name: 'Incoming Member',
    title: 'Continuing the work',
    role: 'member',
  },
  {
    key: 'viewer',
    email: 'viewer@contextbridge.local',
    name: 'Viewer',
    title: 'Read-only observer',
    role: 'viewer',
  },
];

export function installPassword() {
  return process.env.INSTALL_PASSWORD || 'contextbridge';
}

export function installAccountsVisible() {
  return process.env.EXPOSE_INSTALL_ACCOUNTS !== 'false';
}

export function resetDatabase() {
  for (const table of TABLES) run(`DELETE FROM ${table}`);
}

function userIdsByKey() {
  const map = {};
  for (const account of INSTALL_ACCOUNTS) {
    const row = get('SELECT id FROM users WHERE email = ?', account.email);
    if (row) map[account.key] = row.id;
  }
  return map;
}

export function ensureInstall({ reset = false } = {}) {
  if (reset) resetDatabase();

  let org = get('SELECT * FROM organizations ORDER BY created_at LIMIT 1');
  if (!org) {
    const orgId = uid('org');
    run('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', orgId, 'ContextBridge', now());
    org = { id: orgId };
  }

  let created = false;
  for (const account of INSTALL_ACCOUNTS) {
    if (get('SELECT id FROM users WHERE email = ?', account.email)) continue;
    createUser({
      name: account.name,
      email: account.email,
      title: account.title,
      password: installPassword(),
    });
    created = true;
  }

  return { created, orgId: org.id, userIds: userIdsByKey() };
}

export function installAccountList() {
  const showPasswords = installAccountsVisible();
  return INSTALL_ACCOUNTS.map((account) => ({
    email: account.email,
    name: account.name,
    title: account.title,
    role: account.role,
    ...(showPasswords ? { password: installPassword() } : {}),
  }));
}
