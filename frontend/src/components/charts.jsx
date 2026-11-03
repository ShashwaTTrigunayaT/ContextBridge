import { cx } from '../ui.jsx';

// Charts built from figures the API already returns. Nothing here fabricates a
// series: if the counts are zero the chart is empty, not invented. Every bar
// carries its own legend, so a row reads without consulting a key.

export function BarChart({ data, label, unit, tone = 'accent' }) {
  const peak = Math.max(1, ...data.map((row) => row.value));
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!data.length) return null;

  return (
    <div
      className="bars"
      role="img"
      aria-label={`${label}: ${data.map((row) => `${row.label} ${row.value}`).join(', ')}`}
    >
      <ul className="bars-list">
        {data.map((row, index) => {
          const rowTone = row.tone ?? tone;
          return (
            <li className="bars-row" key={row.label}>
              <span className="bars-legend">
                <i className={cx('bars-dot', `bars-dot-${rowTone}`)} aria-hidden="true" />
                <span className="bars-label" title={row.label}>
                  {row.label}
                </span>
              </span>
              <span className="bars-track">
                <span
                  className={cx('bars-fill', `bars-fill-${rowTone}`)}
                  style={{ width: row.value ? `${Math.max(1.5, (row.value / peak) * 100)}%` : 0 }}
                />
              </span>
              <span className="bars-value">
                {row.value}
                {unit && row.value ? <em>{unit}</em> : null}
                {total > 0 && <span className="bars-share">/ {Math.round((row.value / total) * 100)}%</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Columns with no asserted tone alternate through the pink-to-purple band,
// so a category chart reads as a set of distinct series rather than one wash.
const COLUMN_SERIES = ['#DB2777', '#8B5CF6', '#BE185D', '#7C3AED', '#EC4899', '#9333EA'];

export function ColumnChart({ data, label, height = 112, ticks = 4 }) {
  const peak = Math.max(1, ...data.map((row) => row.value));
  if (!data.length) return null;
  const every = Math.max(1, Math.round(data.length / ticks));
  const total = data.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="cols" role="img" aria-label={`${label}: ${data.map((row) => `${row.label} ${row.value}`).join(', ')}`}>
      {/* Both rows are given the same explicit column template, so a tick can
          never drift from the bar above it. */}
      <div className="cols-plot" style={{ height, gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((row, index) => {
          // 74%, not 100%: the tallest bar leaves the vertical room its own
          // value label needs, so no label ever collides with the panel edge.
          const pct = row.value ? Math.max(3, (row.value / peak) * 74) : 0;
          return (
            <div className="cols-slot" key={row.label} title={`${row.label}: ${row.value}`}>
              <span className="cols-value" style={{ bottom: `calc(${pct}% + 6px)` }}>
                {row.value}
                {total > 0 && row.value > 0 && <em>{Math.round((row.value / total) * 100)}%</em>}
              </span>
              <span
                className={cx('cols-bar', row.tone && `cols-bar-${row.tone}`, row.value === 0 && 'is-empty')}
                style={{
                  '--h': `${pct}%`,
                  ...(row.tone ? {} : { background: COLUMN_SERIES[index % COLUMN_SERIES.length] }),
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="cols-axis" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((row, index) => (
          <span className="cols-tick" key={row.label}>
            {index % every === 0 ? row.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const DONUT_COLOURS = {
  accent: 'var(--chart-blue)',
  success: 'var(--chart-green)',
  warning: 'var(--chart-amber)',
  critical: 'var(--critical)',
  neutral: 'var(--chart-slate)',
  violet: 'var(--chart-violet)',
  cyan: 'var(--chart-cyan)',
};

// A ring for composition: it stays legible when a project only has two or three
// action types, where a column chart collapses into one wide bar.
export function DonutChart({ data, label = 'total', size = 148 }) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!data.length || !total) return null;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut">
      <div className="donut-plot">
        <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={label}>
          <circle className="donut-track" cx="70" cy="70" r={radius} />
          {data.map((row, index) => {
            const share = row.value / total;
            const dash = share * circumference;
            const circle = (
              <circle
                key={row.label}
                className="donut-seg"
                cx="70"
                cy="70"
                r={radius}
                stroke={DONUT_COLOURS[row.tone ?? 'accent'] ?? DONUT_COLOURS.accent}
                strokeDasharray={`${Math.max(dash - 2.5, 0)} ${circumference}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <strong>{total}</strong>
          <span>{label}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {data.map((row) => (
          <li key={row.label}>
            <i className={cx('bars-dot', `bars-dot-${row.tone ?? 'accent'}`)} aria-hidden="true" />
            <span className="donut-label">{row.label}</span>
            <span className="donut-value">
              {row.value}
              <em>{Math.round((row.value / total) * 100)}%</em>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
