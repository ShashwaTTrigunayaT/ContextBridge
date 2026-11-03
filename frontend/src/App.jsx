import { useEffect, useState } from 'react';
import { useApp } from './store.jsx';
import { LogoMark } from './components/Logo.jsx';
import NewProjectModal from './components/NewProjectModal.jsx';
import { Badge, Btn, Icon, Toasts } from './ui.jsx';
import SiteNav from './components/SiteNav.jsx';
import SiteFooter, { WorkspaceFooter } from './components/SiteFooter.jsx';
import AppNav from './components/AppNav.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Sources from './pages/Sources.jsx';
import Claims from './pages/Claims.jsx';
import Gaps from './pages/Gaps.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Handover from './pages/Handover.jsx';
import Workspace from './pages/Workspace.jsx';
import Workspaces from './pages/Workspaces.jsx';
import Activity from './pages/Activity.jsx';
import Home from './pages/site/Home.jsx';
import Platform from './pages/site/Platform.jsx';
import KnowledgeGraphPage from './pages/site/KnowledgeGraphPage.jsx';
import ActivityIntelligence from './pages/site/ActivityIntelligence.jsx';
import HandoverProduct from './pages/site/HandoverProduct.jsx';
import SecurityPage from './pages/site/SecurityPage.jsx';
import Legal from './pages/site/Legal.jsx';

const PUBLIC_ROUTES = {
  home: Home,
  platform: Platform,
  'knowledge-graph': KnowledgeGraphPage,
  'activity-intelligence': ActivityIntelligence,
  'handover-intelligence': HandoverProduct,
  security: SecurityPage,
  legal: Legal,
};

const APP_ROUTES = {
  workspaces: Workspaces,
  overview: Overview,
  sources: Sources,
  claims: Claims,
  gaps: Gaps,
  knowledge: Knowledge,
  handover: Handover,
  workspace: Workspace,
  activity: Activity,
};

const PAGE_META = {
  workspaces: { title: 'Workspaces', subtitle: 'Every handover you can open' },
  overview: { title: 'Workspace dashboard', subtitle: 'Project state, sources and the handover in one place' },
  sources: { title: 'Sources', subtitle: 'What this handover is allowed to know' },
  claims: { title: 'Evidence review', subtitle: 'Every statement with the records behind it' },
  gaps: { title: 'Risks & dependencies', subtitle: 'What the records cannot explain' },
  knowledge: { title: 'Knowledge explorer', subtitle: 'Components, contributors and the sources that support them' },
  handover: { title: 'Handover workspace', subtitle: 'The reviewable document, backed by evidence' },
  workspace: { title: 'Incoming member workspace', subtitle: 'Continue the work from approved knowledge' },
  activity: { title: 'Project activity', subtitle: 'Imports, reviews, approvals and denied access' },
};

const REQUIRED = { sources: 'source:connect', claims: 'claim:review', gaps: 'claim:review', knowledge: 'claim:review' };

export default function App() {
  const { booting, user, route, projects, summary, toasts, dismissToast, go } = useApp();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // A signed-in user coming from the sign-in screen lands on the dashboard.
  useEffect(() => {
    if (user && route === 'sign-in') go('workspaces');
  }, [user, route, go]);

  if (booting) return <Splash />;

  const PublicPage = PUBLIC_ROUTES[route];
  const AppPage = APP_ROUTES[route];

  if (!user) {
    // Signing in is a focused screen: navigation, then the form. The marketing
    // footer belongs to the public pages, not to the auth step.
    return (
      <>
        <SiteNav route={route} />
        <main>{PublicPage ? <PublicPage /> : <Login />}</main>
        {PublicPage && <SiteFooter />}
        <Toasts items={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (PublicPage) {
    return (
      <>
        <SiteNav route={route} />
        <main>
          <PublicPage />
        </main>
        <SiteFooter />
        <Toasts items={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const Page = AppPage ?? Overview;
  const meta = PAGE_META[route] ?? PAGE_META.overview;
  const required = REQUIRED[route];
  const allowed = !required || summary?.permissions?.includes(required);

  return (
    <>
      <AppNav />

      {projects.length === 0 ? (
        <div className="center-screen">
          <div className="card create-card">
            <span className="brand-mark">
              <LogoMark size={16} />
            </span>
            <h1>Create your first transition project</h1>
            <p className="muted">
              A project holds one handover: its authorized sources, extracted claims, detected gaps and the approved
              document an incoming member receives.
            </p>
            <Btn variant="primary" icon="plus" onClick={() => setNewProjectOpen(true)}>
              New transition project
            </Btn>
          </div>
        </div>
      ) : (
        <main className="app-main">
          <div className="page">
            {route === 'workspaces' ? null : <PageHeader meta={meta} />}
            {allowed ? <Page /> : <NoAccess role={summary?.roleLabel} />}
          </div>
        </main>
      )}

      <WorkspaceFooter />

      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
      <Toasts items={toasts} onDismiss={dismissToast} />
    </>
  );
}

function Splash() {
  return (
    <div className="splash">
      <span className="brand-mark">
        <LogoMark size={17} />
      </span>
      <strong>ContextBridge</strong>
      <span className="spinner" />
    </div>
  );
}

function PageHeader({ meta }) {
  const { summary, refresh, summaryLoading, route } = useApp();
  const approved = summary?.handover?.approvedVersion;

  return (
    <div className="page-head">
      <div>
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>Workspace</span>
          <Icon name="chevron" size={11} className="crumb-sep" />
          <span className="crumb-current">{meta.title}</span>
        </nav>
        <h1>{meta.title}</h1>
        <p>{meta.subtitle}</p>
      </div>
      <div className="page-head-meta">
        <Badge tone={approved ? 'success' : 'warning'} dot>
          {approved ? 'Approved' : 'Draft'}
        </Badge>
        <Badge>{summary?.roleLabel}</Badge>
        {route !== 'activity' && (
          <Btn variant="ghost" size="sm" icon="refresh" onClick={refresh} disabled={summaryLoading}>
            {summaryLoading ? 'Refreshing' : 'Refresh'}
          </Btn>
        )}
      </div>
    </div>
  );
}

function NoAccess({ role }) {
  return (
    <div className="locked">
      <span className="locked-icon">
        <Icon name="lock" size={19} />
      </span>
      <h2>Not available for {role ?? 'this role'}</h2>
      <p className="muted">
        Draft claims, gaps and sources are visible to reviewers and administrators. Incoming members receive the
        approved handover in the workspace instead.
      </p>
    </div>
  );
}
