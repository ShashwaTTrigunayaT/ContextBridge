// Product previews for the public pages. They are built from the same markup and
// design tokens as the real product screens; figures are passed in from the live
// workspace where the API exposes them.

export function PreviewFrame({ title, status, children, tone = 'default' }) {
  return (
    <div className={`preview preview-${tone}`}>
      <div className="preview-bar">
        <span className="preview-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="preview-title">{title}</span>
        {status && <span className={`badge badge-${status.tone ?? 'neutral'}`}>{status.label}</span>}
      </div>
      <div className="preview-body">{children}</div>
    </div>
  );
}

export function StageFlow() {
  return (
    <div className="stage-flow">
      <article className="stage">
        <span className="stage-index">01 · Before</span>
        <h3>Scattered activity</h3>
        <p>Commits, reviews, pull requests and documents sit in separate tools with no shared meaning.</p>
        <div className="stage-visual">
          <span className="stage-chip">commit 8f2c1a</span>
          <span className="stage-chip">PR #412</span>
          <span className="stage-chip stage-chip-flat">ADR-004</span>
          <span className="stage-chip">issue #318</span>
          <span className="stage-chip stage-chip-flat">review note</span>
          <span className="stage-chip">retry-policy.ts</span>
        </div>
      </article>

      <article className="stage stage-active">
        <span className="stage-index">02 · Reconstruct</span>
        <h3>Connected project knowledge</h3>
        <p>Records become claims about decisions, owners, unfinished work and risks — each one tied to its excerpt.</p>
        <div className="stage-visual">
          <div className="stage-pair">
            <span className="stage-node">retry-policy</span>
            <span className="stage-edge" aria-hidden="true" />
            <span className="stage-node">PR #412</span>
          </div>
          <div className="stage-pair">
            <span className="stage-node">caching</span>
            <span className="stage-edge" aria-hidden="true" />
            <span className="stage-node">ADR-004</span>
          </div>
          <div className="stage-claim">
            <span className="badge badge-accent">Decision</span>
            <span>Exponential backoff was chosen over fixed retries.</span>
          </div>
        </div>
      </article>

      <article className="stage">
        <span className="stage-index">03 · After</span>
        <h3>Verified handover</h3>
        <p>A reviewer approves a frozen version. The incoming member receives it with gaps named explicitly.</p>
        <div className="stage-visual">
          <div className="stage-doc">
            <div className="stage-doc-head">
              <span>Handover · v1</span>
              <span className="badge badge-success badge-dot-inline">Approved</span>
            </div>
            <span className="stage-doc-line" />
            <span className="stage-doc-line stage-doc-line-short" />
            <span className="stage-doc-line" />
            <span className="stage-doc-gap">3 named gaps · 0 restricted excerpts</span>
          </div>
        </div>
      </article>
    </div>
  );
}

