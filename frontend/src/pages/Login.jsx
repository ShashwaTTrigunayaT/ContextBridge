import { useState } from 'react';
import { FileCheck2, Lock, ShieldCheck } from 'lucide-react';
import { useApp } from '../store.jsx';
import { Btn, Field, Icon } from '../ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

export default function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-simple">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-simple-brand">
          <span className="brand-mark">
            <LogoMark size={15} />
          </span>
        </div>

        <header className="login-simple-head">
          <p className="eyebrow">Workspace access</p>
          <h1>Sign in</h1>
          <p className="muted small">Use your workspace account to open your handovers.</p>
        </header>

        <div className="form">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="you@company.com"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="form-error">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <Icon name="arrow" size={15} />}
          </Btn>
        </div>

        <ul className="login-simple-points">
          <li>
            <ShieldCheck size={14} strokeWidth={1.8} />
            <span>
              <strong>Permissions enforced in the API.</strong> A role that may not read a record gets a 403, not a
              hidden button.
            </span>
          </li>
          <li>
            <FileCheck2 size={14} strokeWidth={1.8} />
            <span>
              <strong>Handovers freeze on approval.</strong> Later edits cannot silently rewrite a version someone
              already relied on.
            </span>
          </li>
          <li>
            <Lock size={14} strokeWidth={1.8} />
            <span>
              <strong>Restricted sources stay server-side.</strong> Restricted material is filtered before any response
              is built.
            </span>
          </li>
        </ul>

        <p className="login-simple-foot">
          You choose a workspace after signing in. If you do not have an account, ask a workspace administrator to
          invite you.
        </p>
      </form>
    </div>
  );
}
