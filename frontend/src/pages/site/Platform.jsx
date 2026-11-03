import { ArrowRight } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, CheckItem, PageHero } from '../../components/site/blocks.jsx';
import { DashboardPreview, EvidencePreview, HandoverPreview } from '../../components/site/previews.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const FAQ = [
  {
    q: 'Does a language model write the handover?',
    a: 'No. Claims, gaps, evidence links and approvals come from deterministic rules over the imported records. A model is optional and limited to rephrasing an answer already built from approved claims; on failure the deterministic answer is returned unchanged.',
  },
  {
    q: 'What happens when records contradict each other?',
    a: 'The conflict becomes a gap with both excerpts attached. The product does not pick a winner — a reviewer resolves it, and the resolution is recorded.',
  },
  {
    q: 'Can a claim exist without evidence?',
    a: 'Not in the shared handover. A claim whose only sources are restricted is excluded before the approved copy is built, so restricted wording cannot leak through corroboration.',
  },
  {
    q: 'Which sources can be connected?',
    a: 'A live GitHub repository — any public owner/name — and Markdown or plain-text documents. PDF and DOCX parsing is rejected rather than faked.',
  },
];

const SPLIT = (eyebrow, title, lead, items, media, reverse) => (
  <section className="section">
    <div className={`wrap split${reverse ? ' split-reverse' : ''}`}>
      <div className="split-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="section-lead">{lead}</p>
        <ul className="check-list">
          {items.map((item) => (
            <CheckItem key={item}>{item}</CheckItem>
          ))}
        </ul>
      </div>
      <div className="split-media">{media}</div>
    </div>
  </section>
);

export default function Platform() {
  const { go, user } = useApp();

  return (
    <div className="site-page">
      <PageHero
        eyebrow="Platform"
        title="One pipeline from raw engineering activity to an approved handover"
        lead="ContextBridge is not a chat interface over a repository. It reconstructs a project's state as reviewable claims, measures how well the records support each one, and keeps a human in control of what leaves the building."
        actions={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
            Open workspace
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
        }
      />

      <PageTabs
        label="Platform capabilities"
        tabs={[
          {
            id: 'reconstruction',
            label: 'Reconstruction',
            node: SPLIT(
              'Project reconstruction',
              'Every statement starts as a record',
              'Imported records are normalized into one shape: author, type, identifier, state and body. The extractor then reads state and language to produce claims about decisions, work, blockers, dependencies, responsibilities and open questions.',
              [
                'Open, draft and merged pull requests produce state-derived claims',
                'Issues with no assignee become ownership gaps, not silent omissions',
                'Each claim stores its category, component and evidence strength',
                'Reconstruction can be re-run while the handover is still a draft',
              ],
              <DashboardPreview />,
            ),
          },
          {
            id: 'evidence',
            label: 'Evidence',
            node: SPLIT(
              'Evidence intelligence',
              'Strength comes from the records, review comes from a person',
              'Each claim keeps its own excerpt plus up to three corroborating excerpts found by weighted term overlap. Evidence strength and review status are stored separately, so “well supported” never gets confused with “approved”.',
              [
                'Excerpts are stored, not regenerated, so evidence cannot drift',
                'Corroboration counts distinct sources, not repeated sentences',
                'Restricted evidence is labelled and never copied into a shared view',
                'Inspect any record behind a claim without leaving the review screen',
              ],
              <EvidencePreview />,
              true,
            ),
          },
          {
            id: 'handover',
            label: 'Handover',
            node: SPLIT(
              'Handover',
              'A document with its evidence still attached',
              'The draft is structured, not generated prose. Responsibilities, completed and pending work, decisions, risks and unresolved questions each keep the claims behind them.',
              [
                'Coverage and corroboration metrics computed from the claims',
                'Unverified claims labelled, rejected claims excluded',
                'Approval freezes a version and unlocks the incoming workspace',
                'Restricted-only claims excluded before the shared copy exists',
              ],
              <HandoverPreview />,
            ),
          },
          {
            id: 'questions',
            label: 'Questions',
            meta: '4',
            node: (
              <section className="section">
                <div className="wrap faq-wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Questions</p>
                      <h2>Straight answers about how this build behaves</h2>
                    </div>
                  </div>
                  <div className="faq">
                    {FAQ.map((item) => (
                      <details className="faq-item" key={item.q}>
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="See the pipeline on a real review queue"
        lead="Import a public repository and ContextBridge produces claims, gaps and a draft handover waiting for review in one pass."
        secondary={{ label: 'How permissions work', route: 'security' }}
      />
    </div>
  );
}
