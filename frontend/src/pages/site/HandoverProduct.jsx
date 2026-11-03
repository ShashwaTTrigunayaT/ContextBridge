import { ArrowRight, FileCheck2, ListChecks, LockKeyhole } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, CheckItem, Feature, PageHero } from '../../components/site/blocks.jsx';
import { HandoverPreview } from '../../components/site/previews.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const SECTIONS = [
  ['Next actions', 'What to do first, ordered from open gaps and unverified work.'],
  ['Unfinished work', 'Open pull requests, issues and blockers with their state.'],
  ['Technical decisions', 'The chosen approach and reasoning, including rejected alternatives.'],
  ['Work completed', 'What already shipped, so it is not redone.'],
  ['Responsibilities', 'Who owned which component, and which parts have one owner.'],
  ['Dependencies', 'External systems and internal services the work relies on.'],
  ['Known risks', 'What could break, where it would hurt and how it was mitigated.'],
  ['Unresolved questions', 'Decisions still without an answer, named rather than guessed.'],
];

export default function HandoverProduct() {
  const { go } = useApp();

  return (
    <div className="site-page">
      <PageHero
        eyebrow="Handover"
        title="A handover document a reviewer can actually stand behind"
        lead="Nine sections, each item carrying the claims and excerpts behind it. Unverified statements are labelled, rejected ones removed and restricted material never reaches the shared copy."
        actions={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go('sign-in')}>
            Open the handover draft
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
        }
      />

      <PageTabs
        label="Handover sections"
        tabs={[
          {
            id: 'generation',
            label: 'Generation',
            node: (
              <section className="section">
                <div className="wrap split">
                  <div className="split-copy">
                    <p className="eyebrow">Generation</p>
                    <h2>Structured, not narrated</h2>
                    <p className="section-lead">
                      The draft is assembled from reviewed claims, not written as prose. Every item exposes its evidence
                      drawer, so a reviewer can open the pull request or document behind a statement before approving.
                    </p>
                    <ul className="check-list">
                      <CheckItem>Coverage and corroboration computed from the claims, not estimated</CheckItem>
                      <CheckItem>Evidence drawers with source name and record location</CheckItem>
                      <CheckItem>Restricted-only claims excluded before the shared copy exists</CheckItem>
                      <CheckItem>Approval freezes a version and unlocks the incoming workspace</CheckItem>
                    </ul>
                  </div>
                  <div className="split-media">
                    <HandoverPreview />
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'sections',
            label: 'Sections',
            meta: '8',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Sections</p>
                      <h2>The questions an incoming engineer asks in week one</h2>
                      <p className="section-lead">Every section answers one of them, and every answer keeps its source.</p>
                    </div>
                  </div>
                  <div className="section-grid">
                    {SECTIONS.map(([title, body], index) => (
                      <article className="section-card" key={title}>
                        <span className="section-card-index">{String(index + 1).padStart(2, '0')}</span>
                        <h3>{title}</h3>
                        <p>{body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'approval',
            label: 'Review & approval',
            meta: '3',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Review and approval</p>
                      <h2>A reviewer decides what is shared</h2>
                      <p className="section-lead">
                        Approval is a deliberate act with a name and a note attached, not the absence of an objection.
                      </p>
                    </div>
                  </div>
                  <div className="feature-grid feature-grid-3">
                    <Feature glyph={ListChecks} title="Review against evidence">
                      Verify, correct or reject each claim. Corrections keep the original evidence; rejections require a
                      reason and are excluded.
                    </Feature>
                    <Feature glyph={FileCheck2} title="Approval with a note">
                      The reviewer writes what they checked. The note, timestamp and version are stored together.
                    </Feature>
                    <Feature glyph={LockKeyhole} title="Frozen after approval">
                      Reconstruction is blocked once a version exists, so approved history cannot be quietly rewritten.
                    </Feature>
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'workspace',
            label: 'Incoming workspace',
            node: (
              <section className="section">
                <div className="wrap split split-reverse">
                  <div className="split-copy">
                    <p className="eyebrow">Incoming member workspace</p>
                    <h2>What the new owner sees on day one</h2>
                    <p className="section-lead">
                      The workspace contains the approved snapshot only: an introduction, outstanding work, the decisions
                      that explain the code and the gaps still open. It cannot see drafts or other people's notes.
                    </p>
                    <ul className="check-list">
                      <CheckItem>Next actions ordered from the gaps</CheckItem>
                      <CheckItem>Documents and components with the records behind them</CheckItem>
                      <CheckItem>An assistant that answers only from the snapshot and says when it cannot</CheckItem>
                    </ul>
                  </div>
                  <div className="split-media">
                    <div className="workspace-preview">
                      <div className="workspace-preview-head">
                        <span className="badge badge-success badge-dot-inline">Approved v1</span>
                        <span className="hint">Continuing payments-service</span>
                      </div>
                      <div className="workspace-preview-rows">
                        <div className="workspace-preview-row">
                          <span className="mini-label">Next action</span>
                          <p>Re-open the settlement retry discussion before changing the backoff cap.</p>
                        </div>
                        <div className="workspace-preview-row">
                          <span className="mini-label">Open gap</span>
                          <p>Webhook replay job has no named owner.</p>
                        </div>
                        <div className="workspace-preview-row">
                          <span className="mini-label">Decision</span>
                          <p>Settlement caching was set to 24 hours, with invalidation untested.</p>
                        </div>
                      </div>
                      <div className="workspace-preview-ask">
                        <FileCheck2 size={14} strokeWidth={1.8} />
                        <span>“What should I work on first?”</span>
                        <span className="badge badge-neutral">grounded answer</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="Read the draft, then approve it yourself"
        lead="Sign in as a reviewer, open the handover, verify a few claims and approve a version."
        secondary={{ label: 'Security model', route: 'security' }}
      />
    </div>
  );
}
