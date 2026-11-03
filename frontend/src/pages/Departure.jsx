import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, GitBranch, UserRound, Users } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { Avatar, Badge, Btn, CategoryBadge, Empty, Field, Icon, Loading, Panel, cx } from '../ui.jsx';

const GROUP_ORDER = ['responsibility', 'unfinished', 'in_progress', 'blocker', 'decision', 'dependency', 'risk', 'question'];

const GROUP_HINT = {
  responsibility: 'Ownership the next person inherits',
  unfinished: 'Open work that moves with the role',
  in_progress: 'Work started but not finished',
  blocker: 'Something the next owner must unblock',
  decision: 'Reasoning they need to keep',
  dependency: 'What the work relies on',
  risk: 'What could break without context',
  question: 'Questions still unanswered',
};

export default function Departure() {
  const { projectId, summary, notify, refresh, go } = useApp();
  const { data, loading, error, reload } = useAsync(() => api(`/projects/${projectId}/transition`), [projectId]);
  const [contributorKey, setContributorKey] = useState('');
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState([]);
  const [customText, setCustomText] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    if (!data) return [];
    const rows = [];
    const seenNames = new Set();
    for (const member of data.members ?? []) {
      rows.push({
        key: `user:${member.userId}`,
        userId: member.userId,
        name: member.name,
        detail: member.title ?? member.email,
        role: member.role,
      });
      seenNames.add(member.name.toLowerCase());
    }
    for (const contributor of data.contributors ?? []) {
      if (seenNames.has(contributor.name.toLowerCase())) continue;
      rows.push({
        key: `name:${contributor.name}`,
        userId: null,
        name: contributor.name,
        detail: 'GitHub contributor',
        role: null,
      });
    }
    return rows;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const focus = data.focus;
    if (focus?.contributorUserId) setContributorKey(`user:${focus.contributorUserId}`);
    else if (focus?.contributor) setContributorKey(`name:${focus.contributor}`);
    else if (data.transitionUser?.id) setContributorKey(`user:${data.transitionUser.id}`);
    setSelected((focus?.responsibilities ?? []).map((item) => item.claimId).filter(Boolean));
    setCustom((focus?.responsibilities ?? []).filter((item) => !item.claimId).map((item) => item.text));
  }, [data]);

  if (loading) return <Loading rows={5} />;
  if (error) {
    return (
      <Empty icon="alert" title="Could not load the departure scope">
        {error.message}
      </Empty>
    );
  }

  const locked = Boolean(data.locked);
  const contributor = options.find((option) => option.key === contributorKey) ?? null;
  const candidates = data.candidates ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = candidates.filter(
    (claim) =>
      !needle ||
      `${claim.text} ${claim.component ?? ''} ${claim.categoryLabel}`.toLowerCase().includes(needle),
  );
  const groups = GROUP_ORDER.map((category) => ({
    category,
    items: visible.filter((claim) => claim.category === category),
  })).filter((group) => group.items.length);

  const chosenClaims = candidates.filter((claim) => selected.includes(claim.id));
  const areas = [...new Set([...chosenClaims.map((claim) => claim.component).filter(Boolean)])];
  const totalSelected = chosenClaims.length + custom.length;
  const transferable = chosenClaims.length + custom.length > 0 && Boolean(contributor);

  function toggle(claimId) {
    setSelected((list) => (list.includes(claimId) ? list.filter((id) => id !== claimId) : [...list, claimId]));
  }

  function addCustom(event) {
    event.preventDefault();
    const text = customText.trim();
    if (!text) return;
    setCustom((list) => [...list, text]);
    setCustomText('');
  }

  async function save() {
    if (!contributor || !transferable) return;
    setBusy(true);
    try {
      await api(`/projects/${projectId}/transition`, {
        method: 'POST',
        body: {
          contributor: contributor.name,
          contributorUserId: contributor.userId,
          responsibilities: [
            ...chosenClaims.map((claim) => ({
              claimId: claim.id,
              text: claim.text,
              category: claim.category,
              component: claim.component,
            })),
            ...custom.map((text) => ({ text, category: 'responsibility' })),
          ],
          components: areas,
        },
      });
      notify(`${totalSelected} responsibility(ies) assigned to ${contributor.name}. The handover draft now leads with this transfer.`, 'success');
      await reload();
      await refresh();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="transfer-hero">
        <div className="transfer-hero-main">
          <span className="transfer-hero-icon">
            <ArrowRightLeft size={19} strokeWidth={1.9} />
          </span>
          <div>
            <p className="eyebrow">Departure scope</p>
            <h2>{data.focus?.contributor ? `${data.focus.contributor} is handing over` : 'Who is leaving, and what moves with them?'}</h2>
            <p className="muted">
              Reconstruction reads the whole project. This scope narrows the handover to one contributor and the
              responsibilities they are actually transferring, so the next owner starts with their work — not
              everything the repository ever produced.
            </p>
          </div>
        </div>
        <div className="transfer-hero-side">
          <Badge tone={locked ? 'success' : 'warning'} dot>
            {locked ? `Approved v${data.approvedVersion}` : 'Draft'}
          </Badge>
          <span className="transfer-hero-count">
            <strong>{totalSelected}</strong>
            <span>responsibilities</span>
          </span>
        </div>
      </section>

      {locked && (
        <div className="notice">
          <Icon name="lock" size={15} />
          <span>
            Version {data.approvedVersion} is approved and frozen. The transfer below is what the incoming member
            received. Create a new transition project to record a different departure.
          </span>
        </div>
      )}

      <div className="transfer-layout">
        <div className="transfer-main">
          <Panel
            title="Departing contributor"
            subtitle="Only project members and recorded contributors of this project can be selected."
          >
            {options.length ? (
              <div className="contributor-grid">
                {options.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={cx('contributor-card', contributorKey === option.key && 'is-selected')}
                    onClick={() => !locked && setContributorKey(option.key)}
                    disabled={locked}
                  >
                    <Avatar name={option.name} size="md" />
                    <span className="contributor-body">
                      <strong>{option.name}</strong>
                      <span className="contributor-detail">{option.detail}</span>
                    </span>
                    <span className="contributor-meta">
                      {option.role ? <Badge tone="accent">{option.role}</Badge> : <Badge tone="blue">Contributor</Badge>}
                      {contributorKey === option.key && (
                        <span className="contributor-tick">
                          <Check size={12} strokeWidth={2.5} />
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty icon="alert" title="No contributors recorded yet">
                Connect a repository and run reconstruction so contributors can be identified.
              </Empty>
            )}
          </Panel>

          <Panel
            title="Responsibilities to transfer"
            subtitle="Pick the claims this person owns or is leaving unfinished."
            count={`${chosenClaims.length}/${candidates.length}`}
            action={
              !locked && candidates.length ? (
                <div className="row-actions">
                  <Btn variant="ghost" size="sm" onClick={() => setSelected(candidates.map((claim) => claim.id))}>
                    Select all
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>
                    Clear
                  </Btn>
                </div>
              ) : null
            }
          >
            <div className="transfer-toolbar">
              <div className="search">
                <Icon name="search" size={15} />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter responsibilities, areas…"
                  aria-label="Filter responsibilities"
                />
              </div>
              <span className="hint">{areas.length ? `${areas.length} area(s) represented` : 'No areas selected'}</span>
            </div>

            {groups.length ? (
              <div className="responsibility-groups">
                {groups.map((group) => (
                  <section className="responsibility-group" key={group.category}>
                    <header className="responsibility-head">
                      <CategoryBadge category={group.category} label={group.items[0].categoryLabel} />
                      <span className="responsibility-hint">{GROUP_HINT[group.category] ?? ''}</span>
                      <span className="responsibility-count">{group.items.length}</span>
                    </header>
                    <div className="responsibility-list">
                      {group.items.map((claim) => {
                        const checked = selected.includes(claim.id);
                        return (
                          <label className={cx('responsibility-row', checked && 'is-checked')} key={claim.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(claim.id)}
                              disabled={locked}
                            />
                            <span className="responsibility-check">{checked && <Check size={11} strokeWidth={3} />}</span>
                            <span className="responsibility-text">{claim.text}</span>
                            {claim.component && <span className="chip mono responsibility-component">{claim.component}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <Empty icon="search" title="No responsibilities match">
                Clear the filter or run reconstruction to rebuild the claims.
              </Empty>
            )}

            {!locked && (
              <form className="transfer-custom" onSubmit={addCustom}>
                <Field label="Add a responsibility the records do not capture">
                  <div className="transfer-custom-row">
                    <input
                      value={customText}
                      onChange={(event) => setCustomText(event.target.value)}
                      placeholder="Owns the vendor escalation rota"
                    />
                    <Btn variant="default" type="submit" icon="plus" disabled={!customText.trim()}>
                      Add
                    </Btn>
                  </div>
                </Field>
                {custom.length > 0 && (
                  <div className="custom-chips">
                    {custom.map((text, index) => (
                      <span className="custom-chip" key={`${text}-${index}`}>
                        {text}
                        <button
                          type="button"
                          onClick={() => setCustom((list) => list.filter((_, position) => position !== index))}
                          aria-label={`Remove ${text}`}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </form>
            )}
          </Panel>
        </div>

        <aside className="transfer-side">
          <Panel title="Transfer summary">
            <div className="transfer-summary">
              <div className="transfer-person">
                <Avatar name={contributor?.name ?? 'Departing member'} size="md" />
                <div>
                  <span className="mini-label">Departing</span>
                  <strong>{contributor?.name ?? 'Nobody selected'}</strong>
                  <span className="hint">{contributor?.detail ?? 'Pick a contributor to begin.'}</span>
                </div>
              </div>

              <dl className="transfer-facts">
                <div>
                  <dt>Responsibilities</dt>
                  <dd>{totalSelected}</dd>
                </div>
                <div>
                  <dt>Areas</dt>
                  <dd>{areas.length}</dd>
                </div>
                <div>
                  <dt>Open gaps</dt>
                  <dd>{summary?.counts?.openGaps ?? 0}</dd>
                </div>
                <div>
                  <dt>Unverified claims</dt>
                  <dd>{summary?.counts?.pendingClaims ?? 0}</dd>
                </div>
              </dl>

              {areas.length > 0 && (
                <div className="transfer-areas">
                  <span className="mini-label">Areas in scope</span>
                  <div className="transfer-area-list">
                    {areas.slice(0, 8).map((area) => (
                      <span className="chip mono" key={area}>
                        {area}
                      </span>
                    ))}
                    {areas.length > 8 && <span className="chip">+{areas.length - 8}</span>}
                  </div>
                </div>
              )}

              <div className="transfer-actions">
                <Btn variant="primary" icon="check" onClick={save} disabled={locked || busy || !transferable}>
                  {busy ? 'Saving…' : locked ? 'Approved — frozen' : 'Save transfer scope'}
                </Btn>
                <Btn variant="ghost" iconRight="arrow" onClick={() => go('handover')}>
                  Open handover
                </Btn>
              </div>
              <p className="hint">The scope is a lens over the same evidence. It never hides an unresolved risk.</p>
            </div>
          </Panel>

          <Panel title="Why this matters">
            <ul className="checklist">
              <li>
                <Users size={13} strokeWidth={1.8} /> A general reconstruction names every area; a departure names the
                person and the work that changes hands.
              </li>
              <li>
                <GitBranch size={13} strokeWidth={1.8} /> The incoming member sees their responsibilities first, then
                the surrounding context.
              </li>
              <li>
                <UserRound size={13} strokeWidth={1.8} /> Approved versions keep the scope they were approved with.
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
