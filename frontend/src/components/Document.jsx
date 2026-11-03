import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, Btn, CategoryBadge, Icon, SeverityDot, StatusPill, Strength } from '../ui.jsx';

// A handover carries eight sections and can run to dozens of items each. Printing
// every one turns the page into an endless scroll, so each list shows its first
// few and states how many are held back.
const PREVIEW_ITEMS = 4;
const PREVIEW_GAPS = 6;

function ListMore({ hidden, open, onClick }) {
  if (!hidden) return null;
  return (
    <button type="button" className={open ? 'list-more is-open' : 'list-more'} onClick={onClick}>
      <span>
        {open ? 'Show fewer' : `Show ${hidden} more`}
      </span>
      <ChevronDown size={13} strokeWidth={1.9} />
    </button>
  );
}

export const SECTIONS = [
  ['nextActions', 'Next actions', 'What to do first, and why'],
  ['unfinishedWork', 'Unfinished work', 'Open pull requests, issues and blockers'],
  ['decisions', 'Technical decisions', 'What was chosen, and the reasoning behind it'],
  ['workCompleted', 'Work completed', 'What already shipped'],
  ['responsibilities', 'Responsibilities', 'Who owned which part'],
  ['dependencies', 'Dependencies', 'What this work relies on'],
  ['risks', 'Known risks', 'What could break, and where it would hurt'],
  ['openQuestions', 'Unresolved questions', 'Decisions that still have no answer'],
];

export const KIND_LABELS = {
  unassigned_task: 'Unassigned task',
  awaiting_review: 'Awaiting review',
  incomplete_implementation: 'Incomplete implementation',
  stale_work: 'Stale work',
  unresolved_question: 'Unresolved decision',
  ownership_gap: 'Ownership gap',
  dependency_risk: 'Dependency risk',
  conflicting_information: 'Conflicting records',
  ambiguous_decision: 'Weak evidence',
  missing_documentation: 'Missing documentation',
};

export function DocumentSections({ content, limit = PREVIEW_ITEMS }) {
  const rendered = SECTIONS.map(([key, title, hint]) => {
    const items = content.sections?.[key] ?? [];
    if (!items.length) return null;
    return (
      <section className="doc-section" key={key} id={`section-${key}`}>
        <header className="doc-head">
          <div>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          <span className="doc-count">{items.length}</span>
        </header>
        <DocumentItems items={items} limit={limit} />
      </section>
    );
  }).filter(Boolean);

  if (!rendered.length) {
    return <p className="muted">The handover contains no items yet. Run reconstruction after connecting sources.</p>;
  }
  return <div className="doc">{rendered}</div>;
}

function DocumentItems({ items, limit }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, limit);
  return (
    <>
      <div className="doc-items">
        {shown.map((item, index) => (
          <DocumentItem item={item} index={index} key={item.id} />
        ))}
      </div>
      <ListMore hidden={Math.max(0, items.length - limit)} open={open} onClick={() => setOpen((value) => !value)} />
    </>
  );
}

function DocumentItem({ item, index }) {
  return (
    <article className="doc-item">
      <span className="doc-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="doc-item-body">
        <p className="doc-text">{item.text}</p>
        <div className="doc-meta">
          <Strength value={item.evidenceStrength} />
          <StatusPill status={item.verification} />
          {item.component && <span className="chip mono">{item.component}</span>}
          {item.restrictedOnly && <Badge tone="critical">restricted evidence only — excluded from sharing</Badge>}
        </div>
        {item.reviewNote && <p className="review-note">Reviewer note: {item.reviewNote}</p>}
        {item.evidence?.length > 0 && (
          <details className="evidence">
            <summary>
              <Icon name="eye" size={14} />
              {item.evidence.length} supporting source{item.evidence.length === 1 ? '' : 's'}
            </summary>
            <div className="evidence-list">
              {item.evidence.map((evidence, position) => (
                <div className="evidence-item" key={`${evidence.location}-${position}`}>
                  <div className="evidence-head">
                    <strong>{evidence.sourceName ?? 'source'}</strong>
                    <span>{evidence.recordTitle ?? evidence.externalId ?? ''}</span>
                    <span className="mono">{evidence.location ?? ''}</span>
                    {evidence.sourceVisibility === 'restricted' && <Badge tone="critical">restricted</Badge>}
                  </div>
                  <p>{evidence.excerpt}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

export function GapList({ gaps, onClaim, onRecord, limit = PREVIEW_GAPS }) {
  const [open, setOpen] = useState(false);
  const shown = open ? gaps : gaps.slice(0, limit);
  return (
    <div className="gap-list">
      {shown.map((gap) => (
        <div className={`gap-row severity-border-${gap.severity}`} key={gap.id}>
          <SeverityDot severity={gap.severity} />
          <div className="gap-main">
            <div className="gap-title-row">
              <strong>{gap.title}</strong>
              <Badge>{KIND_LABELS[gap.kind] ?? gap.kind}</Badge>
              {gap.restricted && <Badge tone="critical">restricted</Badge>}
            </div>
            {gap.detail && <p>{gap.detail}</p>}
          </div>
          <div className="gap-actions">
            {onClaim && gap.claimId && (
              <Btn variant="ghost" size="sm" onClick={() => onClaim(gap.claimId)}>
                Claim
              </Btn>
            )}
            {onRecord && gap.recordId && (
              <Btn variant="ghost" size="sm" onClick={() => onRecord(gap.recordId)}>
                Record
              </Btn>
            )}
            <Badge tone={gap.severity === 'high' || gap.severity === 'critical' ? 'critical' : gap.severity === 'medium' ? 'warning' : 'neutral'}>
              {gap.severity}
            </Badge>
          </div>
        </div>
      ))}
      <ListMore hidden={Math.max(0, gaps.length - limit)} open={open} onClick={() => setOpen((value) => !value)} />
    </div>
  );
}

export function GapSummary({ gaps }) {
  const counts = gaps.reduce((acc, gap) => ({ ...acc, [gap.severity]: (acc[gap.severity] ?? 0) + 1 }), {});
  return (
    <div className="gap-summary">
      <div>
        <span className="mini-label">Open gaps</span>
        <strong>{gaps.length}</strong>
      </div>
      <div>
        <span className="mini-label">High</span>
        <strong>{counts.high ?? 0}</strong>
      </div>
      <div>
        <span className="mini-label">Medium</span>
        <strong>{counts.medium ?? 0}</strong>
      </div>
      <div>
        <span className="mini-label">Low</span>
        <strong>{counts.low ?? 0}</strong>
      </div>
    </div>
  );
}

export { CategoryBadge };
