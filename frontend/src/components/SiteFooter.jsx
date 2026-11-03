import { ArrowUpRight, Code2, ShieldCheck } from 'lucide-react';
import { useApp } from '../store.jsx';
import { LogoMark } from './Logo.jsx';

// One footer, identical on every page. Only the spacing changes inside the
// product, so the content never drifts between public and signed-in routes.
const PLATFORM = [
  { label: 'Overview', route: 'platform' },
  { label: 'Knowledge Graph', route: 'knowledge-graph' },
  { label: 'Activity Intelligence', route: 'activity-intelligence' },
  { label: 'Handover', route: 'handover-intelligence' },
  { label: 'Security', route: 'security' },
];

const WORKSPACE = [
  { label: 'Dashboard', route: 'overview' },
  { label: 'Evidence review', route: 'claims' },
  { label: 'Risks & dependencies', route: 'gaps' },
  { label: 'Handover workspace', route: 'handover' },
  { label: 'Incoming member', route: 'workspace' },
];

const COMPANY = [
  { label: 'Privacy Policy', route: 'legal' },
  { label: 'Terms of Service', route: 'legal' },
];

export default function SiteFooter({ compact = false }) {
  const { go } = useApp();
  const year = new Date().getFullYear();

  return (
    <footer className={compact ? 'site-footer footer-compact' : 'site-footer'}>
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="footer-lockup">
              <span className="brand-mark">
                <LogoMark size={16} />
              </span>
              <span className="brand-word">ContextBridge</span>
            </span>
            <p className="footer-desc">
              Reconstructs project knowledge from authorized engineering records, links every statement to its evidence,
              and hands the result to an incoming member only after a human approves it.
            </p>
            <p className="footer-tagline">Never lose the knowledge behind the work.</p>
          </div>

          <div className="footer-col">
            <h3>Platform</h3>
            {PLATFORM.map((link) => (
              <button key={link.label} type="button" className="footer-link" onClick={() => go(link.route)}>
                {link.label}
              </button>
            ))}
          </div>

          <div className="footer-col">
            <h3>Workspace</h3>
            {WORKSPACE.map((link) => (
              <button key={link.label} type="button" className="footer-link" onClick={() => go(link.route)}>
                {link.label}
              </button>
            ))}
          </div>

          <div className="footer-col">
            <h3>Company</h3>
            {COMPANY.map((link) => (
              <button key={link.label} type="button" className="footer-link" onClick={() => go(link.route)}>
                {link.label}
              </button>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {year} ContextBridge. A demonstration build on live public repository data.</p>
          <div className="footer-social">
            <a
              className="footer-social-link"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <Code2 size={15} strokeWidth={1.8} />
              <ArrowUpRight size={11} strokeWidth={1.8} className="footer-external" />
            </a>
            <button type="button" className="footer-social-link" onClick={() => go('security')} aria-label="Security">
              <ShieldCheck size={15} strokeWidth={1.8} />
            </button>
            <span className="footer-legal">
              <button type="button" onClick={() => go('legal')}>
                Privacy
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => go('legal')}>
                Terms
              </button>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// The product keeps the same footer content, only tighter vertically.
export function WorkspaceFooter() {
  return <SiteFooter compact />;
}
