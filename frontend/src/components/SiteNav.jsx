import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import { LogoMark } from './Logo.jsx';
import { useApp } from '../store.jsx';
import { cx } from '../ui.jsx';

const LINKS = [
  { route: 'home', label: 'Overview' },
  { route: 'platform', label: 'Platform', menu: true },
  { route: 'knowledge-graph', label: 'Knowledge Graph' },
  { route: 'activity-intelligence', label: 'Activity' },
  { route: 'handover-intelligence', label: 'Handover' },
  { route: 'security', label: 'Security' },
];

const PLATFORM_MENU = [
  { route: 'platform', label: 'Platform overview', hint: 'Reconstruction, evidence, verification' },
  { route: 'knowledge-graph', label: 'Knowledge graph', hint: 'Who knows which part of the system' },
  { route: 'activity-intelligence', label: 'Activity intelligence', hint: 'History, contributors, snapshots' },
  { route: 'handover-intelligence', label: 'Handover', hint: 'What an incoming member receives' },
  { route: 'security', label: 'Security', hint: 'Permissions, provenance, approval' },
];

export default function SiteNav({ route }) {
  const { go, user } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className={cx('site-nav', compact && 'is-compact')}>
      <div className="site-nav-inner">
        <button type="button" className="brand" onClick={() => go('home')} aria-label="ContextBridge home">
          <span className="brand-mark">
            <LogoMark size={16} />
          </span>
          <span className="brand-word">ContextBridge</span>
        </button>

        <nav className="site-links" aria-label="Primary">
          {LINKS.map((link) =>
            link.menu ? (
              <div className="nav-drop" key={link.route} ref={menuRef}>
                <button
                  type="button"
                  className={cx('site-link', 'nav-drop-trigger', route.startsWith('platform') || link.route === route ? 'is-active' : '')}
                  onClick={() => setMenuOpen((value) => !value)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  {link.label}
                  <ChevronDown size={13} strokeWidth={1.8} />
                </button>
                {menuOpen && (
                  <div className="nav-drop-panel" role="menu">
                    {PLATFORM_MENU.map((item) => (
                      <button
                        key={item.route}
                        type="button"
                        role="menuitem"
                        className={cx('nav-drop-item', route === item.route && 'is-active')}
                        onClick={() => go(item.route)}
                      >
                        <span className="nav-drop-label">{item.label}</span>
                        <span className="nav-drop-hint">{item.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={link.route}
                type="button"
                className={cx('site-link', route === link.route && 'is-active')}
                onClick={() => go(link.route)}
                aria-current={route === link.route ? 'page' : undefined}
              >
                {link.label}
              </button>
            ),
          )}
        </nav>

        <div className="site-actions">
          {route === 'sign-in' ? null : user ? (
            <>
              <span className="site-user">
                {user.name}
                <span className="site-user-role">signed in</span>
              </span>
              <button type="button" className="btn btn-primary btn-md" onClick={() => go('workspaces')}>
                Open workspace
                <ArrowRight size={14} strokeWidth={1.9} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost btn-md" onClick={() => go('sign-in')}>
                Sign in
              </button>
              <button type="button" className="btn btn-primary btn-md" onClick={() => go('sign-in')}>
                Open workspace
                <ArrowRight size={14} strokeWidth={1.9} />
              </button>
            </>
          )}
          <button
            type="button"
            className="site-burger"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} strokeWidth={1.8} /> : <Menu size={18} strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="site-mobile">
          {LINKS.map((link) => (
            <button key={link.route} type="button" className="site-mobile-link" onClick={() => go(link.route)}>
              {link.label}
            </button>
          ))}
          {route === 'sign-in' ? null : (
            <div className="site-mobile-actions">
              <button type="button" className="btn btn-ghost btn-md" onClick={() => go('sign-in')}>
                Sign in
              </button>
              <button type="button" className="btn btn-primary btn-md" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
                {user ? 'Open workspace' : 'Get started'}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
