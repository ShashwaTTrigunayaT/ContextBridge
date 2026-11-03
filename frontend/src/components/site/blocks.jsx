import { ArrowRight, Check } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { cx } from '../../ui.jsx';

export function PageHero({ eyebrow, title, lead, actions, children, size = 'md' }) {
  return (
    <section className={cx('page-hero', `page-hero-${size}`)}>
      <div className="wrap">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="page-hero-lead">{lead}</p>}
        {actions && <div className="page-hero-actions">{actions}</div>}
        {children}
      </div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, lead, action }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {lead && <p className="section-lead">{lead}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

export function Feature({ glyph: Glyph, title, children, meta }) {
  return (
    <article className="feature">
      <span className="feature-icon">
        <Glyph size={17} strokeWidth={1.7} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {meta && <span className="feature-meta">{meta}</span>}
    </article>
  );
}

export function CheckItem({ children }) {
  return (
    <li className="check-item">
      <Check size={14} strokeWidth={2.2} className="check-tick" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function CtaBand({ title, lead, primaryLabel = 'Open workspace', secondary }) {
  const { go, user } = useApp();
  return (
    <section className="cta-band">
      <div className="wrap cta-band-inner">
        <div>
          <h2>{title}</h2>
          <p>{lead}</p>
        </div>
        <div className="cta-band-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
            {primaryLabel}
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
          {secondary && (
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => go(secondary.route)}>
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
