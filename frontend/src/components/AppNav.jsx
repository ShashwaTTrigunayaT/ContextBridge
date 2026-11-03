import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronDown,
  Database,
  FileText,
  Laptop,
  LayoutGrid,
  ListChecks,
  LogOut,
  Network,
  Plus,
  Search,
} from 'lucide-react';
import { useApp } from '../store.jsx';
import { Avatar, cx } from '../ui.jsx';
import { LogoMark } from './Logo.jsx';
import NewProjectModal from './NewProjectModal.jsx';

// Every project view is a top-level tab. The dashboard is not hidden inside a
// menu, so it cannot be confused with the Workspaces hub.
const ITEMS = [
  { view: 'workspaces', label: 'Workspaces', Icon: LayoutGrid },
  { view: 'overview', label: 'Dashboard', Icon: LayoutGrid },
  { view: 'sources', label: 'Sources', Icon: Database, permission: 'source:connect' },
  { view: 'activity', label: 'Activity', Icon: Activity, permission: 'audit:read' },
  { view: 'knowledge', label: 'Knowledge', Icon: Network, permission: 'claim:review' },
  { view: 'claims', label: 'Evidence', Icon: ListChecks, permission: 'claim:review' },
  { view: 'gaps', label: 'Risks', Icon: AlertTriangle, permission: 'claim:review' },
  { view: 'handover', label: 'Handover', Icon: FileText },
  { view: 'workspace', label: 'Incoming', Icon: Laptop },
];

export default function AppNav() {
  const { summary, route, go, projects, projectId, selectProject, search, setSearch } = useApp();
  const [newProject, setNewProject] = useState(false);
  const inputRef = useRef(null);
  const attention = (summary?.counts?.severeGaps ?? 0) + (summary?.counts?.pendingClaims ?? 0);
  const allowed = (permission) => !permission || summary?.permissions?.includes(permission);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="app-nav">
        <div className="app-nav-inner">
          <button type="button" className="brand" onClick={() => go('home')} aria-label="ContextBridge home">
            <span className="brand-mark">
              <LogoMark size={16} />
            </span>
            <span className="brand-word">ContextBridge</span>
          </button>

          <nav className="app-links" aria-label="Project">
            {ITEMS.filter((item) => allowed(item.permission)).map((item) => (
              <button
                key={item.view}
                type="button"
                className={cx('app-link', route === item.view && 'is-active')}
                onClick={() => go(item.view)}
                aria-current={route === item.view ? 'page' : undefined}
              >
                <item.Icon size={13} strokeWidth={1.9} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="spacer" />

          <label className="project-switch">
            <span className="sr-only">Project</span>
            <select value={projectId ?? ''} onChange={(event) => selectProject(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {projects.length > 0 && (
            <button
              type="button"
              className="icon-btn new-project-btn"
              title="New transition project"
              aria-label="New transition project"
              onClick={() => setNewProject(true)}
            >
              <Plus size={16} strokeWidth={1.9} />
            </button>
          )}

          <form
            className="nav-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (search.trim()) go('claims');
            }}
          >
            <Search size={14} strokeWidth={1.8} />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search claims"
              aria-label="Search claims"
            />
            <kbd>/</kbd>
          </form>

          <button
            type="button"
            className="icon-btn"
            onClick={() => go('gaps')}
            title={`${attention} item${attention === 1 ? '' : 's'} need attention`}
            aria-label={`${attention} items need attention`}
          >
            <Bell size={16} strokeWidth={1.8} />
            {attention > 0 && <span className="notif-count">{attention > 99 ? '99+' : attention}</span>}
          </button>

          <ProfileMenu />
        </div>
      </header>
      <NewProjectModal open={newProject} onClose={() => setNewProject(false)} />
    </>
  );
}

function ProfileMenu() {
  const { user, summary, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="profile" ref={ref}>
      <button
        type="button"
        className="profile-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={user.name} size="sm" />
        <span className="profile-name">{user.name}</span>
        <ChevronDown size={12} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="profile-menu" role="menu">
          <header>
            <strong>{user.name}</strong>
            <span>
              {summary?.roleLabel ?? 'No project access'}
              {user.email ? ` · ${user.email}` : ''}
            </span>
          </header>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut size={14} strokeWidth={1.8} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
