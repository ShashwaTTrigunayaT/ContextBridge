// Source ingestion and normalization (blueprint §7.3).
// Every record keeps a stable source identifier so evidence can always be traced back.

import { get, json, now, run, uid } from './db.js';

export function componentFromPath(path) {
  const match = /(?:^|\/)src\/([a-z0-9-]+)\/([a-z0-9-]+)/i.exec(String(path ?? ''));
  if (!match) return null;
  const leaf = match[2].toLowerCase().replace(/\.(test|spec)$/, '');
  return `${match[1].toLowerCase()}/${leaf}`;
}

export function chunkText(text, max = 700) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const block of normalized.split(/\n{2,}/)) {
    for (const sentence of block.split(/(?<=[.!?])\s+(?=[A-Z0-9#])/)) {
      const piece = sentence.trim();
      if (!piece) continue;
      if (`${current} ${piece}`.trim().length > max) flush();
      current = current ? `${current} ${piece}` : piece;
    }
    flush();
  }
  return chunks;
}

export function upsertRecord(projectId, sourceId, record) {
  const externalId = String(record.externalId);
  const existing = get(
    'SELECT id FROM source_records WHERE source_id = ? AND external_id = ?',
    sourceId,
    externalId,
  );

  const payload = [
    record.type,
    record.title ?? null,
    record.body ?? null,
    record.author ?? null,
    record.state ?? null,
    record.url ?? null,
    record.occurredAt ?? now(),
    json(record.metadata ?? {}),
  ];

  let recordId;
  if (existing) {
    recordId = existing.id;
    run(
      `UPDATE source_records
          SET type = ?, title = ?, body = ?, author = ?, state = ?, url = ?, occurred_at = ?, metadata = ?
        WHERE id = ?`,
      ...payload,
      recordId,
    );
    run('DELETE FROM chunks WHERE record_id = ?', recordId);
  } else {
    recordId = uid('rec');
    run(
      `INSERT INTO source_records
         (id, project_id, source_id, external_id, type, title, body, author, state, url, occurred_at, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      recordId,
      projectId,
      sourceId,
      externalId,
      ...payload,
      now(),
    );
  }

  const fullText = [record.title, record.body].filter(Boolean).join('\n\n');
  chunkText(fullText).forEach((chunk, ordinal) => {
    run(
      'INSERT INTO chunks (id, record_id, project_id, source_id, ordinal, text) VALUES (?, ?, ?, ?, ?, ?)',
      uid('chk'),
      recordId,
      projectId,
      sourceId,
      ordinal,
      chunk,
    );
  });

  return recordId;
}

async function githubFetch(path, auth) {
  // Capture the token for this request, not at response time: three calls run in
  // parallel, and the first 401 clears the shared token while the others are
  // still in flight. Without the local copy those calls skip the retry.
  const token = auth.token;
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ContextBridge',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // A stale or mistyped token must not block a public repository. GitHub answers
  // 401 for bad credentials, so retry once without the header and remember it.
  if (response.status === 401 && token) {
    auth.token = '';
    auth.rejected = true;
    return githubFetch(path, auth);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    if (response.status === 404 && auth.rejected) {
      throw new Error(
        `GitHub returned 404 for ${path}. The repository is private or was renamed — the token was rejected, so paste a valid read-only token to import it.`,
      );
    }
    if (response.status === 403 && /rate limit/i.test(detail)) {
      throw new Error('GitHub rate limit reached for unauthenticated requests. Add a read-only token and retry.');
    }
    throw new Error(`GitHub API ${response.status} for ${path} — ${detail}`);
  }
  return response.json();
}

export async function importLiveGithub(projectId, sourceId, { repo, token }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo ?? ''))) {
    throw new Error('Repository must look like "owner/name".');
  }
  // Whitespace around a pasted token is a common cause of "Bad credentials",
  // so trim it before deciding whether anything is sent at all.
  const supplied = String(token ?? '').trim();
  const auth = {
    token: supplied || String(process.env.GITHUB_TOKEN ?? '').trim(),
    rejected: false,
  };
  const [commits, pulls, issues] = await Promise.all([
    githubFetch(`/repos/${repo}/commits?per_page=60`, auth),
    githubFetch(`/repos/${repo}/pulls?state=all&per_page=40&sort=updated&direction=desc`, auth),
    // This endpoint returns pull requests as issues, so a wider page is requested
    // and only the first 40 real issues are kept.
    githubFetch(`/repos/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`, auth),
  ]);

  let imported = 0;
  for (const commit of commits) {
    await Promise.resolve();
    upsertRecord(projectId, sourceId, {
      externalId: `commit/${commit.sha}`,
      type: 'commit',
      title: (commit.commit?.message ?? '').split('\n')[0],
      body: commit.commit?.message ?? '',
      author: commit.author?.login ?? commit.commit?.author?.name ?? null,
      state: 'merged',
      url: commit.html_url ?? null,
      occurredAt: commit.commit?.author?.date ?? now(),
      metadata: { sha: commit.sha?.slice(0, 7), repo, files: [] },
    });
    imported += 1;
  }

  // Unauthenticated GitHub allows 60 requests an hour, so changed files and
  // review threads are fetched for the ten most recently updated pull requests.
  const detailedPulls = auth.token ? pulls.length : 10;
  for (const [pullIndex, pull] of pulls.entries()) {
    let files = [];
    let reviews = { count: 0, items: [] };
    try {
      if (pullIndex < detailedPulls) {
        const changed = await githubFetch(`/repos/${repo}/pulls/${pull.number}/files?per_page=100`, auth);
        files = changed.map((file) => file.filename).filter(Boolean);
        const reviewList = await githubFetch(`/repos/${repo}/pulls/${pull.number}/reviews?per_page=20`, auth);
        reviews = { count: reviewList.length, items: reviewList };
      }
    } catch {
      // Partial data is acceptable; ingestion status reports what succeeded.
    }
    const externalId = `pull/${pull.number}`;
    upsertRecord(projectId, sourceId, {
      externalId,
      type: 'pull_request',
      title: pull.title,
      body: pull.body ?? '',
      author: pull.user?.login ?? null,
      state: pull.merged_at ? 'merged' : pull.state,
      url: pull.html_url ?? null,
      occurredAt: pull.created_at ?? now(),
      metadata: {
        number: pull.number,
        draft: Boolean(pull.draft),
        mergedAt: pull.merged_at,
        repo,
        files,
        labels: (pull.labels ?? []).map((label) => label.name),
        reviews: reviews.count,
      },
    });
    imported += 1;

    for (const [index, review] of reviews.items.entries()) {
      if (!review.body) continue;
      upsertRecord(projectId, sourceId, {
        externalId: `${externalId}/reviews/${index + 1}`,
        type: 'review_comment',
        title: `Review on PR #${pull.number} by ${review.user?.login ?? 'reviewer'}`,
        body: review.body,
        author: review.user?.login ?? null,
        state: (review.state ?? '').toLowerCase(),
        url: review.html_url ?? null,
        occurredAt: review.submitted_at ?? pull.created_at ?? now(),
        metadata: { pullNumber: pull.number, repo, files: [] },
      });
      imported += 1;
    }
  }

  for (const issue of issues.filter((item) => !item.pull_request).slice(0, 40)) {
    upsertRecord(projectId, sourceId, {
      externalId: `issue/${issue.number}`,
      type: 'issue',
      title: issue.title,
      body: issue.body ?? '',
      author: issue.user?.login ?? null,
      state: issue.state,
      url: issue.html_url ?? null,
      occurredAt: issue.created_at ?? now(),
      metadata: {
        number: issue.number,
        repo,
        labels: (issue.labels ?? []).map((label) => label.name),
        assignees: (issue.assignees ?? []).map((assignee) => assignee.login),
        files: [],
      },
    });
    imported += 1;
  }

  run('UPDATE sources SET status = ?, last_synced_at = ? WHERE id = ?', 'synced', now(), sourceId);
  return {
    imported,
    mode: 'live',
    repo,
    ...(auth.rejected
      ? {
          notice:
            'GitHub rejected the supplied token (401 Bad credentials), so this public repository was imported without it. For private repositories, paste a valid read-only token.',
        }
      : {}),
  };
}

export function importDocument(projectId, sourceId, document) {
  const filename = String(document.filename ?? 'document.txt').trim();
  if (!String(document.body ?? '').trim()) throw new Error('Document content is empty.');
  upsertRecord(projectId, sourceId, {
    externalId: filename,
    type: 'document',
    title: String(document.title ?? filename).trim(),
    body: String(document.body),
    author: document.author ?? null,
    state: 'final',
    url: null,
    occurredAt: document.occurredAt ?? now(),
    metadata: {
      filename,
      classification: document.visibility === 'restricted' ? 'restricted' : 'internal',
      // The original file format is kept so a reviewer can see that a claim came
      // from a PDF or Word document rather than a hand-typed note.
      ...(document.format ? { format: document.format } : {}),
      ...(document.pages ? { pages: document.pages } : {}),
    },
  });
  run('UPDATE sources SET status = ?, last_synced_at = ? WHERE id = ?', 'synced', now(), sourceId);
  return { imported: 1 };
}

export function recordCount(sourceId) {
  return get('SELECT COUNT(*) AS count FROM source_records WHERE source_id = ?', sourceId)?.count ?? 0;
}
