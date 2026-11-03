import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, ArrowRightLeft, BadgeCheck, Bell, Check, ChevronDown, ChevronRight, Clock, Database, ExternalLink, Eye, FileText, GitBranch, Inbox, Laptop, LayoutGrid, ListChecks, Lock, LogOut, Play, Plus, RefreshCw, Search, Send, Settings, Shield, UserRoundPlus, X } from 'lucide-react';


export const cx = (...parts) => parts.filter(Boolean).join(' ');

const ICONS = {
  grid: LayoutGrid,
  database: Database,
  checkList: ListChecks,
  alert: AlertTriangle,
  file: FileText,
  laptop: Laptop,
  activity: Activity,
  search: Search,
  check: Check,
  x: X,
  refresh: RefreshCw,
  plus: Plus,
  lock: Lock,
  badgeCheck: BadgeCheck,
  send: Send,
  logout: LogOut,
  external: ExternalLink,
  clock: Clock,
  shield: Shield,
  branch: GitBranch,
  inbox: Inbox,
  arrow: ArrowRight,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  bell: Bell,
  eye: Eye,
  play: Play,
};

export function Icon({ name, size = 16, className = '', strokeWidth = 1.8 }) {
  const Glyph = ICONS[name] ?? ICONS.grid;
  return <Glyph className={cx('icon', className)} size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function Btn({ variant = 'default', size = 'md', icon, iconRight, className = '', children, ...props }) {
  return (
    <button className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} {...props}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={cx('card', className)} {...props}>
      {children}
    </div>
  );
}

