import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Badge, Btn, Empty, Field, Icon, Modal, Panel, cx } from '../ui.jsx';

export default function Sources() {
  const { summary, projectId, refresh, notify } = useApp();
  const [connect, setConnect] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const sources = summary?.sources ?? [];

  async function disconnect() {
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

  return (
    <div className="stack">
      <div className="page-action">
        <p className="muted">
          Only sources an administrator authorizes are used. Anything marked restricted is visible to administrators
          only and is never redistributed in the shared handover.
        </p>
        <div className="row-actions">
          <Btn variant="ghost" icon="file" onClick={() => setConnect('document')}>
            Upload document
          </Btn>
          <Btn variant="primary" icon="plus" onClick={() => setConnect('github')}>
            Connect GitHub
          </Btn>
        </div>
      </div>

      <Panel title="Connected sources" subtitle="Records this project may reason over" count={sources.length}>
        {sources.length ? (
          <div className="source-grid">
            {sources.map((source) => (
              <article className={cx('source-card', source.visibility === 'restricted' && 'source-card-restricted')} key={source.id}>
                <header>
                  <span className="source-icon">
                    <Icon name={source.kind === 'github' ? 'branch' : 'file'} size={16} />
                  </span>
                  <div className="source-title">
                    <strong>{source.name}</strong>
                    <span className="mono">{source.kind}</span>
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
                    <dt>Last sync</dt>
                    <dd>{source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleDateString() : 'never'}</dd>
                  </div>
                </dl>

                {source.error && <p className="form-error">{source.error}</p>}

                <footer>
                  <Btn variant="ghost" size="sm" onClick={() => setConfirming(source)}>
                    Disconnect
                  </Btn>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon="database" title="No authorized sources yet">
            Connect a public GitHub repository or upload an architecture note. Reconstruction has nothing to reason over
            until then.
          </Empty>
        )}
      </Panel>

      <GithubModal open={connect === 'github'} onClose={() => setConnect(null)} />
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
            <Btn variant="critical" onClick={disconnect} disabled={busy}>
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

const REPO_CHOICES = [
  { slug: 'twentyhq/twenty', name: 'Twenty CRM', note: 'Open-source CRM · TypeScript' },
  { slug: 'novuhq/novu', name: 'Novu', note: 'Notification infrastructure · TypeScript' },
];

function GithubModal({ open, onClose }) {
  const { projectId, refresh, notify } = useApp();
  const [repo, setRepo] = useState(REPO_CHOICES[0].slug);
  const [customRepo, setCustomRepo] = useState('');
  const [token, setToken] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const target = customRepo.trim() || repo;

  async function submit(event) {
    event.preventDefault();
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
      description="Imports recent commits, pull requests, reviews and issues from a public repository."
      width="lg"
    >
      <form className="form" onSubmit={submit}>
        <Field label="Suggested repositories">
          <div className="repo-choices">
            {REPO_CHOICES.map((choice) => (
              <button
                key={choice.slug}
                type="button"
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

        <Field label="Or any public repository" hint="Leave blank to use the selected suggestion above.">
          <input
            value={customRepo}
            onChange={(event) => setCustomRepo(event.target.value)}
            placeholder="owner/name"
          />
        </Field>

        <Field
          label="GitHub token (optional)"
          hint="Public repositories import without a token. A read-only token raises the rate limit and is never stored; a rejected token is ignored for public repositories."
        >
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="ghp_…" />
        </Field>

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
          <Btn variant="primary" type="submit" icon="database" disabled={busy}>
            {busy ? 'Importing…' : `Import ${target}`}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function DocumentModal({ open, onClose }) {
  const { projectId, refresh, notify } = useApp();
  const [filename, setFilename] = useState('adr-004-caching.md');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/sources/documents`, {
        method: 'POST',
        body: { filename, title, body, visibility },
      });
      notify('Document added. Run reconstruction to include it.', 'success');
      setBody('');
      setTitle('');
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload a document" description="Markdown or plain text." width="lg">
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <Field label="Filename" hint=".md, .markdown or .txt">
            <input value={filename} onChange={(event) => setFilename(event.target.value)} required />
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="team">team</option>
              <option value="restricted">restricted — administrators only</option>
            </select>
          </Field>
        </div>
        <Field label="Title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ADR-004: Caching strategy" />
        </Field>
        <Field label="Content">
          <textarea
            rows={9}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={'# ADR-004\nDecision: we will cache settlement reports for 24 hours.\nRisk: cache invalidation is untested.'}
            required
          />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <Btn variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" type="submit" icon="file" disabled={busy}>
            {busy ? 'Adding…' : 'Add document'}
          </Btn>
        </div>
        <p className="hint">PDF and DOCX parsing is not implemented in this build, and the API rejects those files rather than pretending to read them.</p>
      </form>
    </Modal>
  );
}
