import { ArrowRight, ClipboardCheck, FileCheck2, KeyRound, LockKeyhole, ScrollText, ShieldCheck } from 'lucide-react';
import { useApp } from '../../store.jsx';
import { CtaBand, Feature, PageHero } from '../../components/site/blocks.jsx';
import PageTabs from '../../components/site/PageTabs.jsx';

const ROLES = ['Administrator', 'Reviewer', 'Incoming member', 'Viewer'];

const MATRIX = [
  ['Read approved handover', true, true, true, true],
  ['Read draft claims and gaps', true, true, false, false],
  ['Connect or remove sources', true, false, false, false],
  ['Read restricted source content', true, false, false, false],
  ['Verify, correct or reject claims', true, true, false, false],
  ['Rebuild the reconstruction', true, false, false, false],
  ['Approve a handover version', true, true, false, false],
  ['Read the audit log', true, false, false, false],
];

const AUDITED = [
  'Source imports and disconnections',
  'Claim verification, correction and rejection',
  'Reconstruction runs and approval of a version',
  'Denied access to restricted records and draft content',
];

export default function SecurityPage() {
  const { go, user } = useApp();

  return (
    <div className="site-page">
      <PageHero
        eyebrow="Security"
        title="Permissions enforced before the interface renders"
        lead="Restricted material is filtered in the API, not hidden with CSS. A role that may not read a record receives a 403 and the attempt is written to the audit log."
        actions={
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(user ? 'workspaces' : 'sign-in')}>
            Try the roles in the demo
            <ArrowRight size={15} strokeWidth={1.9} />
          </button>
        }
      />

      <PageTabs
        label="Security sections"
        tabs={[
          {
            id: 'access',
            label: 'Roles & access',
            meta: '8 rules',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Access control</p>
                      <h2>Five roles, deliberately narrow</h2>
                      <p className="section-lead">
                        Each role exists because it has a different relationship to the knowledge being handed over.
                      </p>
                    </div>
                  </div>
                  <div className="matrix-wrap">
                    <table className="matrix">
                      <thead>
                        <tr>
                          <th>Capability</th>
                          {ROLES.map((role) => (
                            <th key={role}>{role}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MATRIX.map(([capability, ...allowed]) => (
                          <tr key={capability}>
                            <td>{capability}</td>
                            {allowed.map((value, index) => (
                              <td key={ROLES[index]} className={value ? 'matrix-yes' : 'matrix-no'}>
                                {value ? 'Allowed' : 'Denied'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint matrix-note">
                    Role names follow the demo build. A departing member can read the handover they are part of but
                    cannot approve it, and an incoming member never sees drafts.
                  </p>
                </div>
              </section>
            ),
          },
          {
            id: 'guarantees',
            label: 'Guarantees',
            meta: '4',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">What the system will not do</p>
                      <h2>Four guarantees</h2>
                      <p className="section-lead">Most of the security value is in the refusals.</p>
                    </div>
                  </div>
                  <div className="feature-grid feature-grid-2">
                    <Feature glyph={LockKeyhole} title="Permission-aware architecture">
                      Every project route resolves the caller's role before reading data. Claims, gaps, sources and
                      records are filtered in the API, so an optimistic client cannot widen its own access.
                    </Feature>
                    <Feature glyph={FileCheck2} title="Evidence provenance">
                      Excerpts are stored when a claim is created, not fetched later. A shared handover can therefore
                      never re-read a restricted source at render time.
                    </Feature>
                    <Feature glyph={ClipboardCheck} title="Human approval">
                      Nothing reaches an incoming member without an approving reviewer, a stored note and a frozen
                      version that records what was unverified or excluded.
                    </Feature>
                    <Feature glyph={KeyRound} title="Data privacy">
                      The demo imports public repository data. A GitHub token is used for one import request and never
                      stored. Upload formats that cannot be parsed are rejected rather than guessed at.
                    </Feature>
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'audit',
            label: 'Audit',
            node: (
              <section className="section">
                <div className="wrap split">
                  <div className="split-copy">
                    <p className="eyebrow">Auditability</p>
                    <h2>Every decision has a name and a timestamp</h2>
                    <p className="section-lead">
                      The activity log is append-only and written server-side. A denied request is as much a part of the
                      record as an approval, which is what makes the log usable during an incident review.
                    </p>
                    <ul className="check-list">
                      {AUDITED.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="split-media">
                    <div className="audit-preview">
                      <div className="audit-preview-head">
                        <ScrollText size={15} strokeWidth={1.8} />
                        <span>Activity log</span>
                        <span className="badge badge-neutral">append-only</span>
                      </div>
                      <div className="audit-row">
                        <span className="audit-when mono">09:41</span>
                        <span className="audit-detail">Mei Lin requested a restricted record</span>
                        <span className="badge badge-critical">denied</span>
                      </div>
                      <div className="audit-row">
                        <span className="audit-when mono">09:32</span>
                        <span className="audit-detail">Daniel Okafor approved handover v1</span>
                        <span className="badge badge-success">approved</span>
                      </div>
                      <div className="audit-row">
                        <span className="audit-when mono">08:55</span>
                        <span className="audit-detail">Workspace Admin imported twentyhq/twenty activity</span>
                        <span className="badge badge-neutral">import</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: 'boundaries',
            label: 'Boundaries',
            meta: '3',
            node: (
              <section className="section">
                <div className="wrap">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Threat boundaries</p>
                      <h2>Where this build stops, on purpose</h2>
                      <p className="section-lead">
                        A demo that pretends to be production-grade is a liability. These boundaries are stated in the
                        product and in the API.
                      </p>
                    </div>
                  </div>
                  <div className="boundary-list">
                    <div className="boundary">
                      <ShieldCheck size={16} strokeWidth={1.8} />
                      <span>
                        <strong>No model in the trust path.</strong> Claims, gaps, permissions and approvals are
                        deterministic. A model may rephrase an already-grounded answer and is discarded on failure.
                      </span>
                    </div>
                    <div className="boundary">
                      <ShieldCheck size={16} strokeWidth={1.8} />
                      <span>
                        <strong>No silent redaction.</strong> Excluded claims are counted and reported at approval time,
                        not quietly dropped from the copy.
                      </span>
                    </div>
                    <div className="boundary">
                      <ShieldCheck size={16} strokeWidth={1.8} />
                      <span>
                        <strong>No PDF or DOCX parsing.</strong> Unsupported formats are rejected with a clear error
                        instead of a plausible-looking extraction.
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <CtaBand
        title="Check the permissions yourself"
        lead="Sign in as Mei, an incoming member, and try to open a draft: the API refuses and the audit log records it."
        secondary={{ label: 'Read the platform overview', route: 'platform' }}
      />
    </div>
  );
}
