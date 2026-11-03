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
