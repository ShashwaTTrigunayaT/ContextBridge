import { ArrowRight, Boxes, Link2, Users } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, Feature, PageHero } from '../../components/site/blocks.jsx';
import { demoGraph } from '../../graph.js';
import { GraphLegend, KnowledgeGraph } from '../../components/Graph.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const GRAPH = demoGraph();

const NODE_TYPES = [
  ['Components', 'The parts of the system the records mention. A component with one contributor is flagged before that person leaves.'],
  ['Contributors', 'People, not job titles. An edge means this person authored, reviewed or discussed work in that component.'],
  ['Sources', 'Authorized inputs with a visibility. An edge means a claim cites an excerpt from that source.'],
  ['Claims', 'Statements about decisions, work, dependencies and risks, each with strength and review state.'],
];

const RELATIONSHIPS = [
  {
    glyph: Users,
    title: 'Person to component',
    body: 'Contribution edges show who knows which part. Settlement and ledger each show a single contributor in the demo, which is the handover risk in one line.',
  },
  {
    glyph: Link2,
    title: 'Source to component',
    body: 'Support edges show which evidence reaches which part of the system. A component supported only by a restricted source looks isolated on purpose.',
  },
  {
    glyph: Boxes,
    title: 'Component to claim',
    body: 'The graph is a way into the claim list, not a replacement for it. Selecting a node reveals its claims, each opening its source excerpt.',
  },
];

export default function KnowledgeGraphPage() {
  const { go } = useApp();

  return (
    <div className="site-page">
      <PageHero
        eyebrow="Knowledge graph"
        title="See who knows what, and what the records can support"
        lead="A repository listing tells you which files exist. The knowledge graph tells you which components the team understands, who holds that understanding, and which sources can back it up."
        actions={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go('sign-in')}>
            Open the interactive graph
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
        }
      />

      <PageTabs
        label="Knowledge graph sections"
        tabs={[
          {
            id: 'graph',
            label: 'The graph',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="graph-panel">
                    <div className="graph-panel-head">
                      <div>
                        <h2>payments-service</h2>
                        <p className="hint">
                          Illustrative graph of an imported repository. Every node comes from an imported record or a
                          stored claim.
                        </p>
                      </div>
                      <GraphLegend />
                    </div>
                    <KnowledgeGraph graph={GRAPH} width={1080} height={430} />
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'entities',
            label: 'Entities',
            meta: '4',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">What a node means</p>
                      <h2>Four entity types, derived from records</h2>
                    </div>
                  </div>
                  <div className="node-grid">
                    {NODE_TYPES.map(([title, body]) => (
                      <article className="node-card" key={title}>
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
            id: 'relationships',
            label: 'Relationships',
            meta: '3',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Relationship exploration</p>
                      <h2>Edges that answer a question</h2>
                      <p className="section-lead">
                        Every edge is derived from stored data: contribution counts from imported records, and source
                        links from claims that cite an excerpt. A missing edge is meaningful — the records never
                        connected those things.
                      </p>
                    </div>
                  </div>
                  <div className="feature-grid feature-grid-3">
                    {RELATIONSHIPS.map((item) => (
                      <Feature key={item.title} glyph={item.glyph} title={item.title}>
                        {item.body}
                      </Feature>
                    ))}
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="Open the graph on an imported repository"
        lead="Sign in as a reviewer to select components, inspect claims and follow sources back to their records."
        secondary={{ label: 'Activity intelligence', route: 'activity-intelligence' }}
      />
    </div>
  );
}
