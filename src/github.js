// GitHub OAuth connection and repository helpers.
//
// The OAuth flow is optional: deployments without GITHUB_CLIENT_ID and
// GITHUB_CLIENT_SECRET still import public repositories, and a user can paste a
// read-only token instead. A stored token is only ever used to read what that
// account can already access; it is never returned by the API.

import { get, now, run, uid } from './db.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

export function oauthConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function oauthScope() {
  return process.env.GITHUB_OAUTH_SCOPE || 'repo read:user';
}

function originOf(req) {
  const protocol = req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

export function callbackUrl(req) {
  return process.env.GITHUB_OAUTH_REDIRECT || `${originOf(req)}/api/github/oauth/callback`;
}

export function authorizeUrl({ req, state }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(req));
  url.searchParams.set('scope', oauthScope());
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

async function githubFetch(path, token, { accept = 'application/vnd.github+json' } = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
      'User-Agent': 'ContextBridge',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('GitHub rejected the connection. Reconnect GitHub and try again.');
    if (response.status === 403) throw new Error('GitHub denied that request. Check the connection scopes or rate limit.');
    throw new Error(`GitHub API ${response.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

export async function exchangeCode({ code, req }) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(req),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'GitHub did not return an access token.');
  }
  return { accessToken: payload.access_token, scope: payload.scope ?? '' };
}

export function fetchViewer(token) {
  return githubFetch('/user', token);
}

export async function listRepositories(token) {
  const repos = await githubFetch('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token);
  return repos
    .filter((repo) => !repo.archived)
    .map((repo) => ({
      slug: repo.full_name,
      name: repo.name,
      owner: repo.owner?.login ?? null,
      private: Boolean(repo.private),
      language: repo.language ?? null,
      description: repo.description ?? null,
      updatedAt: repo.updated_at ?? null,
      defaultBranch: repo.default_branch ?? null,
    }));
}

export function saveConnection({ userId, accessToken, scope, viewer }) {
  const existing = get('SELECT id FROM github_connections WHERE user_id = ?', userId);
  if (existing) {
    run(
      'UPDATE github_connections SET login = ?, name = ?, avatar_url = ?, access_token = ?, scope = ?, updated_at = ? WHERE user_id = ?',
      viewer.login ?? null,
      viewer.name ?? null,
      viewer.avatar_url ?? null,
      accessToken,
      scope ?? '',
      now(),
      userId,
    );
    return get('SELECT * FROM github_connections WHERE user_id = ?', userId);
  }
  run(
    `INSERT INTO github_connections (id, user_id, login, name, avatar_url, access_token, scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid('ghc'),
    userId,
    viewer.login ?? null,
    viewer.name ?? null,
    viewer.avatar_url ?? null,
    accessToken,
    scope ?? '',
    now(),
    now(),
  );
  return get('SELECT * FROM github_connections WHERE user_id = ?', userId);
}

export function connectionFor(userId) {
  return get('SELECT * FROM github_connections WHERE user_id = ?', userId);
}

export function connectionToken(userId) {
  return connectionFor(userId)?.access_token ?? null;
}

export function disconnectConnection(userId) {
  const existing = connectionFor(userId);
  run('DELETE FROM github_connections WHERE user_id = ?', userId);
  return existing;
}

export function githubStatus(userId) {
  const connection = connectionFor(userId);
  return {
    configured: oauthConfigured(),
    connected: Boolean(connection),
    login: connection?.login ?? null,
    name: connection?.name ?? null,
    avatarUrl: connection?.avatar_url ?? null,
    scopes: connection?.scope ? connection.scope.split(/[,\s]+/).filter(Boolean) : [],
    connectedAt: connection?.updated_at ?? connection?.created_at ?? null,
    callback: oauthConfigured() ? '/api/github/oauth/callback' : null,
  };
}
