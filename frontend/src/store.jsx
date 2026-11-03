import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

const AppContext = createContext(null);

const readRoute = () => window.location.hash.replace(/^#\/?/, '') || 'home';

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'info') => {
      const id = (toastSeq.current += 1);
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 6500);
    },
    [dismissToast],
  );

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setProjects([]);
      setSummary(null);
    };
    window.addEventListener('cb:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cb:unauthorized', onUnauthorized);
  }, []);

  const loadSummary = useCallback(
    async (id) => {
      if (!id) {
        setSummary(null);
        return null;
      }
      setSummaryLoading(true);
      try {
        const data = await api(`/projects/${id}`);
        setSummary(data);
        return data;
      } catch (error) {
        setSummary(null);
        notify(error.message, 'error');
        return null;
      } finally {
        setSummaryLoading(false);
      }
    },
    [notify],
  );

  const bootstrap = useCallback(async () => {
    try {
      const [me, accounts] = await Promise.all([api('/me'), api('/accounts').catch(() => ({ accounts: [] }))]);
      setUser(me.user);
      setProjects(me.projects);
      setAccounts(accounts.accounts ?? []);
      const stored = window.localStorage.getItem('cb_project');
      const next = me.projects.find((project) => project.id === stored)?.id ?? me.projects[0]?.id ?? null;
      setProjectId(next);
      if (next) {
        window.localStorage.setItem('cb_project', next);
        await loadSummary(next);
      }
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadSummary]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email, password) => {
      await api('/login', { method: 'POST', body: { email, password } });
      await bootstrap();
    },
    [bootstrap],
  );

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setProjects([]);
    setSummary(null);
    setProjectId(null);
    window.localStorage.removeItem('cb_project');
    window.location.hash = '#/home';
  }, []);

  const selectProject = useCallback(
    async (id) => {
      setProjectId(id);
      window.localStorage.setItem('cb_project', id);
      await loadSummary(id);
    },
    [loadSummary],
  );

  const refresh = useCallback(async () => {
    const me = await api('/me').catch(() => null);
    if (me) {
      setUser(me.user);
      setProjects(me.projects);
    }
    return loadSummary(projectId);
  }, [projectId, loadSummary]);

  const createProject = useCallback(
    async (name, description) => {
      const result = await api('/projects', { method: 'POST', body: { name, description } });
      const me = await api('/me');
      setUser(me.user);
      setProjects(me.projects);
      setProjectId(result.project.id);
      window.localStorage.setItem('cb_project', result.project.id);
      await loadSummary(result.project.id);
      return result.project;
    },
    [loadSummary],
  );

  const go = useCallback((view) => {
    window.location.hash = `#/${view}`;
    setRoute(view);
  }, []);

  const value = useMemo(
    () => ({
      booting,
      user,
      accounts,
      projects,
      projectId,
      summary,
      summaryLoading,
      route,
      toasts,
      notify,
      dismissToast,
      login,
      logout,
      selectProject,
      refresh,
      createProject,
      loadSummary,
      go,
      search,
      setSearch,
    }),
    [
      booting,
      user,
      accounts,
      projects,
      projectId,
      summary,
      summaryLoading,
      route,
      toasts,
      notify,
      dismissToast,
      login,
      logout,
      selectProject,
      refresh,
      createProject,
      loadSummary,
      search,
      setSearch,
      go,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
