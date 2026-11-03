import { useEffect, useRef, useState } from 'react';
import { Folder } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useAsync } from '../hooks.js';
import { DocumentSections, GapList } from '../components/Document.jsx';
import AcknowledgementCard from '../components/Acknowledgement.jsx';
import { Badge, Btn, Empty, Icon, Loading, StatCard } from '../ui.jsx';

const SUGGESTIONS = [
  'What should I work on first?',
  'Which pull requests remain unfinished?',
  'Why was exponential backoff chosen?',
  'What are the known risks?',
  'Who owns webhook replay?',
];

export default function Workspace() {
  const { projectId, summary, refresh } = useApp();
  const { data, loading, error, reload } = useAsync(() => api(`/projects/${projectId}/handover`), [projectId]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, busy]);

  if (loading) return <Loading rows={6} />;
  if (error) {
    return (
      <div className="card locked">
        <span className="locked-icon">
          {error.status === 403 ? <Icon name="lock" size={22} /> : <Icon name="alert" size={22} />}
        </span>
        <h2>{error.status === 403 ? 'Waiting for an approved handover' : 'Could not load the workspace'}</h2>
        <p className="muted">{error.message}</p>
        <p className="hint">The incoming workspace only ever shows approved, permission-filtered content.</p>
      </div>
    );
  }

  const content = data.content;
  const overview = content.overview ?? {};

  async function ask(value) {
    const text = (value ?? question).trim();
    if (!text || busy) return;
    setQuestion('');
    setMessages((list) => [...list, { role: 'user', text }]);
    setBusy(true);
    try {
      const result = await api(`/projects/${projectId}/assistant`, { method: 'POST', body: { question: text } });
      setMessages((list) => [
        ...list,
        { role: 'assistant', text: result.answer, citations: result.citations ?? [], insufficient: result.insufficient },
      ]);
    } catch (err) {
      setMessages((list) => [...list, { role: 'assistant', text: err.message, failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="workspace-banner">
        <div>
          <p className="eyebrow">Approved handover · version {data.version}</p>
          <h2>Continuing {content.meta?.project?.name ?? 'the project'}</h2>
          <p className="muted">
            {content.meta?.transitionUser?.name ?? 'The previous owner'} handed this over on{' '}
            {new Date(data.approvedAt).toLocaleDateString()}. Everything below comes from that approved snapshot.
          </p>
        </div>
        <div className="workspace-banner-meta">
          <Badge tone="success" dot>
            Approved
          </Badge>
          <span className="hint">
            Assistant: {summary?.assistant?.llmEnabled ? `Groq · ${summary.assistant.model}` : 'deterministic retrieval'}
          </span>
        </div>
      </section>

      <div className="stats">
        <StatCard label="Records behind this" value={overview.records ?? 0} hint={`${overview.sources?.length ?? 0} authorized sources`} />
        <StatCard label="Next actions" value={content.sections?.nextActions?.length ?? 0} hint="prioritized from gaps" tone="accent" />
        <StatCard label="Unfinished work" value={content.sections?.unfinishedWork?.length ?? 0} hint="open PRs and issues" tone="neutral" />
        <StatCard label="Known risks" value={content.sections?.risks?.length ?? 0} hint={`${content.gaps?.length ?? 0} recorded gaps`} tone="critical" />
      </div>

      <AcknowledgementCard
        projectId={projectId}
        data={data}
        onDone={async () => {
          await reload();
          await refresh();
        }}
      />

      <div className="doc-layout">
        <div className="doc-main">
          <DocumentSections content={content} />
          {content.gaps?.length > 0 && (
            <section className="doc-section">
              <header className="doc-head">
                <div>
                  <h2>Knowledge gaps</h2>
                  <p>Questions to ask before you change this system</p>
                </div>
                <span className="doc-count">{content.gaps.length}</span>
              </header>
              <GapList gaps={content.gaps} />
            </section>
          )}
        </div>

        <aside className="doc-side assistant-side">
          <div className="card assistant">
            <header className="assistant-head">
              <span className="assistant-mark">
                <Icon name="checkList" size={15} />
              </span>
              <div>
                <strong>Handover assistant</strong>
                <span className="hint">answers only from approved claims</span>
              </div>
            </header>

            <div className="messages" ref={scroller}>
              {messages.length === 0 && (
                <div className="msg assistant">
                  Ask about this project. I answer from the approved handover and show the evidence behind each answer —
                  if it is not covered, I will say so instead of guessing.
                </div>
              )}
              {messages.map((message, index) => (
                <div className={`msg ${message.role}${message.failed ? ' failed' : ''}`} key={index}>
                  <p>{message.text}</p>
                  {message.insufficient && <span className="msg-note">No supporting claim was found in the approved handover.</span>}
                  {message.citations?.length > 0 && (
                    <div className="cites">
                      {message.citations.map((citation, position) => (
                        <div className="cite" key={`${citation.claimId}-${position}`}>
                          <div className="cite-head">
                            <strong>{citation.evidence?.[0]?.sourceName ?? 'approved handover'}</strong>
                            <span className="mono">{citation.evidence?.[0]?.location ?? ''}</span>
                          </div>
                          <span>{citation.evidence?.[0]?.excerpt ?? citation.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="msg assistant typing">
                  <span className="spinner" /> Searching the approved handover…
                </div>
              )}
            </div>

            <form
              className="assistant-form"
              onSubmit={(event) => {
                event.preventDefault();
                ask();
              }}
            >
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What should I work on first?"
                aria-label="Ask the handover assistant"
              />
              <Btn variant="primary" type="submit" icon="send" disabled={busy || !question.trim()}>
                Ask
              </Btn>
            </form>

            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} className="suggestion" onClick={() => ask(suggestion)} disabled={busy}>
                  {suggestion}
                </button>
              ))}
            </div>

            <p className="hint">Answers never include restricted material; those claims are excluded from the snapshot.</p>
          </div>

          <div className="card side-facts">
            <span className="mini-label">Components</span>
            <div className="side-fact-list">
              {(overview.components ?? []).slice(0, 6).map((component) => {
                // Repository paths read as folder chain plus the part itself, so
                // the name that matters keeps its weight and the chain gives way.
                const cut = component.name.lastIndexOf('/');
                const split = cut > 0 && !component.name.includes(' ');
                return (
                  <div className="side-fact" key={component.name} title={component.name}>
                    <span className="side-fact-icon">
                      <Folder size={11} strokeWidth={1.9} />
                    </span>
                    <span className="side-fact-name">
                      {split && <span className="side-fact-parent">{component.name.slice(0, cut + 1)}</span>}
                      <span className="side-fact-leaf">{split ? component.name.slice(cut + 1) : component.name}</span>
                    </span>
                    <span className="side-fact-count">
                      {component.records ?? 0}
                      <i>rec</i>
                    </span>
                  </div>
                );
              })}
            </div>
            {(overview.components?.length ?? 0) > 6 && (
              <p className="side-facts-more">+{overview.components.length - 6} more in the knowledge graph</p>
            )}
            {!overview.components?.length && <p className="hint">No components recorded.</p>}
          </div>
        </aside>
      </div>

      {!content.sections?.nextActions?.length && (
        <Empty icon="checkList" title="No prioritized next actions">
          The approved handover did not include next actions. Ask the reviewer to confirm where work should resume.
        </Empty>
      )}
    </div>
  );
}
