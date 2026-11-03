// Minimal .env loader so `npm start` uses a local .env file without extra flags
// or dependencies. Existing environment variables always win; values are never logged.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

// Host dashboards often keep the newline or the quotes that came with a pasted
// value. Trim the variables that travel in a request header so a copied key
// still authenticates instead of failing silently.
const HEADER_SAFE = [
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_TOKEN',
  'GITHUB_OAUTH_SCOPE',
  'GITHUB_OAUTH_REDIRECT',
];

function tidyValue(raw) {
  let value = String(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

for (const filename of ['.env', '.env.local']) {
  const path = join(root, filename);
  if (!existsSync(path)) continue;
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  for (const [name, value] of Object.entries(parseEnv(contents))) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

for (const name of HEADER_SAFE) {
  if (process.env[name] !== undefined) process.env[name] = tidyValue(process.env[name]);
}
