import { useState } from 'react';
import { GitBranch, PenLine } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field, Modal, cx } from '../ui.jsx';

const REPO_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// One dialog, two entry points: the workspace hub and the workspace dashboard.
// A workspace either starts from a GitHub repository or from a blank project.
export default function NewProjectModal({ open, onClose }) {
  const { createProject, notify, go, refresh } = useApp();
  const [mode, setMode] = useState('github');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [visibility, setVisibility] = useState('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setName('');
    setDescription('');
    setRepo('');
    setToken('');
    setError(null);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'github') {
        const slug = repo.trim();
        if (!REPO_SLUG.test(slug)) {
          throw new Error('Repository must look like "owner/name" — for example twentyhq/twenty.');
        }
        const project = await createProject(name.trim() || slug, description.trim() || `Handover reconstructed from ${slug}.`);
        const result = await api(`/projects/${project.id}/sources/github`, {
          method: 'POST',
          body: { repo: slug, token, visibility },
        });
        await refresh();
        notify(`Workspace created with ${result.imported} records from ${slug}. Run reconstruction to build the claims.`, 'success');
        reset();
        onClose();
        go('sources');
        return;
      }

      if (!name.trim()) throw new Error('Workspace name is required.');
      await createProject(name.trim(), description.trim());
      notify('Workspace created. Connect authorized sources next.', 'success');
      reset();
      onClose();
      go('sources');
    } catch (err) {
      setError(err.message);
      if (mode === 'manual') notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const isGithub = mode === 'github';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New workspace"
      description="A workspace holds one handover and the sources it may read."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} type="button">
            Cancel
          </Btn>
          <Btn variant="primary" icon="plus" type="submit" form="new-project-form" disabled={busy}>
            {busy ? 'Creating…' : isGithub ? 'Create from GitHub' : 'Create workspace'}
          </Btn>
        </>
      }
    >
      <form id="new-project-form" className="form" onSubmit={submit}>
        <div className="segmented mode-switch" role="tablist" aria-label="How to start">
          <button
            type="button"
            role="tab"
            aria-selected={isGithub}
            className={cx('segment', isGithub && 'active')}
            onClick={() => setMode('github')}
          >
            <GitBranch size={13} strokeWidth={1.9} />
            From GitHub
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isGithub}
            className={cx('segment', !isGithub && 'active')}
            onClick={() => setMode('manual')}
          >
            <PenLine size={13} strokeWidth={1.9} />
            Manually
          </button>
        </div>

        {isGithub ? (
          <>
            <Field label="Repository" hint="Public or token-authorized repository, as owner/name.">
              <input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="twentyhq/twenty"
                autoFocus
              />
            </Field>
            <Field label="Access token" hint="Optional for public repositories. Needed for private ones.">
              <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="ghp_…" />
            </Field>
            <div className="field-row">
              <Field label="Workspace name" hint="Defaults to the repository slug.">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="twentyhq/twenty" />
              </Field>
              <Field label="Visibility" hint="Who inside the workspace may read these records.">
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                  <option value="team">Team</option>
                  <option value="restricted">Restricted</option>
                </select>
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Workspace name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Payments Service"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="Who is leaving, and what should the incoming member know?">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Card payments and acquirer settlement. Aisha hands this over to Mei."
              />
            </Field>
          </>
        )}

        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
