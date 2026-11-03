import { useMemo } from 'react';
import { cx } from '../ui.jsx';

const TYPE_LABEL = { project: 'Project', component: 'Component', person: 'Contributor', source: 'Source' };

// Node colours are the same four the legend shows, and they are separable on a
// teal band as well as on the white canvas.
const NODE_TONE = {
  project: '#2dd4bf',
  component: '#7c3aed',
  person: '#db2777',
  source: '#94a3b8',
};

function truncate(label = '', max = 18) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function layout(graph, width, height) {
  const components = graph.nodes.filter((node) => node.type === 'component');
  const people = graph.nodes.filter((node) => node.type === 'person');
  const sources = graph.nodes.filter((node) => node.type === 'source');
  const centre = { x: width / 2, y: height / 2 };
  const rx = Math.min(width * 0.31, 240);
  const ry = Math.min(height * 0.35, 165);
  const positions = new Map([['project', { ...centre, angle: 0 }]]);

  const ring = (list, startAngle, span, scale = 1) => {
    list.forEach((node, index) => {
      const step = list.length === 1 ? 0 : span / (list.length - 1 || 1);
      const angle = startAngle + step * index;
      positions.set(node.id, {
        x: centre.x + Math.cos(angle) * rx * scale,
        y: centre.y + Math.sin(angle) * ry * scale,
        angle,
      });
    });
  };

  ring(components, -Math.PI / 2, Math.PI * 2 * (components.length > 1 ? (components.length - 1) / components.length : 0));
  // People sit on the right, sources on the left, so the direction of an edge
  // says what it means: material feeds work, people own it.
  // Contributors and sources sit outside the component ring, past where the
  // component labels end, so no name is written over by a stray dot.
  ring(people, -Math.PI / 2.9, Math.PI / 1.7, 1.44);
  ring(sources, Math.PI - Math.PI / 2.9, Math.PI / 1.7, 1.4);
  return positions;
}

// Labels leave the ring outwards on the side the node sits, which is what keeps
// sixteen component paths from writing over each other. Nodes at the top and
// bottom of the ellipse have no side, so they get a centred label instead.
function labelPlacement(node, position, radius) {
  if (node.type === 'project') return { x: 0, y: radius + 16, anchor: 'middle' };
  const cos = Math.cos(position.angle ?? 0);
  const sin = Math.sin(position.angle ?? 0);
  if (Math.abs(cos) < 0.42) {
    return sin <= 0
      ? { x: 0, y: -(radius + 14), anchor: 'middle' }
      : { x: 0, y: radius + 16, anchor: 'middle' };
  }
  return cos > 0
    ? { x: radius + 9, y: 3.5, anchor: 'start' }
    : { x: -(radius + 9), y: 3.5, anchor: 'end' };
}

export function KnowledgeGraph({ graph, width = 720, height = 400, selectedId, onSelect, compact = false }) {
  const positions = useMemo(() => layout(graph, width, height), [graph, width, height]);
  const selected = graph.nodes.find((node) => node.id === selectedId);
  // The project is the default selection, and dimming everything that does not
  // touch it would hide the contributor and source edges on first paint.
  const focusId = selectedId && selectedId !== 'project' ? selectedId : null;

  return (
    <svg
      className={cx('graph', compact && 'graph-compact')}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Knowledge graph of components, contributors and sources"
    >
      <g className="graph-edges">
        {graph.edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const active = focusId && (edge.from === focusId || edge.to === focusId);
          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.type}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={cx(
                'graph-edge',
                `graph-edge-${edge.type}`,
                active && 'is-active',
                focusId && !active && 'is-muted',
              )}
            />
          );
        })}
      </g>

      <g className="graph-nodes">
        {graph.nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const isSelected = node.id === selectedId;
          const radius = node.type === 'project' ? 15 : node.type === 'component' ? 7.5 : 5.5;
          const isRisk = node.type === 'component' && node.meta?.contributors === 1;
          const label = compact
            ? { x: 0, y: radius + 12, anchor: 'middle' }
            : labelPlacement(node, position, radius);
          return (
            <g
              key={node.id}
              className={cx('graph-node', `graph-node-${node.type}`, isSelected && 'is-selected', onSelect && 'is-interactive')}
              transform={`translate(${position.x} ${position.y})`}
              onClick={onSelect ? () => onSelect(node.id) : undefined}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={
                onSelect
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(node.id);
                      }
                    }
                  : undefined
              }
            >
              <title>{`${TYPE_LABEL[node.type]} · ${node.label}`}</title>
              <circle r={radius + (isSelected ? 5 : 0)} className="graph-halo" />
              <circle r={radius} className="graph-dot" fill={NODE_TONE[node.type]} />
              {isRisk && <circle r={radius + 3} className="graph-risk-ring" />}
              {(node.type !== 'project' || !compact) && (
                <text
                  className={cx('graph-label', node.type !== 'component' && 'graph-label-quiet', isSelected && 'is-selected')}
                  x={label.x}
                  y={label.y}
                  textAnchor={label.anchor}
                  dominantBaseline="middle"
                >
                  {truncate(node.label, node.type === 'component' ? 19 : 14)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function GraphLegend() {
  return (
    <div className="graph-legend">
      {['project', 'component', 'person', 'source'].map((type) => (
        <span className="legend-item" key={type}>
          <i className={cx('graph-swatch', `graph-swatch-${type}`)} />
          {TYPE_LABEL[type]}
        </span>
      ))}
      <span className="legend-item">
        <i className="graph-swatch graph-swatch-risk" />
        Single contributor
      </span>
    </div>
  );
}

export { TYPE_LABEL };
