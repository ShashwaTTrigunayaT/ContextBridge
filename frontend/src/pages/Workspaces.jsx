import { useEffect, useState } from 'react';
import { ArrowRight, GitBranch, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Badge, Btn, Empty, Loading } from '../ui.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';

// The hub a signed-in member lands on: every workspace they belong to as a card,
// plus the way to create another one.
export default function Workspaces() {
  const { projects, projectId, selectProject, go, user, accounts, login, notify } = useApp();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState(null);

  // The installation ships one account per role so a reviewer can check what an
  // administrator and an incoming member actually see. Switching happens here,
  // after a workspace exists, not on the sign-in screen.
  async function switchAccount(account) {
    setSwitching(account.email);
    try {
      await login(account.email, account.password);
    } catch (error) {
      notify?.(error.message, 'error');
    } finally {
      setSwitching(null);
    }
  }

  useEffect(() => {
    let alive = true;
    if (!projects.length) {
      setCards([]);
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    Promise.all(
      projects.map((project) =>
        api(`/projects/${project.id}`)
          .then((summary) => ({ project, summary }))
          .catch(() => ({ project, summary: null })),
      ),
    ).then((rows) => {
      if (alive) {
        setCards(rows);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [projects]);

  async function openWorkspace(id) {
    if (id !== projectId) await selectProject(id);
    go('overview');
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <span>Workspace</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">All workspaces</span>
          </nav>
          <h1>Workspaces</h1>
          <p>
            {user?.name ? `${user.name} · ` : ''}
            {projects.length} workspace{projects.length === 1 ? '' : 's'} you can open. Each one holds a single handover.
          </p>
        </div>
        <div className="page-head-meta">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} strokeWidth={2} />
            New workspace
          </button>
        </div>
      </div>

      {loading ? (
        <Loading rows={3} />
      ) : cards.length ? (
        <div className="workspaces-grid">
          {cards.map(({ project, summary }) => {
            const counts = summary?.counts ?? {};
            const approved = summary?.handover?.approvedVersion;
            const current = project.id === projectId;
            const people = [
              ...new Set(
                (summary?.components ?? [])
                  .flatMap((component) => component.contributors ?? [])
                  .map((person) => (typeof person === 'string' ? person : person?.name))
                  .filter(Boolean),
              ),
            ];
            return (
              <button
                type="button"
                key={project.id}
                className={current ? 'workspace-card is-current' : 'workspace-card'}
                onClick={() => openWorkspace(project.id)}
              >
                <span className="workspace-card-head">
                  <span className="workspace-card-title">
                    <span className="workspace-card-icon">
                      <GitBranch size={14} strokeWidth={1.9} />
                    </span>
                    <strong>{project.name}</strong>
                  </span>
                  <Badge tone={approved ? 'success' : 'warning'} dot>
                    {approved ? 'Approved' : 'Draft'}
                  </Badge>
                </span>

                <span className="workspace-card-desc">
                  {summary?.description ?? 'A handover reconstructed from authorized engineering records.'}
                </span>

                {people.length > 0 && (
                  <span className="workspace-people">
                    <span className="workspace-people-stack">
                      {people.slice(0, 4).map((person) => (
                        <Avatar key={person} name={person} size="sm" />
                      ))}
                    </span>
                    <span className="workspace-people-label">
                      {people.length} contributor{people.length === 1 ? '' : 's'}
                    </span>
                  </span>
                )}

                <span className="workspace-facts">
                  <span>
                    <em>Sources</em>
                    <strong>{counts.sources ?? 0}</strong>
                  </span>
                  <span>
                    <em>Claims</em>
                    <strong>{counts.claims ?? 0}</strong>
                  </span>
                  <span>
                    <em>Open gaps</em>
                    <strong>{counts.gaps ?? 0}</strong>
                  </span>
                  <span>
                    <em>Your role</em>
                    <strong className="workspace-facts-role">{project.roleLabel ?? project.role}</strong>
                  </span>
                </span>

                <span className="workspace-card-foot">
                  {current ? 'Currently open' : 'Open workspace'}
                  <ArrowRight size={13} strokeWidth={2} />
                </span>
              </button>
            );
          })}

          <button type="button" className="workspace-card workspace-new" onClick={() => setCreateOpen(true)}>
            <span className="workspace-new-icon">
              <Plus size={18} strokeWidth={2} />
            </span>
            <strong>New workspace</strong>
            <span className="workspace-card-desc">Start from a GitHub repository, or set one up manually.</span>
          </button>
        </div>
      ) : (
        <Empty icon="database" title="No workspaces yet">
          Create one from a GitHub repository or from scratch to begin a handover.
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} strokeWidth={2} />
              New workspace
            </button>
          </div>
        </Empty>
      )}

      {accounts.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <div className="panel-titles">
              <h2>Role access</h2>
              <p>Sign in as another account to see exactly what that role can open.</p>
            </div>
          </header>
          <div className="rows">
            {accounts.map((account) => {
              const current = account.email === user?.email;
              return (
                <div className="row" key={account.email}>
                  <Avatar name={account.name} size="sm" />
                  <div className="row-main">
                    <span>
                      {account.name}
                      {current && <Badge tone="accent">current</Badge>}
                    </span>
                    <span className="row-meta">{account.title}</span>
                  </div>
                  <Badge>{account.role}</Badge>
                  <Btn
                    size="sm"
                    variant={current ? 'ghost' : 'secondary'}
                    disabled={current || switching === account.email}
                    onClick={() => switchAccount(account)}
                  >
                    {current ? 'Signed in' : switching === account.email ? 'Switching…' : 'Switch'}
                  </Btn>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <NewProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
