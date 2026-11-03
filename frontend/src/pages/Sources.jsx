import { useEffect, useMemo, useState } from 'react';
import { FileText, GitBranch, Lock, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { Avatar, Badge, Btn, Empty, Field, Icon, Modal, Panel, cx } from '../ui.jsx';

const REPO_CHOICES = [
  { slug: 'twentyhq/twenty', name: 'Twenty CRM', note: 'Open-source CRM · TypeScript' },
  { slug: 'novuhq/novu', name: 'Novu', note: 'Notification infrastructure · TypeScript' },
];

const FORMAT_LABELS = { pdf: 'PDF', docx: 'Word', markdown: 'Markdown', text: 'Text' };

function formatDate(value) {
  if (!value) return 'never';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function readNotice() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )cb_github_notice=([^;]*)/);
  if (!match) return null;
  document.cookie = 'cb_github_notice=; Max-Age=0; path=/';
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export default function Sources() {
  const { summary, projectId, refresh, notify } = useApp();
  const [connect, setConnect] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const status = useAsync(() => api('/github/status'), [projectId]);
  const sources = summary?.sources ?? [];

  // The OAuth callback cannot put a message in the hash route, so it leaves a
  // short-lived cookie that is read once and cleared here.
  useEffect(() => {
    const notice = readNotice();
    if (notice?.message) notify(notice.message, notice.tone === 'error' ? 'error' : 'success');
  }, [notify]);

  async function disconnectSource() {
    if (!confirming) return;
    setBusy(true);
    try {
      await api(`/projects/${projectId}/sources/${confirming.id}`, { method: 'DELETE' });
      notify(`${confirming.name} disconnected. Records and claims without evidence were removed.`, 'success');
      setConfirming(null);
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resync(source) {
    setSyncing(source.id);
    try {
      const result = await api(`/projects/${projectId}/sources/${source.id}/sync`, { method: 'POST', body: {} });
      notify(`Re-synced ${source.ref} — ${result.imported} records. Run reconstruction to refresh the claims.`, 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
      await refresh();
    } finally {
      setSyncing(null);
    }
  }

  async function disconnectGithub() {
    setDisconnecting(true);
    try {
      await api('/github/disconnect', { method: 'POST' });
      notify('GitHub disconnected. Existing sources keep the records they already imported.', 'success');
      status.reload();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  const github = status.data;

  return (
    <div className="stack">
      <div className="page-action">
        <p className="muted">
          Only authorized sources are used. Anything marked restricted is visible to administrators only and is never
          redistributed in the shared handover.
        </p>
        <div className="row-actions">
          <Btn variant="ghost" icon="file" onClick={() => setConnect('document')}>
            Upload document
          </Btn>
          <Btn variant="primary" icon="plus" onClick={() => setConnect('github')}>
            Connect repository
          </Btn>
        </div>
      </div>

      <Panel
        title="GitHub connection"
        subtitle="One connection per person, using repositories you can already read."
        action={
          github ? (
            <Badge tone={github.connected ? 'success' : github.configured ? 'warning' : 'neutral'} dot>
              {github.connected ? `@${github.login}` : github.configured ? 'Not connected' : 'OAuth not configured'}
            </Badge>
          ) : null
        }
      >
        {status.loading ? (
          <p className="hint">Checking the GitHub connection…</p>
        ) : github?.connected ? (
          <div className="github-connection">
            <div className="github-identity">
              <Avatar src={github.avatarUrl} name={github.login ?? 'GitHub'} size="md" />
              <div>
                <strong>@{github.login}</strong>
                <span className="muted small">
                  Connected via GitHub OAuth
                  {github.scopes?.length ? ` · scopes: ${github.scopes.join(', ')}` : ''}
                </span>
              </div>
            </div>
            <div className="row-actions">
              <Btn variant="ghost" size="sm" icon="refresh" onClick={status.reload}>
                Refresh
              </Btn>
              <Btn variant="ghost" size="sm" onClick={disconnectGithub} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect GitHub'}
              </Btn>
            </div>
          </div>
        ) : (
          <div className="github-connection">
            <div className="github-copy">
              <strong>{github?.configured ? 'No GitHub account connected' : 'OAuth is not configured on this deployment'}</strong>
              <p className="muted small">
                {github?.configured
                  ? 'Connect once to list your repositories and import private repositories without pasting a token.'
                  : 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable one-click connection. Until then, connect a repository with a read-only token or use a public repository.'}
              </p>
            </div>
            {github?.configured && (
              <a className="btn btn-primary btn-sm" href="/api/github/oauth/start">
                <GitBranch size={14} strokeWidth={1.9} />
                Connect GitHub
              </a>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Connected sources" subtitle="Records this project may reason over" count={sources.length}>
        {sources.length ? (
          <div className="source-grid">
            {sources.map((source) => (
              <article
                className={cx('source-card', source.visibility === 'restricted' && 'source-card-restricted')}
                key={source.id}
              >
                <header>
                  <span className="source-icon">
                    <Icon name={source.kind === 'github' ? 'branch' : 'file'} size={16} />
                  </span>
                  <div className="source-title">
                    <strong>{source.name}</strong>
                    <span className="mono">{source.ref}</span>
                  </div>
                  <Badge tone={source.visibility === 'restricted' ? 'critical' : 'info'}>{source.visibility}</Badge>
                </header>

                <dl className="source-facts">
                  <div>
                    <dt>Records</dt>
                    <dd>{source.records}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Badge tone={source.status === 'error' ? 'critical' : 'success'} dot>
                        {source.status}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>{source.kind === 'github' ? 'Last sync' : 'Added'}</dt>
                    <dd>{formatDate(source.lastSyncedAt ?? source.createdAt)}</dd>
                  </div>
                </dl>

                <div className="source-tags">
                  {source.format && <Badge tone="violet">{FORMAT_LABELS[source.format] ?? source.format}</Badge>}
                  {source.pages ? <Badge tone="sky">{source.pages} pages</Badge> : null}
                  {source.kind === 'github' && (
                    <Badge tone={source.tokenSource === 'oauth' ? 'accent' : source.tokenSource === 'token' ? 'blue' : 'warning'}>
                      {source.tokenSource === 'oauth' ? 'OAuth token' : source.tokenSource === 'token' ? 'Pasted token' : 'Public access'}
                    </Badge>
                  )}
                  {source.visibility === 'restricted' && (
                    <span className="source-lock">
                      <Lock size={11} strokeWidth={2} /> admins only
                    </span>
                  )}
                </div>

                {source.error && <p className="form-error">{source.error}</p>}

                <footer>
                  {source.kind === 'github' && (
                    <Btn
                      variant="ghost"
                      size="sm"
                      icon="refresh"
                      onClick={() => resync(source)}
                      disabled={syncing === source.id}
                    >
                      {syncing === source.id ? 'Re-syncing…' : 'Re-sync'}
                    </Btn>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => setConfirming(source)}>
                    Disconnect
                  </Btn>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon="database" title="No authorized sources yet">
            Connect a GitHub repository or upload a PDF, Word document or note. Reconstruction has nothing to reason
            over until then.
          </Empty>
        )}
      </Panel>

      <GithubModal open={connect === 'github'} onClose={() => setConnect(null)} status={github} />
      <DocumentModal open={connect === 'document'} onClose={() => setConnect(null)} />

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="Disconnect source?"
        description={confirming?.name}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirming(null)}>
              Keep source
            </Btn>
            <Btn variant="critical" onClick={disconnectSource} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect and remove records'}
            </Btn>
          </>
        }
      >
        <p className="muted">
          This removes the imported records, their excerpts and any claim that is left without evidence. Approved
          handover versions are untouched. Run reconstruction afterwards to refresh the draft.
        </p>
      </Modal>
    </div>
  );
}

function GithubModal({ open, onClose, status }) {
  const { projectId, refresh, notify } = useApp();
  const [repo, setRepo] = useState('');
  const [customRepo, setCustomRepo] = useState('');
  const [search, setSearch] = useState('');
  const [token, setToken] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const repos = useAsync(
    () => (open && status?.connected ? api('/github/repos').catch(() => ({ repos: [] })) : Promise.resolve({ repos: [] })),
    [open, status?.connected],
  );

  useEffect(() => {
    if (!open) {
      setToken('');
      setError(null);
      setSearch('');
      setCustomRepo('');
      setRepo('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const list = repos.data?.repos ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list.slice(0, 30);
    return list.filter((item) => `${item.slug} ${item.description ?? ''}`.toLowerCase().includes(needle)).slice(0, 30);
  }, [repos.data, search]);

  const target = customRepo.trim() || repo;
  const selecting = Boolean(customRepo.trim() || repo);

  async function submit(event) {
    event.preventDefault();
    if (!target) {
      setError('Choose a repository or type owner/name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api(`/projects/${projectId}/sources/github`, {
        method: 'POST',
        body: { repo: target, token: token.trim(), visibility },
      });
      if (result.notice) {
        notify(result.notice, 'warning');
      } else {
        notify(`Imported ${result.imported} live records from ${target}. Run reconstruction to rebuild the claims.`, 'success');
      }
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect a GitHub repository"
      description="Imports recent commits, pull requests, reviews and issues. Private repositories need a connected account or a read-only token."
      width="lg"
    >
      <form className="form" onSubmit={submit}>
        {status?.connected ? (
          <Field label="Your repositories" hint={`Connected as @${status.login}. ${repos.data?.repos?.length ?? 0} repositories available.`}>
            <div className="repo-picker">
              <div className="search repo-picker-search">
                <Icon name="search" size={14} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search repositories…"
                  aria-label="Search repositories"
                />
              </div>
              <div className="repo-picker-list">
                {repos.loading ? (
                  <p className="hint">Loading repositories…</p>
                ) : filtered.length ? (
                  filtered.map((item) => (
                    <button
                      type="button"
                      key={item.slug}
                      className={cx('repo-picker-row', repo === item.slug && !customRepo.trim() && 'is-selected')}
                      onClick={() => {
                        setRepo(item.slug);
                        setCustomRepo('');
                      }}
                    >
                      <span className="repo-picker-main">
                        <strong>{item.slug}</strong>
                        <span className="muted tiny">{item.description ?? item.language ?? 'No description'}</span>
                      </span>
                      {item.private && <Badge tone="violet">private</Badge>}
                      {item.language && <Badge tone="sky">{item.language}</Badge>}
                    </button>
                  ))
                ) : (
                  <p className="hint">No repositories match that search.</p>
                )}
              </div>
            </div>
          </Field>
        ) : (
          <Field label="Suggested repositories">
            <div className="repo-choices">
              {REPO_CHOICES.map((choice) => (
                <button
                  type="button"
                  key={choice.slug}
                  className={cx('repo-choice', !customRepo.trim() && repo === choice.slug && 'is-selected')}
                  onClick={() => {
                    setRepo(choice.slug);
                    setCustomRepo('');
                  }}
                >
                  <span className="repo-choice-name">{choice.name}</span>
                  <span className="repo-choice-slug mono">{choice.slug}</span>
                  <span className="repo-choice-note">{choice.note}</span>
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field
          label={status?.connected ? 'Or another repository' : 'Any public repository'}
          hint="Type owner/name. A private repository needs the connected account or a token below."
        >
          <input value={customRepo} onChange={(event) => setCustomRepo(event.target.value)} placeholder="owner/name" />
        </Field>

        <details className="token-details">
          <summary>
            <ShieldCheck size={14} strokeWidth={1.9} />
            {status?.connected ? 'Use a different read-only token instead' : 'Use a read-only token (optional)'}
          </summary>
          <Field
            label="GitHub token"
            hint="Public repositories import without a token. A pasted token is used for this import only and is not stored."
          >
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ghp_…"
              autoComplete="off"
            />
          </Field>
        </details>

        <Field label="Source visibility">
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="team">team — usable in the shared handover</option>
            <option value="restricted">restricted — administrators only</option>
          </select>
        </Field>

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <Btn variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" type="submit" icon="database" disabled={busy || !selecting}>
            {busy ? 'Importing…' : target ? `Import ${target}` : 'Choose a repository'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function DocumentModal({ open, onClose }) {
  const { projectId, refresh, notify } = useApp();
  const [file, setFile] = useState(null);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setBody('');
      setTitle('');
      setError(null);
      setDragging(false);
    }
  }, [open]);

  const textFile = file && /\.(md|markdown|txt|text)$/i.test(file.name);

  async function submit(event) {
    event.preventDefault();
    if (!file && !body.trim()) {
      setError('Choose a file or paste the document text.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const filename = file?.name ?? 'pasted-note.md';
      const result = await api(`/projects/${projectId}/sources/documents`, {
        method: 'POST',
        body: {
          filename,
          title: title.trim() || undefined,
          visibility,
          ...(file
            ? textFile
              ? { body: await file.text() }
              : { content: await fileToBase64(file) }
            : { body: body.trim() }),
        },
      });
      notify(
        `Added ${filename}${result.pages ? ` (${result.pages} pages)` : ''}. ${result.characters.toLocaleString()} characters extracted. Run reconstruction to include it.`,
        'success',
      );
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a document"
      description="PDF and Word files are parsed on the server. Markdown and plain text can be uploaded or pasted."
      width="lg"
    >
      <form className="form" onSubmit={submit}>
        <label
          className={cx('doc-drop', dragging && 'is-dragging', file && 'has-file')}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <input
            type="file"
            accept=".pdf,.docx,.md,.markdown,.txt,.text"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="doc-drop-icon">
            {file ? <FileText size={19} strokeWidth={1.8} /> : <Upload size={19} strokeWidth={1.8} />}
          </span>
          {file ? (
            <span className="doc-drop-body">
              <strong>{file.name}</strong>
              <span className="muted tiny">{(file.size / 1024).toFixed(0)} KB · click to replace</span>
            </span>
          ) : (
            <span className="doc-drop-body">
              <strong>Drop a PDF, DOCX, Markdown or text file</strong>
              <span className="muted tiny">or click to browse · up to 12 MB</span>
            </span>
          )}
          <span className="doc-drop-formats">
            <Badge tone="violet">PDF</Badge>
            <Badge tone="blue">DOCX</Badge>
            <Badge tone="accent">Markdown</Badge>
            <Badge tone="neutral">TXT</Badge>
          </span>
        </label>

        <div className="field-row">
          <Field label="Title" hint="Defaults to the filename.">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ADR-004: Caching strategy" />
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="team">team — visible in the shared handover</option>
              <option value="restricted">restricted — administrators only</option>
            </select>
          </Field>
        </div>

        {!file && (
          <Field label="Or paste the text" hint="Markdown and plain text only.">
            <textarea
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={'# ADR-004\nDecision: we will cache settlement reports for 24 hours.\nRisk: cache invalidation is untested.'}
            />
          </Field>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <Btn variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" type="submit" icon="file" disabled={busy || (!file && !body.trim())}>
            {busy ? 'Extracting text…' : 'Add document'}
          </Btn>
        </div>
        <p className="hint">
          Scanned PDFs without a text layer are rejected with a reason instead of being stored as an empty source.
          Original files are not kept; extracted text and its evidence excerpts are.
        </p>
      </form>
    </Modal>
  );
}
