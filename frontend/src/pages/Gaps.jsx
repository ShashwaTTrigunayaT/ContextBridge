import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { GapList, GapSummary } from '../components/Document.jsx';
import { ColumnChart } from '../components/charts.jsx';
import { useAsync } from '../hooks.js';
import { Btn, Empty, Loading, Modal, Panel, Segmented } from '../ui.jsx';

// The API emits a fixed gap vocabulary. Severity alone rarely separates anything
// (one severity can hold every gap), so the chart plots the kinds and keeps
// severity as a mix strip beside it.
const KIND_LABEL = {
  awaiting_review: { label: 'Awaiting review', tone: 'accent' },
  unresolved_question: { label: 'Unresolved question', tone: 'warning' },
  unassigned_task: { label: 'No owner', tone: 'critical' },
  incomplete_implementation: { label: 'Incomplete work', tone: 'violet' },
  stale_work: { label: 'Stale work', tone: 'neutral' },
  ownership_gap: { label: 'Ownership gap', tone: 'critical' },
  dependency_risk: { label: 'Dependency risk', tone: 'violet' },
  conflicting_information: { label: 'Conflicting record', tone: 'critical' },
  ambiguous_decision: { label: 'Ambiguous decision', tone: 'violet' },
  missing_documentation: { label: 'Missing docs', tone: 'neutral' },
};

export default function Gaps() {
  const { projectId, go, notify } = useApp();
  const { data, loading, error } = useAsync(() => api(`/projects/${projectId}/gaps`), [projectId]);
  const [severity, setSeverity] = useState('all');
  const [record, setRecord] = useState(null);

  const gaps = data?.gaps ?? [];
  const filtered = severity === 'all' ? gaps : gaps.filter((gap) => gap.severity === severity);
  const counts = gaps.reduce((acc, gap) => ({ ...acc, [gap.severity]: (acc[gap.severity] ?? 0) + 1 }), {});

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
          meta.labels?.length ? `labels: ${meta.labels.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        body: result.record.body ?? '(no body)',
      });
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  if (loading) return <Loading rows={5} />;
  if (error) return <Empty icon="alert" title="Could not load gaps">{error.message}</Empty>;

  const severityChart = [
    { label: 'High', value: counts.high ?? 0, tone: 'critical' },
    { label: 'Medium', value: counts.medium ?? 0, tone: 'warning' },
    { label: 'Low', value: counts.low ?? 0, tone: 'neutral' },
  ];

  const kindChart = Object.entries(
    gaps.reduce((acc, gap) => ({ ...acc, [gap.kind]: (acc[gap.kind] ?? 0) + 1 }), {}),
  )
    .map(([kind, value]) => ({
      label: KIND_LABEL[kind]?.label ?? kind.replace(/_/g, ' '),
      value,
      tone: KIND_LABEL[kind]?.tone ?? 'neutral',
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="stack">
      <Panel
        title="Where the gaps are"
        subtitle="Counted from record state, relationships and stale work — not model judgement"
        count={gaps.length}
      >
        {gaps.length ? (
          <div className="gap-chart">
            <div className="gap-chart-col">
              <span className="mini-label">By severity</span>
              <ColumnChart data={severityChart} label="Gaps by severity" height={100} />
            </div>
            <div className="gap-chart-col gap-chart-col-side">
              <span className="mini-label">By kind</span>
              <ColumnChart data={kindChart} label="Gaps by kind" height={100} />
            </div>
          </div>
        ) : (
          <p className="hint">No gaps recorded. Re-run reconstruction after new sources are added.</p>
        )}
      </Panel>

      <Panel
        title="What the records cannot explain"
        subtitle="Deterministic checks over record state, relationships and extracted claims — not model guesses"
        count={gaps.length}
        action={
          <Segmented
            value={severity}
            onChange={setSeverity}
            options={[
              { value: 'all', label: 'All', count: gaps.length },
              { value: 'high', label: 'High', count: counts.high ?? 0 },
              { value: 'medium', label: 'Medium', count: counts.medium ?? 0 },
              { value: 'low', label: 'Low', count: counts.low ?? 0 },
            ]}
          />
        }
      >
        <GapSummary gaps={gaps} />
        {filtered.length ? (
          <GapList gaps={filtered} onClaim={() => go('claims')} onRecord={inspect} />
        ) : (
          <Empty icon="checkList" title="No gaps at this severity">
            Re-run reconstruction after new sources are added — gaps are recomputed from the records.
          </Empty>
        )}
      </Panel>

      <Modal open={Boolean(record)} onClose={() => setRecord(null)} title={record?.title ?? 'Source record'} description={record?.meta} width="lg">
        <pre className="record-body">{record?.body}</pre>
      </Modal>

      <p className="hint">
        A gap means the records cannot tell the full story. It is safer to hand over a named unknown than an invented
        answer.
      </p>

      <div className="row-actions">
        <Btn variant="ghost" icon="checkList" onClick={() => go('claims')}>
          Back to claims
        </Btn>
      </div>
    </div>
  );
}
