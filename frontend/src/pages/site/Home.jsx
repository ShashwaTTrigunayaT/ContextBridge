import { useEffect, useState } from 'react';
import { ArrowRight, CircleDot, FileCheck2, GitPullRequest, Layers, ScanSearch, Users } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, Feature } from '../../components/site/blocks.jsx';
import { DashboardPreview } from '../../components/site/previews.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const FLOW = [
  ['Scattered activity', 'Commits, reviews, pull requests and documents sit in separate tools.'],
  ['Connected knowledge', 'Records become claims about decisions, ownership, unfinished work and risk.'],
  ['Verified handover', 'A reviewer approves a frozen version. Gaps are named, not guessed.'],
];

const CAPABILITIES = [
  {
    glyph: Layers,
    title: 'Project reconstruction',
    body: 'Commits, pull requests, reviews, issues and documents become decisions, ownership, unfinished work and risks.',
  },
  {
    glyph: ScanSearch,
    title: 'Evidence intelligence',
    body: 'Each claim keeps the excerpts that support it, with corroboration measured across sources.',
  },
  {
    glyph: CircleDot,
    title: 'Decision tracking',
    body: 'A decision is only recorded when a record states one, along with the alternative that was rejected.',
  },
  {
    glyph: GitPullRequest,
    title: 'Gap and risk detection',
    body: 'Unowned issues, stale work and conflicting records are surfaced by deterministic checks.',
  },
  {
    glyph: Users,
    title: 'Knowledge continuity',
    body: 'Components map to the people who worked on them, so single-owner risk appears before the owner leaves.',
  },
  {
    glyph: FileCheck2,
    title: 'Human verification',
    body: 'A reviewer verifies, corrects or rejects each statement. Approval freezes the version that is shared.',
  },
];

const STEPS = [
  ['Connect authorized sources', 'Import a repository or upload documents. Each source is team or restricted, set by an administrator.'],
  ['Reconstruct the project', 'Records are split into excerpts and mapped to claims about decisions, work, ownership and risks.'],
  ['Review against evidence', 'A reviewer reads the excerpts behind a claim and confirms, corrects or rejects it.'],
  ['Approve and hand over', 'Approval freezes a version without restricted material and unlocks the incoming workspace.'],
];

const COMPARISON = [
  ['Where context lives', 'A document written from memory', 'Claims tied to stored excerpts'],
  ['How you check it', 'Ask the author, if still around', 'Open the record behind the statement'],
  ['What happens to unknowns', 'Quietly omitted', 'Listed as a named gap with severity'],
  ['Who decides what is shared', 'Whoever writes the document', 'A reviewer, with an audit trail'],
];

export default function Home() {
  const { go, user } = useApp();
  const [stats, setStats] = useState(null);

  // The public figures come from the imported project, not a sample. The
  // endpoint returns counts only, so no claim text leaves the server here.
  useEffect(() => {
    let alive = true;
    fetch('/api/site-stats')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (alive && data?.counts) setStats({ ...data.counts, repo: data.project?.repo ?? null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const signals = [
    [
      stats ? String(stats.claims) : '—',
      'evidence-linked claims',
      stats ? `from ${stats.records} records` : 'connect a repository',
    ],
    [
      stats ? String(stats.gaps) : '—',
      'named gaps',
      stats ? `${stats.severeGaps} high severity` : 'surfaced by rules',
    ],
    [stats ? String(stats.sections) : '—', 'handover sections', 'each keeps its excerpt'],
    [stats ? String(stats.roles) : '—', 'roles', 'enforced in the API'],
  ];

  return (
    <div className="site-page">
      <section className="site-hero">
        <div className="wrap site-hero-split">
          <div className="site-hero-copy">
            <p className="eyebrow">Project knowledge continuity</p>
            <h1 className="display">The reasoning leaves with the person. ContextBridge keeps it.</h1>
            <p className="site-hero-lead">
              The code stays when an engineer leaves; the decisions, the unfinished work and the risks do not.
              ContextBridge reconstructs that context from authorized records, links every statement to its evidence, and
              waits for a human to approve what is shared.
            </p>
            <div className="site-hero-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
                Open workspace
                <ArrowRight size={15} strokeWidth={1.9} />
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => go('platform')}>
                See the platform
              </button>
            </div>
            <p className="site-hero-proof">
              <span>Evidence-linked claims</span>
              <span>Human approval</span>
              <span>Permissions enforced server-side</span>
            </p>
          </div>

          <div className="site-hero-media">
            <DashboardPreview stats={stats} />
            <p className="hint site-hero-caption">
              {stats?.repo
                ? `${stats.repo} · ${stats.records} records · ${stats.claims} claims · ${stats.gaps} open gaps`
                : 'Workspace dashboard — connect a repository to populate it.'}
            </p>
          </div>
        </div>

        <div className="wrap hero-flow">
          {FLOW.map(([title, body], index) => (
            <div className="hero-step" key={title}>
              <span className="hero-step-num">{String(index + 1).padStart(2, '0')}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="signal-strip">
        <div className="wrap signal-grid">
          {signals.map(([value, label, note]) => (
            <div className="signal" key={label}>
              <strong>{value}</strong>
              <span className="signal-label">{label}</span>
              <span className="signal-note">{note}</span>
            </div>
          ))}
        </div>
      </section>

      <PageTabs
        label="Home sections"
        tabs={[
          {
            id: 'capabilities',
            label: 'Capabilities',
            meta: '6',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head section-head-split">
                    <div>
                      <p className="eyebrow">What it does</p>
                      <h2>Six capabilities, each producing something reviewable</h2>
                    </div>
                    <p className="section-side">
                      Nothing is inferred without a record behind it, and nothing is shared without approval.
                    </p>
                  </div>
                  <div className="feature-grid">
                    {CAPABILITIES.map((capability, index) => (
                      <Feature
                        key={capability.title}
                        glyph={capability.glyph}
                        title={capability.title}
                        meta={String(index + 1).padStart(2, '0')}
                      >
                        {capability.body}
                      </Feature>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'workflow',
            label: 'How it works',
            meta: '4 steps',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head section-head-split">
                    <div>
                      <p className="eyebrow">Workflow</p>
                      <h2>Four steps from raw activity to an approved handover</h2>
                    </div>
                    <p className="section-side">
                      Every step leaves an artefact: a record, a claim, a review decision or a frozen version.
                    </p>
                  </div>
                  <ol className="step-list">
                    {STEPS.map(([title, body], index) => (
                      <li className="step-item" key={title}>
                        <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <h3>{title}</h3>
                          <p>{body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            ),
          },
          {
            id: 'difference',
            label: 'Why it is different',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head section-head-split">
                    <div>
                      <p className="eyebrow">Differentiators</p>
                      <h2>Not a summary. A reviewable reconstruction.</h2>
                    </div>
                    <p className="section-side">
                      Summarisation hides its reasoning. ContextBridge keeps the difference between what the records say,
                      what a reviewer decided and what was never established.
                    </p>
                  </div>
                  <div className="compare">
                    <div className="compare-head">
                      <span />
                      <span>Typical handover document</span>
                      <span>ContextBridge</span>
                    </div>
                    {COMPARISON.map(([label, before, after]) => (
                      <div className="compare-row" key={label}>
                        <span className="compare-label">{label}</span>
                        <span className="compare-before">{before}</span>
                        <span className="compare-after">{after}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="Hand over the reasoning, not just the repository"
        lead="Connect twentyhq/twenty or novuhq/novu — or any public repository — and the review queue fills with real commits, pull requests and issues."
        secondary={{ label: 'Read about security', route: 'security' }}
      />
    </div>
  );
}
