import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { all, get, now, run, uid } from './db.js';

const SESSION_DAYS = 7;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSession(userId) {
  const id = randomBytes(32).toString('hex');
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', id, userId, createdAt, expiresAt);
  return { id, expiresAt };
}

export function destroySession(sessionId) {
  run('DELETE FROM sessions WHERE id = ?', sessionId);
}

export function userForSession(sessionId) {
  if (!sessionId) return null;
  const row = get(
    `SELECT u.id, u.name, u.email, u.title, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    sessionId,
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(sessionId);
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, title: row.title };
}

// Blueprint §9.1 roles. Viewers and incoming members only ever see approved content.
const PERMISSIONS = {
  admin: new Set(['project:manage', 'source:connect', 'reconstruct', 'claim:review', 'handover:read-draft', 'handover:approve', 'evidence:restricted', 'audit:read']),
  manager: new Set(['project:manage', 'source:connect', 'reconstruct', 'claim:review', 'handover:read-draft', 'handover:approve', 'evidence:restricted', 'audit:read']),
  reviewer: new Set(['reconstruct', 'claim:review', 'handover:read-draft', 'handover:approve', 'audit:read']),
  member: new Set([]),
  viewer: new Set([]),
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  reviewer: 'Reviewer',
  member: 'Incoming member',
  viewer: 'Viewer',
};

export function roleFor(userId, projectId) {
  const row = get('SELECT role FROM memberships WHERE project_id = ? AND user_id = ?', projectId, userId);
  return row?.role ?? null;
}

export function can(role, permission) {
  if (!role) return false;
  return PERMISSIONS[role]?.has(permission) ?? false;
}

export function seesRestrictedSources(role) {
  return can(role, 'evidence:restricted');
}

export function membersOf(projectId) {
  return all(
    `SELECT m.user_id AS userId, m.role, u.name, u.email, u.title
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ?
      ORDER BY u.name`,
    projectId,
  );
}

export function createUser({ name, email, title, password }) {
  const id = uid('usr');
  run(
    'INSERT INTO users (id, name, email, title, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    name,
    email,
    title ?? null,
    hashPassword(password),
    now(),
  );
  return id;
}

export function addMember(projectId, userId, role) {
  run(
    `INSERT INTO memberships (id, project_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`,
    uid('mem'),
    projectId,
    userId,
    role,
    now(),
  );
}
