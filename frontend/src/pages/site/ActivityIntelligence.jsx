import { ArrowRight } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, CheckItem, PageHero } from '../../components/site/blocks.jsx';
import { TimelinePreview } from '../../components/site/previews.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const RECORDED = [
  ['Record imported', 'Source, mode and record count, with the visibility the administrator chose'],
  ['Claim reviewed', 'Verify, correct or reject, with the reviewer, note and original wording'],
  ['Reconstruction run', 'How many claims and gaps were rebuilt from how many records'],
  ['Handover approved', 'Frozen version, excluded restricted-only claims, reviewer note'],
  ['Access denied', 'Which restricted resource was requested by whom, and when'],
];

export default function ActivityIntelligence() {
  const { go, user } = useApp();

  return (
    <div className="site-page">
      <PageHero
        eyebrow="Activity intelligence"
        title="Project history that explains how the current state was reached"
        lead="A commit graph shows what changed. Activity intelligence shows what was decided, who was involved, what was abandoned and which statements were reviewed before anyone relied on them."
        actions={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
            Open activity in the demo
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
        }
      />

      <PageTabs
        label="Activity sections"
        tabs={[
          {
            id: 'timeline',
            label: 'Timeline',
            node: (
              <section className="section">
                <div className="wrap split">
                  <div className="split-copy">
                    <p className="eyebrow">Timeline</p>
                    <h2>One ordered history, filterable by what matters</h2>
                    <p className="section-lead">
                      Imported engineering activity and the product's own decisions sit in the same view, so a reviewer
                      can see whether a decision claim came from a pull request merged after an incident or before it.
                    </p>
                    <ul className="check-list">
                      <CheckItem>Search by actor, action or record, and filter to imports, reviews or approvals</CheckItem>
                      <CheckItem>Contributor activity shows who touched which component and when they stopped</CheckItem>
                      <CheckItem>Decision lineage runs from the discussion to the merged change to the decision record</CheckItem>
                      <CheckItem>Denied access appears in the same log as successful actions</CheckItem>
                    </ul>
                  </div>
                  <div className="split-media">
                    <TimelinePreview />
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'recorded',
            label: 'Recorded events',
            meta: '5',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">What is recorded</p>
                      <h2>Five events that make a handover defensible</h2>
                      <p className="section-lead">
                        The log is append-only and written by the API, not the browser, so a client cannot invent an
                        approval.
                      </p>
                    </div>
                  </div>
                  <div className="recorded-table">
                    <div className="recorded-head">
                      <span>Event</span>
                      <span>What is stored</span>
                    </div>
                    {RECORDED.map(([event, detail]) => (
                      <div className="recorded-row" key={event}>
                        <span className="recorded-event">{event}</span>
                        <span className="recorded-detail">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'snapshots',
            label: 'Snapshots',
            node: (
              <section className="section">
                <div className="wrap split split-reverse">
                  <div className="split-copy">
                    <p className="eyebrow">Snapshots</p>
                    <h2>Compare a draft with what was approved</h2>
                    <p className="section-lead">
                      Approval is a checkpoint, not a save. Each version records how many claims were unverified, how
                      many were excluded because their only evidence was restricted, and the reviewer's note.
                    </p>
                    <ul className="check-list">
                      <CheckItem>Version number, reviewer and timestamp for every approval</CheckItem>
                      <CheckItem>Unverified and excluded counts frozen with that version</CheckItem>
                      <CheckItem>Reconstruction blocked once a version is approved</CheckItem>
                      <CheckItem>Incoming members read the frozen version only</CheckItem>
                    </ul>
                  </div>
                  <div className="split-media">
                    <div className="version-preview">
                      <div className="version-preview-head">
                        <span className="mini-label">Version history</span>
                        <span className="badge badge-neutral">illustrative</span>
                      </div>
                      <div className="version">
                        <div>
                          <strong>v1</strong>
                          <span className="muted small"> Daniel Okafor</span>
                        </div>
                        <span className="muted tiny">Approved · 8 claims unverified · 2 excluded</span>
                        <p className="review-note">Reviewed retry, ownership and dependency claims.</p>
                      </div>
                      <p className="hint">
                        A new approval creates a new version; earlier versions stay readable so the reasoning behind a
                        change is never lost.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="Ask the history a question"
        lead="Sign in as a reviewer to search the activity log and compare the draft with the approved version."
        secondary={{ label: 'See the handover flow', route: 'handover-intelligence' }}
      />
    </div>
  );
}
