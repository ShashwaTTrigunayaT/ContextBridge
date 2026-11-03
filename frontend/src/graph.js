// Knowledge-graph model. Everything here is derived from data the API already
// returns: the project summary (components + contributors) and the extracted
// claims (which carry their component and their evidence sources). No extra
// endpoints and no invented facts.

const byId = (nodes) => new Map(nodes.map((node) => [node.id, node]));

export function buildProjectGraph({ projectName, summary, claims = [] }) {
  const nodes = [{ id: 'project', type: 'project', label: projectName ?? 'Project', meta: {} }];
  const edges = [];
  const seen = new Set();

  const addEdge = (from, to, type) => {
    const key = `${from}->${to}:${type}`;
    if (seen.has(key) || from === to) return;
    seen.add(key);
    edges.push({ from, to, type });
  };

  const claimsByComponent = new Map();
  for (const claim of claims) {
    if (!claim.component) continue;
    const bucket = claimsByComponent.get(claim.component) ?? { total: 0, pending: 0, decisions: 0 };
    bucket.total += 1;
    if (claim.status === 'pending') bucket.pending += 1;
    if (claim.category === 'decision') bucket.decisions += 1;
    claimsByComponent.set(claim.component, bucket);
  }

  for (const component of summary?.components ?? []) {
    const id = `component:${component.name}`;
    nodes.push({
      id,
      type: 'component',
      label: component.name,
      meta: {
        records: component.records ?? 0,
        contributors: (component.contributors ?? []).length,
        ...(claimsByComponent.get(component.name) ?? { total: 0, pending: 0, decisions: 0 }),
      },
    });
    addEdge('project', id, 'contains');
    for (const person of component.contributors ?? []) {
      const personId = `person:${person.name}`;
      if (!byId(nodes).has(personId)) nodes.push({ id: personId, type: 'person', label: person.name, meta: {} });
      addEdge(personId, id, 'contributed');
    }
  }

  for (const source of summary?.sources ?? []) {
    const id = `source:${source.id}`;
    nodes.push({
      id,
      type: 'source',
      label: source.name,
      meta: { records: source.records ?? 0, visibility: source.visibility },
    });
  }

  // A source is linked to a component when a claim about that component cites
  // an excerpt from that source.
  const sourceByName = new Map((summary?.sources ?? []).map((source) => [source.name, source]));
  for (const claim of claims) {
    if (!claim.component) continue;
    for (const evidence of claim.evidence ?? []) {
      const source = sourceByName.get(evidence.sourceName);
      if (source) addEdge(`source:${source.id}`, `component:${claim.component}`, 'supports');
    }
  }

  return { nodes, edges };
}

// Example graph for the public pages. Same shape and same vocabulary as the real
// one so the previews never show something the product cannot draw.
export function demoGraph() {
  const nodes = [
    { id: 'project', type: 'project', label: 'payments-service', meta: {} },
    { id: 'source:gh', type: 'source', label: 'GitHub activity', meta: { records: 18, visibility: 'team' } },
    { id: 'source:adr', type: 'source', label: 'ADR-004 caching', meta: { records: 3, visibility: 'team' } },
    { id: 'source:acq', type: 'source', label: 'Acquirer agreement', meta: { records: 2, visibility: 'restricted' } },
    {
      id: 'component:settlement',
      type: 'component',
      label: 'settlement',
      meta: { records: 7, contributors: 1, total: 14, pending: 5, decisions: 2 },
    },
    {
      id: 'component:webhooks',
      type: 'component',
      label: 'webhooks',
      meta: { records: 5, contributors: 2, total: 9, pending: 4, decisions: 1 },
    },
    {
      id: 'component:retry',
      type: 'component',
      label: 'retry-policy',
      meta: { records: 4, contributors: 2, total: 6, pending: 2, decisions: 3 },
    },
    { id: 'component:ledger', type: 'component', label: 'ledger', meta: { records: 3, contributors: 1, total: 5, pending: 3, decisions: 0 } },
    { id: 'person:aisha', type: 'person', label: 'Aisha Rahman', meta: { role: 'Departed owner' } },
    { id: 'person:daniel', type: 'person', label: 'Daniel Okafor', meta: { role: 'Reviewer' } },
    { id: 'person:mei', type: 'person', label: 'Mei Lin', meta: { role: 'Incoming member' } },
    { id: 'person:priya', type: 'person', label: 'Priya Nair', meta: { role: 'Administrator' } },
  ];
  return {
    nodes,
    edges: [
      { from: 'project', to: 'component:settlement', type: 'contains' },
      { from: 'project', to: 'component:webhooks', type: 'contains' },
      { from: 'project', to: 'component:retry', type: 'contains' },
      { from: 'project', to: 'component:ledger', type: 'contains' },
      { from: 'person:aisha', to: 'component:settlement', type: 'contributed' },
      { from: 'person:aisha', to: 'component:webhooks', type: 'contributed' },
      { from: 'person:aisha', to: 'component:retry', type: 'contributed' },
      { from: 'person:daniel', to: 'component:webhooks', type: 'contributed' },
      { from: 'person:daniel', to: 'component:ledger', type: 'contributed' },
      { from: 'source:gh', to: 'component:settlement', type: 'supports' },
      { from: 'source:gh', to: 'component:webhooks', type: 'supports' },
      { from: 'source:gh', to: 'component:retry', type: 'supports' },
      { from: 'source:adr', to: 'component:retry', type: 'supports' },
      { from: 'source:acq', to: 'component:settlement', type: 'supports' },
    ],
  };
}

export function neighbours(graph, nodeId) {
  const links = graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  const lookup = byId(graph.nodes);
  return links.map((edge) => {
    const otherId = edge.from === nodeId ? edge.to : edge.from;
    return { edge, node: lookup.get(otherId) };
  }).filter((entry) => entry.node);
}
