import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { DocumentSections, GapList, SECTIONS } from '../components/Document.jsx';
import AcknowledgementCard from '../components/Acknowledgement.jsx';
import { Badge, Btn, Empty, Field, Icon, Loading, Modal, Panel, StatCard } from '../ui.jsx';

export default function Handover() {
  const { projectId, refresh, notify } = useApp();
  const { data, loading, error, reload } = useAsync(() => api(`/projects/${projectId}/handover`), [projectId]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const versions = useAsync(
    () => api(`/projects/${projectId}/handover/versions`).catch(() => ({ versions: [] })),
    [projectId, data?.version],
  );

  if (loading) return <Loading rows={6} />;
  if (error) {
    return (
      <div className="card locked">
        <span className="locked-icon">
          {error.status === 403 ? <Icon name="lock" size={22} /> : <Icon name="alert" size={22} />}
        </span>
        <h2>{error.status === 403 ? 'Handover not available yet' : 'Could not load the handover'}</h2>
        <p className="muted">{error.message}</p>
        <p className="hint">Incoming members only see the approved version, never the working draft.</p>
      </div>
    );
  }

  const content = data.content;
  const metrics = content.metrics ?? {};
  const draft = data.status !== 'approved';
  const sectionCounts = SECTIONS.map(([key, title]) => [key, title, content.sections?.[key]?.length ?? 0]);

  async function approve() {
    setBusy(true);
    try {
      const result = await api(`/projects/${projectId}/handover/approve`, {
        method: 'POST',
        body: { summary: note.trim() || null },
      });
      notify(
        `Approved version ${result.version}. ${result.excludedClaims} claim(s) with restricted-only evidence were excluded from the shared copy.`,
        'success',
      );
      setApproveOpen(false);
      setNote('');
      await reload();
      await refresh();
      versions.reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function jump(key) {
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="stack">
      <div className="doc-layout">
        <div className="doc-main">
          <header className={draft ? 'doc-banner draft' : 'doc-banner approved'}>
            <div>
              <p className="eyebrow">{draft ? 'Working draft' : 'Approved handover'}</p>
              <h2>
                {content.meta?.project?.name ?? 'Project'} — for{' '}
                {content.meta?.transfer?.contributor ?? content.meta?.transitionUser?.name ?? 'the incoming member'}
              </h2>
              <p className="muted">
                Generated {new Date(content.meta?.generatedAt ?? Date.now()).toLocaleString()} from{' '}
                {content.overview?.records ?? 0} records across {content.overview?.sources?.length ?? 0} authorized
                sources.
              </p>
            </div>
            <div className="doc-banner-meta">
              <Badge tone={draft ? 'warning' : 'success'} dot>
                {draft ? 'Draft — not shared' : 'Approved'}
              </Badge>
              {!draft && data.approvedAt && (
                <span className="hint">Approved {new Date(data.approvedAt).toLocaleDateString()}</span>
              )}
            </div>
          </header>

          {draft && data.canApprove && (
            <div className="doc-actions">
              <Btn variant="primary" size="sm" icon="check" onClick={() => setApproveOpen(true)}>
                Approve handover
              </Btn>
            </div>
          )}

          {content.transfer && (
            <section className="transfer-brief">
              <header className="transfer-brief-head">
                <span className="transfer-brief-icon">
                  <Icon name="branch" size={15} />
                </span>
                <div>
                  <p className="eyebrow">Departure scope</p>
                  <h3>
                    {content.transfer.contributor ?? 'The departing member'} is transferring{' '}
                    {content.transfer.responsibilities.length} responsibilities
                  </h3>
                </div>
                <Badge tone="accent">{content.transfer.components.length} areas</Badge>
              </header>
              <ul className="transfer-brief-list">
                {content.transfer.responsibilities.slice(0, 6).map((item, index) => (
                  <li key={`${item.claimId ?? item.text}-${index}`}>
                    <Check size={12} strokeWidth={2.5} />
                    <span>{item.text}</span>
                    {item.component && <span className="chip mono">{item.component}</span>}
                  </li>
                ))}
              </ul>
              {content.transfer.responsibilities.length > 6 && (
                <p className="hint">
                  +{content.transfer.responsibilities.length - 6} more selected responsibilities are marked in the
                  sections below.
                </p>
              )}
            </section>
          )}

          <div className="stats">
            <StatCard label="Evidence coverage" value={`${metrics.evidenceCoverage ?? 0}%`} progress={metrics.evidenceCoverage} hint="claims with a source excerpt" />
            <StatCard label="Corroborated" value={`${metrics.corroborationRate ?? 0}%`} progress={metrics.corroborationRate} hint="claims backed by 2+ sources" tone="accent" />
            <StatCard label="Unverified" value={metrics.pending ?? 0} hint={`${metrics.reviewed ?? 0} reviewed`} tone="neutral" />
            <StatCard label="Excluded (restricted)" value={metrics.excludedRestricted ?? 0} hint="never redistributed" tone="critical" />
          </div>

          {draft && (
            <div className="notice">
              <Icon name="alert" size={15} />
              <span>
                Unverified claims are included and labelled. {metrics.excludedRestricted ?? 0} claim(s) supported only by
                restricted sources stay out of the shared copy. Approval freezes this version for incoming members.
              </span>
            </div>
          )}

          {!draft && (
            <AcknowledgementCard
              projectId={projectId}
              data={data}
              onDone={async () => {
                await reload();
                await refresh();
              }}
            />
          )}

          <DocumentSections content={content} />

          {content.gaps?.length > 0 && (
            <section className="doc-section">
              <header className="doc-head">
                <div>
                  <h2>Knowledge gaps</h2>
                  <p>What the records could not establish</p>
                </div>
                <span className="doc-count">{content.gaps.length}</span>
              </header>
              <GapList gaps={content.gaps} />
            </section>
          )}
        </div>

        <aside className="doc-side">
          <Panel title="In this handover">
            <nav className="toc">
              {sectionCounts.map(([key, title, count]) =>
                count ? (
                  <button type="button" key={key} onClick={() => jump(key)} className="toc-item">
                    <span>{title}</span>
                    <span className="toc-count">{count}</span>
                  </button>
                ) : null,
              )}
              {content.gaps?.length ? (
                <button type="button" className="toc-item" onClick={() => jump('gaps')}>
                  <span>Knowledge gaps</span>
                  <span className="toc-count">{content.gaps.length}</span>
                </button>
              ) : null}
            </nav>
          </Panel>

          <Panel title="Version history" count={versions.data?.versions?.length ?? 0}>
            {versions.data?.versions?.length ? (
              <div className="version-list">
                {versions.data.versions.map((version) => (
                  <div className="version" key={version.version}>
                    <div>
                      <strong>v{version.version}</strong>
                      <span className="muted small"> {version.approved_by ?? 'reviewer'}</span>
                    </div>
                    <span className="muted tiny">{new Date(version.approved_at).toLocaleString()}</span>
                    <span className="muted tiny">
                      {version.pending_claims} unverified · {version.excluded_claims} excluded
                    </span>
                    {version.summary && <p className="review-note">{version.summary}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No approved versions yet. The draft becomes a version when a reviewer approves it.</p>
            )}
          </Panel>

          <Panel title="Reviewer checklist">
            <ul className="checklist">
              <li>Open the evidence behind each decision before approving.</li>
              <li>Reject anything the records do not support.</li>
              <li>Check unowned issues and stale work are named as gaps.</li>
              <li>Confirm restricted material is not redistributed.</li>
            </ul>
          </Panel>
        </aside>
      </div>

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Approve this handover"
        description="Approval freezes a version and releases it to incoming members."
        footer={
          <>
            <Btn variant="ghost" onClick={() => setApproveOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" icon="check" onClick={approve} disabled={busy}>
              {busy ? 'Approving…' : 'Approve and share'}
            </Btn>
          </>
        }
      >
        <div className="form">
          <p className="muted">
            {metrics.pending ?? 0} claim(s) are still unverified. They will be included and clearly labelled as
            unverified; anything you rejected is excluded.
          </p>
          <Field label="Approval note" hint="Stored in the version history and audit log.">
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reviewed retry, ownership and dependency claims." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