export function Panel({ title, subtitle, count, action, className = '', children }) {
  return (
    <section className={cx('panel', className)}>
      {(title || action) && (
        <header className="panel-head">
          <div className="panel-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {count != null && <Badge>{count}</Badge>}
          <div className="spacer" />
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// A badge without an asserted tone takes one of seven tints, chosen from its
// own label. The mapping is a hash, so "Administrator" is always the same
// colour across every page while still differing from "Reviewer".
const BADGE_TONES = ['teal', 'blue', 'violet', 'pink', 'amber', 'sky', 'plum'];

function autoBadgeTone(children) {
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : '';
  let hash = 7;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 9973;
  }
  return text ? BADGE_TONES[hash % BADGE_TONES.length] : 'neutral';
}

export function Badge({ tone, dot, children, className }) {
  return (
    <span className={cx('badge', `badge-${tone ?? autoBadgeTone(children)}`, className)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

const AVATAR_TONES = ['slate', 'accent', 'amber', 'critical', 'indigo'];

// A role has no photograph, so it gets a glyph that says what the role does
// instead of a stranger's face or a bare pair of letters.
const ROLE_AVATARS = {
  administrator: Shield,
  admin: Shield,
  'workspace admin': Shield,
  reviewer: BadgeCheck,
  'departing engineer': ArrowRightLeft,
  'incoming member': UserRoundPlus,
  viewer: Eye,
  system: Settings,
};

// Two sources of real photographs. A GitHub login resolves to that account's
// own picture; a role label ("Reviewer") or a display name has no account
// behind it, so it takes a fixed portrait picked from its own letters. Either
// way the same person shows the same face on every page.
const ROLE_LABEL = /^(reviewer|admin|workspace admin|administrator|system|departing engineer|incoming member|departing member)$/i;
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

// Only a real account has a photograph. A role label ("reviewer", "admin") or
// a display name has no account behind it, so it gets a deterministic monogram
// rather than a stranger's stock portrait.
export function avatarImage(name = '') {
  const handle = name.trim();
  if (!handle || handle.includes(' ')) return null;
  if (ROLE_LABEL.test(handle)) return null;
  if (!GITHUB_LOGIN.test(handle)) return null;
  return `https://github.com/${handle}.png?size=96`;
}

export function Avatar({ name = '', size = 'md', title, src }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const seed = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const tone = AVATAR_TONES[seed % AVATAR_TONES.length];
  const image = src ?? avatarImage(name);
  const RoleGlyph = !image ? ROLE_AVATARS[name.trim().toLowerCase()] : null;

  // A role renders as a glyph, so no invented portrait ever stands for a job.
  if (RoleGlyph) {
    return (
      <span
        className={cx('avatar', 'avatar-glyph', `avatar-${size}`, `avatar-${tone}`)}
        title={title ?? name}
        aria-label={name}
      >
        <RoleGlyph size={size === 'xs' ? 9 : size === 'sm' ? 11 : 13} strokeWidth={2} />
      </span>
    );
  }

  // The photograph is a bonus: if it cannot be fetched the disc underneath is
  // already drawn, so the row never collapses or shows a broken icon.
  if (image && !broken) {
    return (
      <img
        className={cx('avatar', 'avatar-img', `avatar-${size}`, `avatar-${tone}`)}
        src={image}
        alt={name}
        title={title ?? name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className={cx('avatar', `avatar-${size}`, `avatar-${tone}`)} title={title ?? name}>
      {initials || '?'}
    </span>
  );
}
const NUMERIC = /^(\D*?)(-?[\d,]+(?:\.\d+)?)(.*)$/;

function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { number: value, decimals: 0, prefix: '', suffix: '', grouped: false };
  }
  if (typeof value !== 'string') return null;
  const match = value.match(NUMERIC);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const number = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;
  return {
    number,
    decimals: digits.includes('.') ? digits.split('.')[1].length : 0,
    prefix,
    suffix,
    grouped: digits.includes(','),
  };
}

function formatCount(parsed, current) {
  const fixed = parsed.decimals ? current.toFixed(parsed.decimals) : String(Math.round(current));
  const text = parsed.grouped
    ? Number(fixed).toLocaleString(undefined, {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals,
      })
    : fixed;
  return `${parsed.prefix}${text}${parsed.suffix}`;
}

// Counts a figure up on mount and whenever it changes. Numeric text only: a
// value like "—" or "Draft" renders untouched, and reduced-motion users get
// the final figure immediately.
export function CountUp({ value, duration = 850 }) {
  const parsed = useMemo(() => parseNumeric(value), [value]);
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [display, setDisplay] = useState(() => (parsed && !still ? formatCount(parsed, 0) : value));

  useEffect(() => {
    if (!parsed || still) {
      setDisplay(value);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(formatCount(parsed, parsed.number * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [parsed, value, duration, still]);

  return <>{display}</>;
}

export function StatCard({ label, value, hint, progress, tone = 'neutral' }) {
  return (
    <div className={cx('stat', `stat-${tone}`)}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">
        <CountUp value={value} />
      </strong>
      {progress != null && (
        <span className="stat-track">
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </span>
      )}
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Strength({ value }) {
  const level = value === 'high' ? 3 : value === 'medium' ? 2 : 1;
  return (
    <span className={cx('strength', `strength-${value}`)} title={`${value} evidence`}>
      <span className="bars">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= level ? 'on' : ''} />
        ))}
      </span>
      <em>{value}</em>
    </span>
  );
}

export function StatusPill({ status }) {
  const map = {
    pending: ['warning', 'Unverified'],
    verified: ['success', 'Verified'],
    edited: ['accent', 'Corrected'],
    rejected: ['critical', 'Rejected'],
  };
  const [tone, label] = map[status] ?? ['neutral', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const CATEGORY_TONE = {
  decision: 'accent',
  completed: 'success',
  in_progress: 'sky',
  unfinished: 'warning',
  blocker: 'critical',
  dependency: 'blue',
  risk: 'critical',
  responsibility: 'accent',
  question: 'warning',
  next_action: 'accent',
};

export function CategoryBadge({ category, label }) {
  return <Badge tone={CATEGORY_TONE[category] ?? 'neutral'}>{label ?? category}</Badge>;
}

export function SeverityDot({ severity }) {
  return <span className={cx('severity-dot', `severity-${severity}`)} title={severity} />;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Loading({ rows = 3 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="skeleton" />
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cx('segment', value === option.value && 'active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null && <span className="segment-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, description, onClose, children, footer, width = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={cx('modal', `modal-${width}`)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toasts({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((toast) => (
        <div key={toast.id} className={cx('toast', `toast-${toast.tone}`)}>
          <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'activity'} size={15} />
          <p>{toast.message}</p>
          <button type="button" className="icon-btn" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
