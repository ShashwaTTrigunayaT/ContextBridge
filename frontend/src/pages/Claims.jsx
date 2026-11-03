import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync, useDebounced } from '../hooks.js';
import {
  Badge,
  Btn,
  CategoryBadge,
  Empty,
  Field,
  Icon,
  Loading,
  Modal,
  Panel,
  Segmented,
  StatusPill,
  Strength,
  cx,
} from '../ui.jsx';

export default function Claims() {
  const { projectId, refresh, notify, summary, search, setSearch } = useApp();
  const { data, loading, error, reload } = useAsync(() => api(`/projects/${projectId}/claims`), [projectId]);
  const searchTerm = useDebounced(search);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [action, setAction] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(null);
  const [assist, setAssist] = useState(null);
  const [assisting, setAssisting] = useState(false);

  const claims = data?.claims ?? [];
  const categories = data?.categories ?? {};
  const canReview = summary?.permissions?.includes('claim:review');
  const canAssist = canReview && summary?.assistant?.llmEnabled;

  const filtered = claims.filter((claim) => {
    if (category !== 'all' && claim.category !== category) return false;
    if (status !== 'all' && claim.status !== status) return false;
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      if (!`${claim.text} ${claim.component ?? ''}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
  const selected = filtered.find((claim) => claim.id === selectedId) ?? filtered[0] ?? null;

  const statusCounts = claims.reduce((acc, claim) => ({ ...acc, [claim.status]: (acc[claim.status] ?? 0) + 1 }), {});

  function select(claimId) {
    setSelectedId(claimId);
    setAction(null);
    setReason('');
    setDraftText('');
    setAssist(null);
  }

  // Advisory only: the model sees the same excerpts a reviewer can see and the
  // human still makes the decision.
  async function checkWithModel() {
    if (!selected || assisting) return;
    setAssisting(true);
    try {
      const result = await api(`/projects/${projectId}/claims/${selected.id}/assist`, { method: 'POST' });
      setAssist(result);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setAssisting(false);
    }
  }

  async function review(kind) {
    if (!selected) return;
    const body =
      kind === 'verify'
        ? { action: 'verify' }
        : kind === 'reject'
          ? { action: 'reject', comment: reason.trim() }
          : { action: 'edit', text: draftText.trim(), comment: 'Corrected by reviewer' };
    setBusy(true);
    try {
      await api(`/projects/${projectId}/claims/${selected.id}/review`, { method: 'POST', body });
      setAction(null);
      setReason('');
      await reload();
      await refresh();
      notify(
        kind === 'verify'
          ? 'Claim verified by a human reviewer.'
          : kind === 'reject'
            ? 'Claim rejected. It will be excluded from the handover.'
            : 'Claim corrected. The original evidence is unchanged.',
        'success',
      );
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function inspect(recordId) {
    try {
      const result = await api(`/projects/${projectId}/records/${recordId}`);
      const meta = result.record.metadata ?? {};
      setRecord({
        title: result.record.title ?? result.record.externalId,
        meta: [
          result.record.type,
          result.record.externalId,
          result.record.author ? `by ${result.record.author}` : null,
          result.record.state,
          meta.labels?.length ? `labels: ${meta.labels.join(', ')}` : null,
          meta.files?.length ? `files: ${meta.files.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        body: result.record.body ?? '(no body)',
      });
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  if (loading) return <Loading rows={6} />;
  if (error) return <Empty icon="alert" title="Could not load claims">{error.message}</Empty>;

  return (
    <div className="stack">
      <Panel
        title="Extracted claims"
        subtitle="Each statement keeps the records that support it, plus how strongly they do"
        count={`${filtered.length} / ${claims.length}`}
      >
        <div className="claims-toolbar">
          <div className="search">
            <Icon name="search" size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search claims, components, decisions…"
              aria-label="Search claims"
            />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All', count: claims.length },
              { value: 'pending', label: 'Pending', count: statusCounts.pending ?? 0 },
              { value: 'verified', label: 'Verified', count: statusCounts.verified ?? 0 },
              { value: 'edited', label: 'Corrected', count: statusCounts.edited ?? 0 },
              { value: 'rejected', label: 'Rejected', count: statusCounts.rejected ?? 0 },
            ]}
          />
        </div>

        <div className="claims-split">
          <div className="claims-list">
            {filtered.length ? (
              filtered.map((claim) => (
                <button
                  type="button"
                  key={claim.id}
                  className={cx('claim-row', selected?.id === claim.id && 'active')}
                  onClick={() => select(claim.id)}
                >
                  <span className={cx('claim-rail', `rail-${claim.category}`)} />
                  <span className="claim-body">
                    <span className="claim-text">{claim.text}</span>
                    <span className="claim-meta">
                      <CategoryBadge category={claim.category} label={claim.categoryLabel} />
                      <Strength value={claim.evidenceStrength} />
                      <StatusPill status={claim.status} />
                      {claim.signal?.startsWith('llm:') && <Badge tone="violet">model-assisted</Badge>}
                      {claim.evidence.length === 0 && <Badge tone="critical">restricted evidence</Badge>}
                      {claim.evidence.length > 0 && (
                        <span className="claim-sources">
                          {claim.evidence.length} source{claim.evidence.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </span>
                  <Icon name="chevron" size={14} className="claim-chevron" />
                </button>
              ))
            ) : (
              <Empty icon="search" title="No claims match these filters">
                Clear the search or pick another category. Reconstruction rebuilds every claim from the records.
              </Empty>
            )}
          </div>

          <aside className="claim-detail">
            {selected ? (
              <>
                <header className="claim-detail-head">
                  <CategoryBadge category={selected.category} label={selected.categoryLabel} />
                  <Strength value={selected.evidenceStrength} />
                  <StatusPill status={selected.status} />
                  {selected.component && <span className="chip mono">{selected.component}</span>}
                </header>

                <p className="claim-detail-text">{selected.text}</p>

                {selected.reviewer && (
                  <p className="review-note">
                    Last reviewed by {selected.reviewer}
                    {selected.reviewNote ? ` — “${selected.reviewNote}”` : ''}
                  </p>
                )}

                <div className="detail-block">
                  <h3>
                    Supporting evidence <span className="muted">({selected.evidence.length})</span>
                  </h3>
                  {selected.evidence.length ? (
                    <div className="evidence-list">
                      {selected.evidence.map((evidence, index) => (
                        <div className="evidence-item" key={`${evidence.location}-${index}`}>
                          <div className="evidence-head">
                            <strong>{evidence.sourceName ?? 'source'}</strong>
                            <span>{evidence.recordTitle ?? evidence.externalId ?? ''}</span>
                            <span className="mono">{evidence.location ?? ''}</span>
                            {evidence.sourceVisibility === 'restricted' && <Badge tone="critical">restricted</Badge>}
                          </div>
                          <p>{evidence.excerpt}</p>
                          <Btn variant="ghost" size="sm" icon="eye" onClick={() => inspect(evidence.recordId)}>
                            Inspect record
                          </Btn>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">
                      Every source behind this claim is restricted for your role. A reviewer cannot verify material they
                      cannot read — an administrator must handle it.
                    </p>
                  )}
                </div>

                {assist && (
                  <div className={`ai-assist ai-${assist.assessment.verdict}`}>
                    <header>
                      <Badge
                        tone={
                          assist.assessment.verdict === 'supported'
                            ? 'success'
                            : assist.assessment.verdict === 'weak'
                              ? 'warning'
                              : 'critical'
                        }
                      >
                        {assist.assessment.verdict}
                      </Badge>
                      <strong>Model review</strong>
                      <span className="hint">advisory · {assist.model}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setAssist(null)}
                        aria-label="Dismiss model review"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </header>
                    <p>{assist.assessment.rationale || 'No rationale returned.'}</p>
                    {assist.assessment.missingEvidence && (
                      <p className="hint">To settle it: {assist.assessment.missingEvidence}</p>
                    )}
                    <p className="hint">This is a suggestion. Verifying, correcting or rejecting stays with you.</p>
                  </div>
                )}

                {canReview && (
                  <div className="review-actions">
                    <Btn variant="primary" size="sm" icon="check" onClick={() => review('verify')} disabled={busy}>
                      Verify
                    </Btn>
                    {canAssist && (
                      <Btn variant="ghost" size="sm" icon="badgeCheck" onClick={checkWithModel} disabled={assisting}>
                        {assisting ? 'Checking…' : 'Check with model'}
                      </Btn>
                    )}
                    <Btn variant="ghost" size="sm" icon="file" onClick={() => { setAction('edit'); setDraftText(selected.text); }}>
                      Correct text
                    </Btn>
                    <Btn variant="critical" size="sm" icon="x" onClick={() => setAction('reject')}>
                      Reject
                    </Btn>
                  </div>
                )}

                {action === 'edit' && (
                  <div className="form inline-form">
                    <Field label="Corrected claim">
                      <textarea rows={3} value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                    </Field>
                    <div className="row-actions">
                      <Btn variant="primary" size="sm" onClick={() => review('edit')} disabled={busy || draftText.trim().length < 12}>
                        Save correction
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setAction(null)}>
                        Cancel
                      </Btn>
                    </div>
                    <p className="hint">The original evidence stays attached; the claim is marked as human-corrected.</p>
                  </div>
                )}

                {action === 'reject' && (
                  <div className="form inline-form">
                    <Field label="Why is this claim unsupported or wrong?">
                      <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
                    </Field>
                    <div className="row-actions">
                      <Btn variant="critical" size="sm" onClick={() => review('reject')} disabled={busy || !reason.trim()}>
                        Reject claim
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setAction(null)}>
                        Cancel
                      </Btn>
                    </div>
                    <p className="hint">Rejected claims are excluded from the handover and the reason is kept in the review history.</p>
                  </div>
                )}
              </>
            ) : (
              <Empty icon="checkList" title="Select a claim">
                Choose a claim from the list to inspect its evidence and review it.
              </Empty>
            )}
          </aside>
        </div>
      </Panel>

      <Modal open={Boolean(record)} onClose={() => setRecord(null)} title={record?.title ?? 'Source record'} description={record?.meta} width="lg">
        <pre className="record-body">{record?.body}</pre>
      </Modal>
    </div>
  );
}
