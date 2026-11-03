import { useMemo, useState } from 'react';
import { Boxes, ChevronRight, FileText, Folder, Info, User } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { buildProjectGraph, neighbours } from '../graph.js';
import { GraphLegend, KnowledgeGraph, TYPE_LABEL } from '../components/Graph.jsx';
import { Badge, Empty, Loading, Strength, cx } from '../ui.jsx';

// Two nodes and one stored edge never explain themselves, so the panel names
// the relation from the point of view of the node you selected: a component is
// "contained in" the project, its people are its "contributors".
const RELATION_LABEL = {
  contains: { out: 'Contains', in: 'Contained in' },
  contributed: { out: 'Contributed to', in: 'Contributors' },
  supports: { out: 'Evidence for', in: 'Evidence from' },
};

function relationGroups(related, selectedId) {
  const groups = new Map();
  for (const { node, edge } of related) {
    const outgoing = edge.from === selectedId;
    const labels = RELATION_LABEL[edge.type] ?? { out: edge.type, in: edge.type };
    const label = outgoing ? labels.out : labels.in;
    const group = groups.get(label) ?? { label, items: [] };
    group.items.push(node);
    groups.set(label, group);
  }
  return [...groups.values()];
}

const NODE_ICON = { project: Boxes, component: Folder, person: User, source: FileText };

// Only a bare repository path splits in two ("engine/" + "core-modules"). A
// source name that merely contains a slash is a title and must stay intact.
const PATH_LABEL = /^[\w.-]+(\/[\w.-]+)+$/;

function nodeMeta(node) {
  if (node.type === 'component') {
    const records = node.meta?.records ?? 0;
    return records ? { value: records, unit: 'rec' } : null;
  }
  if (node.type === 'source') return node.meta?.visibility ? { value: node.meta.visibility } : null;
  return null;
}

export default function Knowledge() {
  const { summary, projects, projectId } = useApp();
  const projectName = projects.find((project) => project.id === projectId)?.name;
  const { data, loading, error } = useAsync(() => api(`/projects/${projectId}/claims`), [projectId]);
  const [selectedId, setSelectedId] = useState('project');

  const graph = useMemo(
    () => buildProjectGraph({ projectName, summary, claims: data?.claims ?? [] }),
    [projectName, summary, data],
  );
  const claims = data?.claims ?? [];
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const related = selected ? neighbours(graph, selected.id) : [];
  const componentClaims = selected?.type === 'component' ? claims.filter((claim) => claim.component === selected.label) : [];
  const nodeClaims = selected?.type === 'claim' ? claims.filter((claim) => claim.id === selected.id.replace('claim:', '')) : [];

  if (loading) return <Loading rows={5} />;
  if (error) return <Empty icon="alert" title="Could not load the graph">{error.message}</Empty>;

  return (
    <div className="stack">
      <section className="graph-panel graph-panel-app">
        <div className="graph-panel-head">
          <div>
            <h2>{projectName ?? 'Project'} knowledge graph</h2>
            <p className="hint">
              Components, contributors and sources derived from {summary?.counts?.records ?? 0} records and{' '}
              {claims.length} claims. Select a node to inspect it.
            </p>
          </div>
          <GraphLegend />
        </div>
        <div className="graph-stage">
          <KnowledgeGraph graph={graph} width={880} height={440} selectedId={selected?.id} onSelect={setSelectedId} />
          <aside className="graph-detail">
            {selected && (
              <>
                <header className="graph-detail-head">
                  <span className="badge badge-neutral">{TYPE_LABEL[selected.type]}</span>
                  <h3>{selected.label}</h3>
                </header>

                {selected.type === 'component' && (
                  <div className="graph-facts">
                    <div>
                      <span className="mini-label">Records</span>
                      <strong>{selected.meta.records ?? 0}</strong>
                    </div>
                    <div>
                      <span className="mini-label">Claims</span>
                      <strong>{selected.meta.total ?? 0}</strong>
                    </div>
                    <div>
                      <span className="mini-label">Unverified</span>
                      <strong>{selected.meta.pending ?? 0}</strong>
                    </div>
                  </div>
                )}

                {selected.type === 'component' && selected.meta.contributors === 1 && (
                  <p className="notice graph-notice">
                    Single contributor. If that person leaves, the reasoning behind this component leaves with them.
                  </p>
                )}

                {selected.type === 'source' && (
                  <p className="hint">
                    {selected.meta.records ?? 0} records · {selected.meta.visibility} visibility
                  </p>
                )}

                <div className="graph-relations">
                  <div className="graph-relations-head">
                    <span className="mini-label">Connections</span>
                    {related.length > 0 && <span className="graph-relations-count">{related.length}</span>}
                  </div>
                  {related.length ? (
                    <div className="graph-relation-groups">
                      {relationGroups(related, selected.id).map((group) => (
                        <div className="graph-relation-group" key={group.label}>
                          <div className="graph-relation-group-head">
                            <span>{group.label}</span>
                            <i>{group.items.length}</i>
                          </div>
                          {group.items.map((node) => {
                            const meta = nodeMeta(node);
                            const Icon = NODE_ICON[node.type] ?? Folder;
                            // In a path the last segment names the thing and the
                            // folder chain only says where it lives, so the chain is
                            // muted and is what gives way when the row runs out of
                            // room.
                            const isPath = PATH_LABEL.test(node.label);
                            const cut = isPath ? node.label.lastIndexOf('/') : -1;
                            const leaf = isPath ? node.label.slice(cut + 1) : node.label;
                            const parent = isPath ? node.label.slice(0, cut + 1) : null;
                            return (
                              <button
                                type="button"
                                className="graph-relation"
                                key={node.id}
                                onClick={() => setSelectedId(node.id)}
                                title={node.label}
                              >
                                <span className={cx('graph-relation-icon', `graph-relation-icon-${node.type}`)}>
                                  <Icon size={11} strokeWidth={1.9} />
                                </span>
                                <span className="graph-relation-name">
                                  {parent && <span className="graph-relation-parent">{parent}</span>}
                                  <span className={cx('graph-relation-leaf', isPath && 'is-path')}>{leaf}</span>
                                </span>
                                {meta && (
                                  <span className="graph-relation-meta">
                                    {meta.value}
                                    {meta.unit && <i>{meta.unit}</i>}
                                  </span>
                                )}
                                <ChevronRight size={12} strokeWidth={1.8} className="graph-relation-go" />
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">No recorded relationship. A missing edge means the records never connected these.</p>
                  )}
                </div>

                {(componentClaims.length > 0 || nodeClaims.length > 0) && (
                  <div className="graph-claims">
                    <span className="mini-label">Claims on this component</span>
                    {(nodeClaims.length ? nodeClaims : componentClaims).slice(0, 6).map((claim) => (
                      <div className="graph-claim" key={claim.id}>
                        <p>{claim.text}</p>
                        <div className="claim-meta">
                          <span className="badge badge-neutral">{claim.categoryLabel}</span>
                          <Strength value={claim.evidenceStrength} />
                          <Badge
                            tone={
                              claim.status === 'verified'
                                ? 'success'
                                : claim.status === 'rejected'
                                  ? 'critical'
                                  : claim.status === 'edited'
                                    ? 'accent'
                                    : 'warning'
                            }
                          >
                            {claim.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {componentClaims.length > 6 && (
                      <p className="hint">+{componentClaims.length - 6} more in evidence review.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </section>

      <p className="preview-note graph-note">
        <Info size={13} strokeWidth={1.8} />
        Edges are derived from stored data only: contribution counts from imported records, and source links from claims
        that cite an excerpt from that source.
      </p>
    </div>
  );
}
