import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { Avatar, Badge, Empty, Loading, Panel, Segmented, cx } from '../ui.jsx';
import { DonutChart } from '../components/charts.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'import', label: 'Imports' },
  { value: 'review', label: 'Reviews' },
  { value: 'approve', label: 'Approvals' },
  { value: 'access', label: 'Access' },
];

const TONES = {
  approve: 'success',
  verify: 'success',
  edit: 'accent',
  reject: 'critical',
  denied: 'critical',
  error: 'critical',
  access: 'warning',
  import: 'accent',
  reconstruct: 'neutral',
};

// One colour per action group, so a ring with two or three slices still reads
// as separate data series instead of one solid accent.
const SERIES_TONE = {
  import: 'accent',
  review: 'cyan',
  approve: 'success',
  access: 'warning',
  other: 'neutral',
};

const GROUP_LABEL = {
  import: 'Imports',
  review: 'Reviews',
  approve: 'Approvals',
  access: 'Access',
  other: 'Other',
};

function toneFor(action = '') {
  const entry = Object.entries(TONES).find(([key]) => action.includes(key));
  return entry ? entry[1] : 'neutral';
}

function groupFor(action = '') {
  if (action.includes('import') || action.includes('connect') || action.includes('disconnect')) return 'import';
  if (action.includes('approve')) return 'approve';
  if (action.includes('denied') || action.includes('access')) return 'access';
  if (action.includes('verify') || action.includes('edit') || action.includes('reject') || action.includes('review')) {
    return 'review';
  }
  return 'other';
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Activity() {
  const { projectId } = useApp();
  const { data, loading, error } = useAsync(() => api(`/projects/${projectId}/audit`), [projectId]);
  const versions = useAsync(
    () => api(`/projects/${projectId}/handover/versions`).catch(() => ({ versions: [] })),
    [projectId],
  );
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  // A failed source import writes a raw API error into the log. It stays in the
  // server-side audit trail, but it is noise in a human-facing timeline.
  const entries = (data?.entries ?? []).filter((entry) => !/error/i.test(entry.action));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== 'all' && groupFor(entry.action) !== filter) return false;
      if (!needle) return true;
      return `${entry.user_name ?? ''} ${entry.action} ${entry.detail ?? ''}`.toLowerCase().includes(needle);
    });
  }, [entries, filter, query]);

  const days = useMemo(() => {
    const groups = new Map();
    for (const entry of filtered) {
      const date = new Date(entry.created_at);
      const key = date.toDateString();
      if (!groups.has(key)) groups.set(key, { key, date, items: [] });
      groups.get(key).items.push(entry);
    }
    return [...groups.values()];
  }, [filtered]);

  const actionChart = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const group = groupFor(entry.action);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return Object.keys(GROUP_LABEL)
      .filter((group) => counts.has(group))
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
      .map((group) => ({
        label: GROUP_LABEL[group],
        value: counts.get(group) ?? 0,
        tone: SERIES_TONE[group] ?? 'neutral',
      }));
  }, [entries]);

  const contributors = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const name = entry.user_name ?? 'system';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  if (loading) return <Loading rows={6} />;
  if (error) return <Empty icon="lock" title="Activity log unavailable">{error.message}</Empty>;

  return (
    <div className="stack">
      <section className="ws-block">
        <header className="ws-block-head">
          <div>
            <h2 className="ws-block-title">Recorded actions by type</h2>
            <p className="ws-block-sub">Every entry is written by the API — {entries.length} in this project</p>
          </div>
          <Badge tone="violet">Append-only</Badge>
        </header>
        {actionChart.length ? (
          <DonutChart data={actionChart} label="actions" size={132} />
        ) : (
          <Empty icon="activity" title="Nothing recorded yet">
            Actions appear as soon as sources are connected or claims are reviewed.
          </Empty>
        )}
      </section>

      <div className="activity-toolbar">
        <div className="search">
          <Search size={14} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by person, action or detail"
            aria-label="Search activity"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((option) => ({
            ...option,
            count:
              option.value === 'all'
                ? entries.length
                : entries.filter((entry) => groupFor(entry.action) === option.value).length,
          }))}
        />
      </div>

      <div className="activity-layout">
        <Panel
          title="Activity timeline"
          subtitle="Grouped by day, newest first"
          count={`${filtered.length} / ${entries.length}`}
        >
          {days.length ? (
            <div className="feed">
              {days.map((day) => (
                <section className="feed-day" key={day.key}>
                  <header className="feed-day-head">
                    <span className="feed-day-label">{dayLabel(day.date)}</span>
                    <span className="feed-day-count">{day.items.length}</span>
                  </header>
                  <ol className="feed-list">
                    {day.items.map((entry) => (
                      <li className="feed-row" key={entry.id}>
                        <time className="feed-time" dateTime={entry.created_at}>
                          {new Date(entry.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </time>
                        <span
                          className={cx('feed-marker', `feed-marker-${toneFor(entry.action)}`)}
                          aria-hidden="true"
                        />
                        <div className="feed-main">
                          <div className="feed-head">
                            <Avatar name={entry.user_name ?? 'system'} size="xs" />
                            <strong>{entry.user_name ?? 'system'}</strong>
                            <Badge tone={toneFor(entry.action)}>{entry.action.replace(/[._]/g, ' ')}</Badge>
                          </div>
                          {entry.detail && (
                            <p className="feed-detail" title={entry.detail}>
                              {entry.detail}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <Empty icon="activity" title="No activity matches">
              Clear the search or choose another filter. Actions appear here as soon as sources are connected or claims
              are reviewed.
            </Empty>
          )}
        </Panel>

        <div className="activity-side">
          <Panel title="Contributors" subtitle="Who generated this history" count={contributors.length}>
            <div className="rows">
              {contributors.map(([name, count]) => (
                <div className="row" key={name}>
                  <Avatar name={name} size="sm" />
                  <div className="row-main">
                    <span>{name}</span>
                    <span className="row-meta">
                      {count} recorded action{count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Project snapshots" subtitle="Approved versions, frozen" count={versions.data?.versions?.length ?? 0}>
            {versions.data?.versions?.length ? (
              <div className="version-list">
                {versions.data.versions.map((version) => (
                  <div className="version" key={version.version}>
                    <div>
                      <strong>v{version.version}</strong>
                      <span className="muted small"> {version.approved_by ?? 'reviewer'}</span>
                    </div>
                    <span className="muted tiny">{new Date(version.approved_at).toLocaleString()}</span>
                    <span className="muted tiny">
                      {version.pending_claims} unverified · {version.excluded_claims} excluded
                    </span>
                    {version.summary && <p className="review-note">{version.summary}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">
                No approved version yet. Approving the handover creates the first snapshot incoming members can read.
              </p>
            )}
          </Panel>

          <div className="side-note">
            <Badge tone="violet">Append-only</Badge>
            <p className="hint">
              Denied access attempts are recorded here too. A log that only keeps successes cannot be used to review an
              incident.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
