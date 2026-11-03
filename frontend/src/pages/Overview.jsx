import { useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Play, Users } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { KIND_LABELS } from '../components/Document.jsx';
import { ColumnChart } from '../components/charts.jsx';
import { Avatar, Badge, Btn, CountUp, Empty, Loading, Strength, cx } from '../ui.jsx';

const SEVERITY_RANK = { critical: 3, high: 3, medium: 2, low: 1 };

export default function Overview() {
  const { summary, projectId, refresh, notify, go } = useApp();
  const [transitionUserId, setTransitionUserId] = useState(null);
  const [busy, setBusy] = useState(false);
  const claimsQuery = useAsync(() => api(`/projects/${projectId}/claims`), [projectId]);
  const gapsQuery = useAsync(() => api(`/projects/${projectId}/gaps`), [projectId]);

  const claims = claimsQuery.data?.claims ?? [];
  const categoryChart = useMemo(() => {
    const totals = new Map();
    for (const claim of claims) {
      const label = claim.categoryLabel ?? claim.category ?? 'other';
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, value]) => ({ label: category, value }));
  }, [claims]);

  // Every hook has to run before this return, or the hook order changes between
  // the loading render and the loaded render.
  if (!summary) return <Loading rows={4} />;

  const counts = summary.counts;
  const approved = summary.handover?.approvedVersion;
  const transition = summary.transitionUser;
  const canReconstruct = summary.permissions.includes('reconstruct');
  const canReview = summary.permissions.includes('claim:review');
  const selectedTransition = transitionUserId ?? transition?.id ?? '';

  const gaps = gapsQuery.data?.gaps ?? [];
  const reviewed = counts.reviewedClaims ?? 0;
  const readiness = counts.claims ? Math.round((reviewed / counts.claims) * 100) : 0;
  const priorityGaps = [...gaps]
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))
    .slice(0, 5);
  const unfinished = claims
    .filter((claim) => claim.category === 'unfinished' || claim.category === 'in_progress')
    .slice(0, 5);
  const decisions = claims.filter((claim) => claim.category === 'decision').slice(0, 4);
  const singleOwner = summary.components.filter((component) => (component.contributors ?? []).length === 1);

  const steps = [
    { label: 'Connect', done: counts.records > 0 },
    { label: 'Reconstruct', done: counts.claims > 0 },
    { label: 'Review', done: counts.claims > 0 && counts.pendingClaims === 0 },
    { label: 'Approve', done: Boolean(approved) },
  ];
  const currentIndex = steps.findIndex((step) => !step.done);

  async function reconstruct() {
    setBusy(true);
    try {
      const result = await api(`/projects/${projectId}/reconstruct`, {
        method: 'POST',
        body: { transitionUserId: selectedTransition || undefined },
      });
      notify(`Rebuilt ${result.claims} claims and ${result.gaps} gaps from ${result.records} records.`, 'success');
      await refresh();
      claimsQuery.reload?.();
      gapsQuery.reload?.();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ws-page">
      <section className="ws-context">
        <div className="ws-context-main">
          <span className="ws-context-label">Transition</span>
          <strong>{transition ? `${transition.name} → incoming member` : 'No departing member selected'}</strong>
          <span className="ws-context-meta">
            {transition
              ? `${transition.title ?? 'Departing member'} · ${counts.records} authorized records · ${counts.claims} claims`
              : 'Select who is leaving, then connect sources and reconstruct.'}
          </span>
        </div>

        <ol className="ws-steps">
          {steps.map((step, index) => (
            <li key={step.label} className={cx(step.done && 'is-done', !step.done && index === currentIndex && 'is-current')}>
              <span className="ws-step-dot">{step.done ? <CircleCheck size={12} strokeWidth={2} /> : index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>

        <div className="ws-context-actions">
          {approved ? (
            <Btn variant="primary" size="sm" icon="file" onClick={() => go('handover')}>
              Open approved handover
            </Btn>
          ) : canReconstruct ? (
            <Btn variant="primary" size="sm" icon="play" onClick={reconstruct} disabled={busy}>
              {busy ? 'Reconstructing…' : 'Run reconstruction'}
            </Btn>
          ) : null}
          <Btn variant="ghost" size="sm" icon="laptop" onClick={() => go('workspace')}>
            Incoming
          </Btn>
        </div>
      </section>

      <div className="ws-kpis">
        <div className="ws-kpi">
          <span className="ws-kpi-label">Source records</span>
          <strong className="ws-kpi-value">
            <CountUp value={counts.records} />
          </strong>
          <span className="ws-kpi-hint">
            {summary.sources.length} connected source{summary.sources.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="ws-kpi">
          <span className="ws-kpi-label">Claims</span>
          <strong className="ws-kpi-value">
            <CountUp value={counts.claims} />
          </strong>
          <span className="ws-kpi-hint">{counts.pendingClaims} awaiting review</span>
        </div>
        <div className="ws-kpi">
          <span className="ws-kpi-label">Corroborated</span>
          <strong className="ws-kpi-value">
            <CountUp value={`${counts.corroborationRate}%`} />
          </strong>
          <span className="ws-kpi-track">
            <span style={{ width: `${counts.corroborationRate}%` }} />
          </span>
          <span className="ws-kpi-hint">{counts.corroborated} backed by 2+ sources</span>
        </div>
        <div className={cx('ws-kpi', counts.severeGaps > 0 && 'is-critical')}>
          <span className="ws-kpi-label">Open gaps</span>
          <strong className="ws-kpi-value">
            <CountUp value={counts.openGaps} />
          </strong>
          <span className="ws-kpi-hint">
            {counts.severeGaps > 0 ? (
              <>
                <CircleAlert size={12} strokeWidth={2} /> {counts.severeGaps} high severity
              </>
            ) : (
              'No high-severity gaps'
            )}
          </span>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-col">
          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Review coverage</h2>
                <p className="ws-block-sub">Human decisions recorded against {counts.claims} claims</p>
              </div>
              <div className="ws-legend">
                <span className="legend-item">
                  <i className="legend-swatch swatch-success" /> Reviewed {counts.reviewedClaims}
                </span>
                <span className="legend-item">
                  <i className="legend-swatch swatch-warning" /> Pending {counts.pendingClaims}
                </span>
                <span className="legend-item">
                  <i className="legend-swatch swatch-critical" /> Rejected {counts.rejectedClaims}
                </span>
              </div>
            </header>
            <div className="ws-chart">
              <div
                className="ws-chart-bar"
                role="img"
                aria-label={`${counts.reviewedClaims} reviewed, ${counts.pendingClaims} pending, ${counts.rejectedClaims} rejected of ${counts.claims} claims`}
              >
                <span className="seg-success" style={{ width: `${share(counts.reviewedClaims, counts.claims)}%` }} />
                <span className="seg-warning" style={{ width: `${share(counts.pendingClaims, counts.claims)}%` }} />
                <span className="seg-critical" style={{ width: `${share(counts.rejectedClaims, counts.claims)}%` }} />
              </div>
              <div className="ws-chart-axis">
                <span>0</span>
                <span>{counts.claims} claims · {counts.corroborationRate}% corroborated</span>
                <span>100%</span>
              </div>
            </div>
          </section>

          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Claims by category</h2>
                <p className="ws-block-sub">Distribution across {claims.length} reconstructed claims</p>
              </div>
            </header>
            {categoryChart.length ? (
              <ColumnChart data={categoryChart} label="Claims by category" height={168} />
            ) : (
              <Empty icon="checkList" title="No claims to chart">
                Run reconstruction to classify the imported records.
              </Empty>
            )}
          </section>

          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Priority queue</h2>
                <p className="ws-block-sub">Deterministic gaps, highest severity first</p>
              </div>
              {canReview && (
                <Btn variant="ghost" size="sm" iconRight="arrow" onClick={() => go('gaps')}>
                  All {gaps.length} gaps
                </Btn>
              )}
            </header>
            {priorityGaps.length ? (
              <table className="ws-table">
                <thead>
                  <tr>
                    <th className="ws-col-sev">Severity</th>
                    <th>Gap</th>
                    <th className="ws-col-type">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityGaps.map((gap) => (
                    <tr key={gap.id}>
                      <td>
                        <Badge tone={severityTone(gap.severity)} dot>
                          {gap.severity}
                        </Badge>
                      </td>
                      <td>
                        <span className="ws-cell-title">{gap.title}</span>
                        {gap.detail && <span className="ws-cell-sub">{gap.detail}</span>}
                      </td>
                      <td className="ws-cell-muted">{KIND_LABELS[gap.kind] ?? gap.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty icon="checkList" title="No open gaps">
                Every recorded claim has an owner, a review state and no contradiction.
              </Empty>
            )}
          </section>

          <div className="ws-pair">
            <section className="ws-block">
              <header className="ws-block-head">
                <div>
                  <h2 className="ws-block-title">Unfinished work</h2>
                  <p className="ws-block-sub">Open pull requests and issues</p>
                </div>
              </header>
              {unfinished.length ? (
                <div className="ws-list">
                  {unfinished.map((claim) => (
                    <div className="ws-list-item" key={claim.id}>
                      <span className="ws-item-text">{claim.text}</span>
                      <span className="ws-item-meta">
                        <span className="mono">{claim.component ?? 'unassigned'}</span>
                        <span>{claim.evidence.length} src</span>
                        <Badge tone={claim.status === 'pending' ? 'warning' : 'success'}>{claim.status}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon="checkList" title="No unfinished work detected">
                  Import a source and reconstruct to see open pull requests and issues.
                </Empty>
              )}
            </section>

            <section className="ws-block">
              <header className="ws-block-head">
                <div>
                  <h2 className="ws-block-title">Decisions</h2>
                  <p className="ws-block-sub">With the reasoning behind them</p>
                </div>
              </header>
              {decisions.length ? (
                <div className="ws-list">
                  {decisions.map((claim) => (
                    <div className="ws-list-item" key={claim.id}>
                      <span className="ws-item-text">{claim.text}</span>
                      <span className="ws-item-meta">
                        <Strength value={claim.evidenceStrength} />
                        <span className="mono">{claim.component ?? 'project-wide'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon="file" title="No decisions recorded">
                  Decisions appear when a record states one, with the excerpt that supports it.
                </Empty>
              )}
            </section>
          </div>
        </div>

        <aside className="ws-col ws-col-side">
          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Handover readiness</h2>
              </div>
            </header>
            <div className="ws-readiness">
              <div className="ws-readiness-value">
                <strong>
                  <CountUp value={`${readiness}%`} />
                </strong>
                <span>{reviewed} of {counts.claims} claims reviewed</span>
              </div>
              <div className="ws-chart-bar ws-chart-bar-sm" role="img" aria-label={`${readiness}% of claims reviewed`}>
                <span className="seg-success" style={{ width: `${readiness}%` }} />
                <span className="seg-warning" style={{ width: `${100 - readiness}%` }} />
              </div>
              <dl className="ws-kv">
                <div>
                  <dt>Approval</dt>
                  <dd>{approved ? `Version ${approved}` : 'Not approved'}</dd>
                </div>
                <div>
                  <dt>High-severity gaps</dt>
                  <dd>{counts.severeGaps}</dd>
                </div>
                <div>
                  <dt>Single-owner components</dt>
                  <dd>{singleOwner.length}</dd>
                </div>
                <div>
                  <dt>Awaiting review</dt>
                  <dd>{counts.pendingClaims}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Sources</h2>
                <p className="ws-block-sub">Authorized inputs</p>
              </div>
              {summary.permissions.includes('source:connect') && (
                <Btn variant="ghost" size="sm" iconRight="arrow" onClick={() => go('sources')}>
                  Manage
                </Btn>
              )}
            </header>
            {summary.sources.length ? (
              <div className="ws-list">
                {summary.sources.map((source) => (
                  <div className="ws-list-item ws-source" key={source.id}>
                    <span className={cx('ws-source-icon', source.visibility === 'restricted' && 'is-restricted')}>
                      <Users size={13} strokeWidth={1.9} />
                    </span>
                    <span className="ws-item-text">{source.name}</span>
                    <span className="ws-item-meta">
                      <span>{source.records} rec</span>
                      <Badge tone={source.visibility === 'restricted' ? 'critical' : 'info'}>
                        {source.visibility}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon="database" title="No sources connected">
                Connect a GitHub repository or upload a document to begin.
              </Empty>
            )}
          </section>

          <section className="ws-block">
            <header className="ws-block-head">
              <div>
                <h2 className="ws-block-title">Transition controls</h2>
                <p className="ws-block-sub">Who leaves, what reviewers do next</p>
              </div>
            </header>
            <div className="ws-controls">
              <label className="field">
                <span className="field-label">Departing member</span>
                <select
                  value={selectedTransition}
                  onChange={(event) => setTransitionUserId(event.target.value)}
                  disabled={!canReconstruct || Boolean(approved)}
                >
                  <option value="">Not selected</option>
                  {summary.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} — {member.title ?? member.role}
                    </option>
                  ))}
                </select>
              </label>

              {approved ? (
                <p className="ws-note">
                  <CircleCheck size={13} strokeWidth={2} />
                  Approved version {approved}. Reconstruction is locked so approved history is never silently rewritten.
                </p>
              ) : canReconstruct ? (
                <>
                  <Btn variant="default" size="sm" icon="play" onClick={reconstruct} disabled={busy}>
                    {busy ? 'Reconstructing…' : 'Re-run reconstruction'}
                  </Btn>
                  <p className="hint">
                    Rebuilds claims, evidence and gaps. Reviewed claims reset, so review after the final ingestion.
                  </p>
                </>
              ) : (
                <p className="hint">Your role can read the handover but not rebuild it.</p>
              )}

              <div className="ws-review-state">
                <span>{counts.reviewedClaims}/{counts.claims} reviewed</span>
                <span>{counts.rejectedClaims} rejected</span>
                {canReview && (
                  <Btn variant="ghost" size="sm" iconRight="arrow" onClick={() => go('claims')}>
                    Review
                  </Btn>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="ws-split">
        <section className="ws-block">
          <header className="ws-block-head">
            <div>
              <h2 className="ws-block-title">Components</h2>
              <p className="ws-block-sub">Where the work lives, and who knows it</p>
            </div>
            {singleOwner.length > 0 && <Badge tone="warning">{singleOwner.length} single-owner</Badge>}
          </header>
          {summary.components.length ? (
            <table className="ws-table ws-table-components">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="ws-col-num">Records</th>
                  <th>Contributors</th>
                </tr>
              </thead>
              <tbody>
                {summary.components.map((component) => {
                  const owners = component.contributors ?? [];
                  return (
                    <tr key={component.name}>
                      <td>
                        <span className="mono ws-cell-title">{component.name}</span>
                      </td>
                      <td className="ws-col-num ws-cell-muted">{component.records ?? 0}</td>
                      <td>
                        <span className="ws-people">
                          <span className="ws-owners">
                            {owners.map((person) => (
                              <span
                                className="ws-person"
                                key={person.name}
                                title={`${person.name} · ${person.count} contributions`}
                              >
                                <Avatar name={person.name} size="xs" />
                                <span className="ws-person-name">{person.name.split(' ')[0]}</span>
                              </span>
                            ))}
                          </span>
                          {owners.length === 1 && <Badge tone="warning">only owner</Badge>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty icon="database" title="No components detected">
              Import a source and run reconstruction to see which parts of the system the departing member owns.
            </Empty>
          )}
        </section>

        <section className="ws-block">
          <header className="ws-block-head">
            <div>
              <h2 className="ws-block-title">Project team</h2>
              <p className="ws-block-sub">Roles decide what each person sees</p>
            </div>
          </header>
          <div className="ws-list">
            {summary.members.map((member) => (
              <div className="ws-list-item ws-member" key={member.userId}>
                <Avatar name={member.name} size="sm" />
                <span className="ws-item-text">
                  <span className="ws-item-name">
                    {member.name}
                    {member.userId === transition?.id && <Badge tone="warning">departing</Badge>}
                  </span>
                  <span className="ws-item-meta">{member.title ?? ''}</span>
                </span>
                <Badge>{member.role}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      {!approved && canReview && counts.pendingClaims > 0 && (
        <p className="ws-footnote">
          <CircleAlert size={13} strokeWidth={2} />
          {counts.pendingClaims} claim{counts.pendingClaims === 1 ? '' : 's'} still unverified. The handover can be
          approved without them, but they stay labelled as unverified.
          <button type="button" className="ws-link" onClick={() => go('claims')}>
            Open evidence review <ArrowRight size={12} strokeWidth={2} />
          </button>
        </p>
      )}
    </div>
  );
}

function share(part = 0, total = 0) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

function severityTone(severity) {
  if (severity === 'high' || severity === 'critical') return 'critical';
  if (severity === 'medium') return 'warning';
  return 'neutral';
}