export function DashboardPreview({ stats }) {
  const claims = stats?.claims ?? 0;
  const pct = (value) => (claims ? Math.round((value / claims) * 100) : 0);
  const reviewed = pct(stats?.reviewedClaims ?? 0);
  const pending = pct(stats?.pendingClaims ?? 0);
  const rejected = pct(stats?.rejectedClaims ?? 0);

  return (
    <PreviewFrame
      title={stats?.repo ? `workspace · ${stats.repo}` : 'workspace · dashboard'}
      status={stats ? { label: 'Live', tone: 'success' } : { label: 'Example', tone: 'neutral' }}
    >
      <div className="preview-kpis">
        <div className="stat">
          <span className="stat-label">Source records</span>
          <strong className="stat-value">{stats ? stats.records : '—'}</strong>
          <span className="stat-hint">{stats ? `${stats.sources} source${stats.sources === 1 ? '' : 's'}` : 'not connected'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Claims</span>
          <strong className="stat-value">{stats ? stats.claims : '—'}</strong>
          <span className="stat-hint">evidence-linked</span>
        </div>
        <div className="stat">
          <span className="stat-label">Corroborated</span>
          <strong className="stat-value">{stats ? `${pct(stats.corroborated)}%` : '—'}</strong>
          <span className="stat-track">
            <span style={{ width: `${pct(stats?.corroborated ?? 0)}%` }} />
          </span>
        </div>
        <div className="stat stat-critical">
          <span className="stat-label">Open gaps</span>
          <strong className="stat-value">{stats ? stats.gaps : '—'}</strong>
          <span className="stat-hint">{stats ? `${stats.severeGaps} high severity` : 'awaiting import'}</span>
        </div>
      </div>

      <div className="preview-chart">
        <div className="chart-head">
          <span className="chart-title">Review coverage</span>
          <div className="chart-legend">
            <span className="legend-item">
              <i className="legend-swatch swatch-success" /> Reviewed
            </span>
            <span className="legend-item">
              <i className="legend-swatch swatch-warning" /> Pending
            </span>
            <span className="legend-item">
              <i className="legend-swatch swatch-critical" /> Rejected
            </span>
          </div>
        </div>
        <div className="chart-bar">
          <span className="seg-success" style={{ width: `${reviewed}%` }} />
          <span className="seg-warning" style={{ width: `${pending}%` }} />
          <span className="seg-critical" style={{ width: `${rejected}%` }} />
        </div>
      </div>

      <div className="preview-rows">
        <div className="preview-row">
          <span className="severity-dot severity-high" />
          <span className="preview-row-text">Webhook replay job has no owner since the handover started</span>
          <span className="badge badge-critical">high</span>
        </div>
        <div className="preview-row">
          <span className="severity-dot severity-medium" />
          <span className="preview-row-text">Settlement retention is stated as 24 hours and 7 days in two records</span>
          <span className="badge badge-warning">medium</span>
        </div>
        <div className="preview-row">
          <span className="severity-dot severity-low" />
          <span className="preview-row-text">No documentation covers the acquirer settlement cut-off</span>
          <span className="badge badge-neutral">low</span>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function EvidencePreview() {
  return (
    <PreviewFrame title="Evidence review · 1 of 61 claims" status={{ label: 'Unverified', tone: 'warning' }}>
      <div className="preview-claim">
        <p className="preview-claim-text">
          The team chose exponential backoff with jitter for acquirer retries instead of a fixed retry interval.
        </p>
        <div className="claim-meta">
          <span className="badge badge-accent">Decision</span>
          <span className="strength strength-high">
            <span className="bars">
              <i className="on" />
              <i className="on" />
              <i className="on" />
            </span>
            <em>high</em>
          </span>
          <span className="badge badge-neutral mono">retry-policy</span>
        </div>
      </div>

      <div className="preview-evidence">
        <div className="evidence-head">
          <strong>GitHub activity</strong>
          <span>Retry policy discussion</span>
          <span className="mono">pull_request/412</span>
        </div>
        <p>“Fixed retries hammered the acquirer during the incident. We agreed on exponential backoff with jitter.”</p>
      </div>
      <div className="preview-evidence">
        <div className="evidence-head">
          <strong>ADR-004 caching</strong>
          <span>Decision record</span>
          <span className="mono">doc/adr-004</span>
        </div>
        <p>“Retry interval: exponential, capped at 30 seconds. Fixed intervals were rejected after the outage.”</p>
      </div>

      <div className="preview-actions">
        <span className="btn btn-sm btn-primary">Verify</span>
        <span className="btn btn-sm btn-ghost">Correct text</span>
        <span className="btn btn-sm btn-ghost">Reject with reason</span>
      </div>
    </PreviewFrame>
  );
}

const TIMELINE_ROWS = [
  { time: '09:14', actor: 'Aisha Rahman', action: 'opened', target: 'PR #412 retry-policy backoff', tone: 'accent' },
  { time: '11:02', actor: 'Daniel Okafor', action: 'reviewed', target: 'PR #412', tone: 'neutral' },
  { time: '14:38', actor: 'Aisha Rahman', action: 'merged', target: 'PR #408 settlement cache', tone: 'success' },
  { time: '16:20', actor: 'Priya Nair', action: 'uploaded', target: 'ADR-004 caching strategy', tone: 'neutral' },
  { time: '17:45', actor: 'Aisha Rahman', action: 'commented', target: 'issue #318 replay job unassigned', tone: 'warning' },
];

export function TimelinePreview() {
  return (
    <PreviewFrame title="Project activity · last 30 days" status={{ label: 'Live', tone: 'success' }}>
      <ol className="timeline">
        {TIMELINE_ROWS.map((row) => (
          <li className="timeline-row" key={`${row.time}-${row.target}`}>
            <span className="timeline-time mono">{row.time}</span>
            <span className={`timeline-dot timeline-dot-${row.tone}`} aria-hidden="true" />
            <span className="timeline-text">
              <strong>{row.actor}</strong> {row.action} <span className="timeline-target">{row.target}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="preview-note">
        Reconstruction recorded 61 claims from these 21 records; every entry keeps the record it came from.
      </p>
    </PreviewFrame>
  );
}

const HANDOVER_SECTIONS = [
  ['Next actions', 6, 'Prioritized from open gaps'],
  ['Unfinished work', 8, 'Open pull requests and issues'],
  ['Technical decisions', 11, 'With the reasoning behind each one'],
  ['Responsibilities', 5, 'Who owned which component'],
  ['Known risks', 4, 'Where it would hurt if it breaks'],
  ['Unresolved questions', 3, 'Named, not guessed'],
];

export function HandoverPreview() {
  return (
    <PreviewFrame title="Handover draft · payments-service" status={{ label: 'Awaiting review', tone: 'warning' }}>
      <ul className="preview-doclist">
        {HANDOVER_SECTIONS.map(([title, count, hint]) => (
          <li className="preview-docrow" key={title}>
            <span className="preview-docrow-title">{title}</span>
            <span className="preview-docrow-hint">{hint}</span>
            <span className="doc-count">{count}</span>
          </li>
        ))}
      </ul>
      <div className="preview-footer">
        <span className="mini-label">Evidence coverage</span>
        <span className="preview-footer-value">100%</span>
        <span className="hint">2 claims excluded — restricted source only</span>
      </div>
    </PreviewFrame>
  );
}
