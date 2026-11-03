import { useState } from 'react';
import { BadgeCheck, FileCheck2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Badge, Btn, Field } from '../ui.jsx';

// The final handover step. Shown to an incoming member (and any non-departing
// member with access to the approved version) until they have recorded receipt.
export default function AcknowledgementCard({ projectId, data, onDone }) {
  const { notify, user } = useApp();
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const mine = data.acknowledgement;
  const others = (data.acknowledgements ?? []).filter((entry) => entry.userId !== user?.id);

  if (mine) {
    return (
      <section className="ack-card ack-done">
        <span className="ack-icon">
          <BadgeCheck size={19} strokeWidth={1.9} />
        </span>
        <div className="ack-body">
          <p className="eyebrow">Received</p>
          <h3>Handover acknowledged</h3>
          <p className="muted small">
            You confirmed version {mine.version} on {new Date(mine.acknowledgedAt).toLocaleString()}.
            {mine.note ? ` Your note: “${mine.note}”.` : ''}
          </p>
          {mine.questions?.length > 0 && (
            <p className="hint">Open question: {mine.questions.join(' · ')}</p>
          )}
          {others.length > 0 && (
            <p className="hint">
              Also acknowledged: {others.map((entry) => entry.userName ?? 'member').join(', ')}.
            </p>
          )}
        </div>
      </section>
    );
  }

  if (!data.canAcknowledge) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api(`/projects/${projectId}/handover/acknowledge`, {
        method: 'POST',
        body: {
          note: note.trim() || null,
          questions: question.trim() ? [question.trim()] : [],
        },
      });
      notify('Handover acknowledged. Your note and question are recorded for the departing member.', 'success');
      setNote('');
      setQuestion('');
      setConfirmed(false);
      await onDone?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ack-card">
      <header className="ack-head">
        <span className="ack-icon">
          <FileCheck2 size={19} strokeWidth={1.9} />
        </span>
        <div className="ack-body">
          <p className="eyebrow">Final step</p>
          <h3>Acknowledge this handover</h3>
          <p className="muted small">
            Confirm you have read version {data.version}. Anything you leave here is visible to the departing member
            and written to the audit log.
          </p>
        </div>
        <Badge tone="warning" dot>
          Awaiting you
        </Badge>
      </header>

      <form className="ack-form" onSubmit={submit}>
        <div className="ack-fields">
          <Field label="Note to the departing member (optional)">
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="I have the queue migration context I need."
            />
          </Field>
          <Field label="One question you still need answered (optional)">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Who signs off the vendor escalation rota?"
            />
          </Field>
        </div>

        <label className="ack-confirm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I have read this handover and know where the unfinished work stands.</span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="ack-actions">
          <Btn variant="primary" type="submit" icon="check" disabled={!confirmed || busy}>
            {busy ? 'Recording…' : 'Acknowledge handover'}
          </Btn>
          <span className="hint">Acknowledging does not approve or change the handover.</span>
        </div>
      </form>
    </section>
  );
}
