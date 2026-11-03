# ContextBridge

**Never lose the knowledge behind the work.**

ContextBridge reconstructs the technical and operational context of a project from authorized
engineering records, links every important statement to the records that support it, flags what the
records cannot explain, and produces a handover that an authorized human must review and approve
before an incoming member can rely on it.

This is a working MVP of the WCC Forge brief *"Prevent Critical Knowledge From Leaving With People"*,
built from `ContextBridge.md`. It is not a mockup: the pipeline below runs end to end on live activity
from a real public GitHub repository.

---

## Why this exists

When the engineer who maintained the payment module for eighteen months leaves, the code stays but
the reasoning, the abandoned retry work, the ownership gaps and the two conflicting retention rules
leave with them. ContextBridge does five things about that:

| Stage | What happens |
| --- | --- |
| **Connect** | Imports authorized sources — live GitHub activity or uploaded documents — each with its own visibility |
| **Reconstruct** | Normalizes records and extracts decisions, completed and unfinished work, blockers, dependencies, risks, responsibilities and open questions |
| **Verify** | Attaches the supporting excerpts to every claim and reports evidence strength separately from human verification |
| **Review** | A reviewer verifies, corrects or rejects claims; approval freezes a version |
| **Handover** | An incoming member receives only the approved, permission-filtered document plus a grounded assistant |

The governing rule: **model confidence is never stored as organizational truth.** `evidence_strength`
is counted from records; `status` is set only by a human reviewer. Both are shown side by side, always.

---

## What is in the product

**Public site** (`#/`) — Home, Platform, Knowledge Graph, Activity Intelligence, Handover, Security and
Legal. A horizontal navbar, full-width sections and a footer on every public page.

**Signed-in workspace** (`#/workspaces`) — the hub listing every workspace you belong to. A workspace
can be created from a GitHub repository or set up manually, each card showing its approval state,
contributors, record counts and your role. The same page carries the **Role access** panel so you can
switch accounts and check exactly what each role can open.

Inside a workspace:

| Page | Purpose |
| --- | --- |
| Dashboard | Project state, review coverage, claims by category, gap severity, handover readiness |
| Sources | What the handover is allowed to know; connect GitHub or upload documents |
| Evidence | Every claim with its excerpts, strength and review actions |
| Risks & dependencies | Ownership gaps, unreviewed work, stale work, conflicts and open questions |
| Knowledge | Interactive graph of components, contributors, commits, PRs, decisions and evidence |
| Handover | The reviewable document, versioned, with approval |
| Incoming | The approved document, onboarding path and grounded assistant |
| Activity | Append-only audit timeline of imports, reviews, approvals and denied access |

---

## Quick start

Requires **Node.js 22.12+** (for the built-in `node:sqlite` driver) and npm.

```bash
npm install
npm run seed       # creates the workspace and imports a real GitHub repository
npm run build      # compiles the React client into dist/
npm start          # http://localhost:3000
```

For development, `npm run dev` starts the API on `:3000` and Vite on `:5173` with `/api` proxied and
hot reload. `npm start` serves the compiled bundle from `dist/`, so there is no second server in
production. `npm run seed:reset` wipes the database and imports again.

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server with proxy |
| `npm run build` | Production client bundle in `dist/` |
| `npm start` | Express serves the API and the built client |
| `npm run seed` | Import a live repository and run reconstruction |
| `npm run seed:reset` | Delete existing project data, then seed |
| `npm test` | End-to-end pipeline and Groq adapter tests |

### Live workspace data

There is no synthetic demo dataset. `npm run seed` imports a real project:

```bash
npm run seed                       # twentyhq/twenty by default
npm run seed -- novuhq/novu        # the second suggested repository
GITHUB_TOKEN=ghp_… npm run seed    # higher rate limit, and private repositories
```

Ingestion pulls the 60 most recent commits, 40 pull requests (changed files and review threads for the
ten most recently updated without a token) and 40 issues, then reconstructs claims, evidence and gaps.
Nothing is invented: if GitHub is unreachable, the source is marked `error`, a `source.error` audit entry
is recorded, and the command exits non-zero.

The same two repositories are one click away in **Sources → Connect GitHub**, and any other public
`owner/name` can be imported there. A workspace created from scratch starts empty and fills up as
sources are connected.

| Repository | Why it suits this product |
| --- | --- |
| [`twentyhq/twenty`](https://github.com/twentyhq/twenty) | Real product development, many contributors, issues and pull requests |
| [`novuhq/novu`](https://github.com/novuhq/novu) | Notification infrastructure with continuous PR and review activity |

---

## Deploy

ContextBridge is one long-lived Node process: Express serves `/api` and the built client from the same
origin, and SQLite keeps its state in a single file. That file must sit on a persistent volume —
serverless hosts with an ephemeral filesystem (Vercel functions, Netlify functions) lose every imported
record on the next invocation, so they are the wrong shape for this app.

A `Dockerfile` and a Render blueprint (`render.yaml`) are included. On Render choose **New → Blueprint**
and pick `ShashwaTTrigunayaT/ContextBridge`. Render builds the image, mounts a 1 GB disk at `/var/data`,
generates `INSTALL_PASSWORD` and prompts for the optional `GROQ_API_KEY` on first deploy.

| Setting | Value |
| --- | --- |
| `CONTEXTBRIDGE_DB` | `/var/data/contextbridge.db` — SQLite on the mounted disk |
| `EXPOSE_INSTALL_ACCOUNTS` | `false` — the sign-in page stops listing demo passwords |
| `INSTALL_PASSWORD` | generated by Render; it is the password for every install account |
| `GROQ_API_KEY` | optional; without it the assistant answers with no model call |

The blueprint pins `plan: starter` because Render's free plan has no disks. Changing it to `free`
drops the disk, and all workspace data then resets on every restart and redeploy.

To run the same image locally:

```bash
docker build -t contextbridge .
docker run -p 3000:3000 -v contextbridge-data:/app/data contextbridge
```

---

## Accounts and roles

Install accounts are workspace accounts created on first boot — they are not project data, and a role
grants nothing until the account is a member of a project. Password comes from `INSTALL_PASSWORD`
(default `contextbridge`).

| Account | Role |
| --- | --- |
| `admin@contextbridge.local` | Administrator — manages sources, sees restricted material |
| `departing@contextbridge.local` | Manager — the engineer handing the project over |
| `reviewer@contextbridge.local` | Reviewer — verifies claims, approves the handover |
| `incoming@contextbridge.local` | Incoming member — sees only the approved handover |
| `viewer@contextbridge.local` | Viewer — read-only, approved content only |

Sign-in is inside the product and asks for an email and password only; the role comes from the
account's membership, never from a picker. After signing in, **Workspaces → Role access** lists all five
accounts with a one-click **Switch**, so you can compare what a reviewer, an administrator and an
incoming member actually see. `/api/accounts` exposes the list (with passwords) unless
`EXPOSE_INSTALL_ACCOUNTS=false`.

## What to try

1. Sign in as **Reviewer** and open **Evidence**: a claim shows the exact excerpt, the record it came
   from and which source it belongs to. Strength is counted from records; verification is your call.
2. Open **Risks**: unassigned issues, PRs with no review, components only the departing engineer
   touched, unresolved questions and conflicting records.
3. **Verify** a decision, **Correct** a risk claim, then **Reject** a draft PR — a reason is required.
4. Open **Handover**, read the draft, then **Approve**. Restricted material is excluded from the shared
   copy and the version is frozen.
5. Switch to **Incoming member**: the draft is gone and only the approved version is visible. Ask
   *"What should I work on first?"* for a cited answer.
6. Switch to **Administrator** and open **Activity**: approvals, corrections, rejections and denied
   restricted-record access are all recorded.

---

## Architecture

```
frontend/                  React 19 client (Vite)
  index.html               HTML shell, Inter typeface
  src/App.jsx              routing: public site vs. signed-in workspace, role-gated pages
  src/store.jsx            session, workspace selection, summary state, hash routing
  src/ui.jsx               design system: icons, buttons, badges, avatars, modals, toasts
  src/pages/               product: Workspaces, Overview, Sources, Claims, Gaps, Knowledge,
                           Handover, Workspace, Activity
  src/pages/site/          public: Home, Platform, Knowledge Graph, Activity, Handover,
                           Security, Legal
  src/components/          horizontal navbars, footer, logo, knowledge graph, handover renderer,
                           live site previews, charts
  src/components/charts.jsx  bar, column and donut charts built only from API figures
  src/graph.js             knowledge graph derived from the project summary and stored claims
  src/styles.css           design tokens, layout, components, marketing sections
vite.config.js             builds frontend/ into dist/, proxies /api in dev
dist/                      production bundle served by Express (gitignored)
src/
  api.js                   Express routes, role checks, audit logging
  auth.js                  scrypt passwords, sessions, role permissions
  db.js                    SQLite schema (node:sqlite) and query helpers
  ingest.js                live GitHub and document import, normalization, chunking
  extract.js               claim extraction, state derivation, evidence linking, next actions
  gaps.js                  rule- and relationship-based gap and conflict detection
  handover.js              draft assembly, permission filtering, approval + version snapshot
  assistant.js             grounded retrieval over the approved snapshot
  llm.js                   optional Groq rephrasing (never adds facts)
  install.js               install accounts and organization bootstrap
  repos.js                 suggested public repositories
server.js                  starts the app
test/pipeline.test.js      end-to-end workflow tests
test/llm.test.js           Groq adapter tests (mocked transport)
```

The database is a local SQLite file at `data/contextbridge.db`, created on first boot. Override the
location with `CONTEXTBRIDGE_DB`.

---

## Design

The interface is a light, restrained engineering product, not a chat dashboard.

- **Surfaces** — `#F8FAFC` page background, white cards, `#E2E8F0` hairline borders, 6–10px radii.
  Deep teal (`#0F766E`) is the single accent; success, warning and critical are used only for status.
- **Navigation** — one horizontal navbar on every screen, sticky on scroll, with no sidebar at any
  width. Signed-in navigation is Workspaces, Dashboard, Activity, Knowledge, Evidence, Risks, Handover
  and Incoming; mobile collapses to a menu.
- **Type** — Inter for the interface, tabular figures for statistics and a monospace face for commit
  hashes, repository references and identifiers.
- **Charts** — bar, column and donut charts drawn from real API counts, with a teal headline and a
  pink-to-violet categorical series. Every bar carries its own label and value, so no chart needs a
  separate key; empty data renders an empty state instead of invented numbers.
- **Lists** — panel headers sit on a dark teal band, rows are separated by hairlines, metadata is
  muted, and long lists collapse behind "Show N more" instead of running off the page.
- **Icons** — `lucide-react` line icons throughout.
- **Footer** — a four-column footer on public pages and a compact workspace footer inside the app.

---

## Data model

`users`, `sessions`, `organizations`, `projects`, `memberships`, `sources`, `source_records`,
`chunks`, `entities`, `relationships`, `evidence`, `claims`, `gaps`, `handovers`,
`handover_versions`, `reviews`, `audit_logs`.

Nothing is stored as one generated document. The approved handover is a versioned snapshot, while
claims, evidence rows, gaps and reviews remain separately queryable.

### How claims get their evidence

1. **Sentence extraction** — pattern rules classify sentences as decisions, blockers, risks,
   dependencies, responsibilities, questions or unfinished work.
2. **State derivation** — open/merged PRs, open issues with or without assignees, and merged
   `feat`/`fix` commits become claims deterministically.
3. **Evidence linking** — each claim keeps its own source chunk, then retrieves up to three further
   excerpts by term overlap weighted with inverse document frequency (a lexical stand-in for
   embeddings).
4. **Strength** — `high` with two or more distinct sources and at least three excerpts, `medium` with
   independent corroboration, otherwise `low`.

### Gap detection

Deterministic checks over record state and relationships: unassigned open issues, open PRs without
review, drafts, stale work (over 45 days idle), unresolved questions, sole-maintainer components,
blockers pointing at still-open issues, conflicting durations for the same topic, conflicting
implementation strategies per component, weakly evidenced decisions, and components with no
documentation. Next actions come from the most severe gaps and carry the same evidence.

### Permissions

| Capability | Admin | Manager | Reviewer | Incoming member | Viewer |
| --- | --- | --- | --- | --- | --- |
| Manage sources / project | ✓ | ✓ | — | — | — |
| Run reconstruction | ✓ | ✓ | ✓ | — | — |
| Review / correct / reject claims | ✓ | ✓ | ✓ | — | — |
| Approve handover | ✓ | ✓ | ✓ | — | — |
| Read draft handover | ✓ | ✓ | ✓ | — | — |
| Read approved handover | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read restricted sources | ✓ | ✓ | — | — | — |

Enforcement happens in the API, not the UI. A reviewer who opens a restricted record gets `403` and an
`evidence.access_denied` audit entry. A reviewer cannot review a claim whose only evidence is
restricted. Approval **excludes every claim derived from a restricted source and never carries a
restricted excerpt, even as corroboration**, so restricted clauses are never paraphrased or quoted into
a shared document. Incoming members never receive a draft.

### Optional LLM

The assistant uses **Groq** through its OpenAI-compatible endpoint,
`https://api.groq.com/openai/v1/chat/completions`. `GROQ_MODEL` overrides the model; the default is
`openai/gpt-oss-20b`, and other production models such as `llama-3.3-70b-versatile` work too.

```bash
GROQ_API_KEY=gsk_… npm start
GROQ_API_KEY=gsk_… GROQ_MODEL=llama-3.1-8b-instant npm start
# or put GROQ_API_KEY=gsk_… in .env — npm start loads .env and .env.local automatically
```

The model only rephrases an already-grounded answer. If the key is missing, the call fails, times out
(15s) or returns `INSUFFICIENT_EVIDENCE`, the deterministic answer is used — claims, gaps and approvals
never depend on a model call. The adapter is covered by a mocked-transport test; no live key is
required to run the suite.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Enables optional answer rephrasing |
| `GROQ_MODEL` | Overrides the Groq model |
| `INSTALL_PASSWORD` | Password for the five install accounts |
| `EXPOSE_INSTALL_ACCOUNTS` | Set to `false` to hide install accounts and passwords from `/api/accounts` |
| `GITHUB_TOKEN` | Raises the GitHub rate limit and enables private repositories |
| `PORT` | API / app port (default `3000`) |
| `CONTEXTBRIDGE_DB` | SQLite file path (default `data/contextbridge.db`) |

---

## Deliberate deviations from the blueprint

The blueprint assumes a multi-service deployment. This build keeps the architecture and workflow but
narrows the runtime so the whole thing is demonstrable on one machine:

| Blueprint | Here | Why |
| --- | --- | --- |
| PostgreSQL + pgvector | SQLite (`node:sqlite`) + lexical retrieval | Same structured tables, no infrastructure. Embeddings are the natural upgrade, not a claim made here. |
| Redis + BullMQ | Synchronous ingestion and reconstruction | A few hundred records reconstruct in under a second; a queue would add failure modes without value at this size. |
| GitHub OAuth | Live public-repo import with an optional token | OAuth app registration is external. A token is passed per request and never stored. |
| Slack / Teams / Jira | Not built | The blueprint defers them to Round 3. |
| Graph visualization | SVG relationship graph + component and contributor views | Relationships matter more than decoration; every edge is inspectable. |

## Known limitations

- Workspace content reflects whichever repository was imported. Public marketing pages describe the
  product; their interface previews are built from the product's own components, and headline figures
  come from `/api/site-stats`, which reads the current workspace rather than a hard-coded number.
- Document upload supports `.md`, `.markdown` and `.txt`. PDF and DOCX are rejected rather than
  pretended to be parsed.
- Live import needs network access to `api.github.com`. Without `GITHUB_TOKEN` it is limited to 60
  requests an hour, so PR files and reviews are fetched for the ten most recent PRs.
- Extraction is heuristic and precision-oriented; expect recall misses on unusual phrasing. That is
  exactly why every claim is human-reviewable and gaps exist.
- Evidence strength is a transparent count of independent sources, not calibrated model confidence,
  and must not be read as a probability.
- There is no multi-tenant isolation, rate limiting, CSRF token or email verification; sessions are
  single-node SQLite rows. This is a hackathon MVP, not a production deployment.
- The assistant retrieves over approved claims only. It cannot answer questions whose answer exists in
  the sources but was never captured as a claim — and it says so.

## Tests

```bash
npm test
```

The suite seeds its own fixture (`test/fixtures.js`) into a temporary SQLite file under the OS temp
directory — never the workspace database, and the product ships no synthetic dataset — and asserts:

- every extracted claim has at least one evidence excerpt, including corroborated claims;
- gaps include ownership, dependency, review-state and conflict findings;
- restricted records are denied to reviewers and visible to administrators;
- incoming members cannot read the draft, browse claims or approve;
- verify/correct/reject work, and rejections require a reason;
- approval freezes a version, excludes rejected and restricted-derived claims, and blocks
  re-reconstruction;
- the incoming member's snapshot contains no restricted evidence or clause text;
- the assistant answers grounded questions and refuses unsupported ones;
- the audit log records approvals, rejections and denied access.

The Groq adapter is covered separately with a mocked transport, so no API key or network is required.

## API summary

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness probe |
| `GET /api/site-stats` | Live figures used by the public home page |
| `POST /api/login`, `POST /api/logout`, `GET /api/me` | Session auth and membership list |
| `GET /api/accounts` | Install accounts for this deployment |
| `GET/POST /api/projects` | List / create workspaces |
| `GET /api/projects/:id` | Summary, counts, sources, components, members |
| `GET /api/projects/:id/sources` | Authorized sources and their state |
| `POST /api/projects/:id/sources/github` | Import a live GitHub repository |
| `POST /api/projects/:id/sources/documents` | Upload a document with visibility |
| `DELETE /api/projects/:id/sources/:sourceId` | Disconnect and remove a source |
| `POST /api/projects/:id/reconstruct` | Rebuild claims, evidence, gaps and next actions |
| `GET /api/projects/:id/claims` | Claims with filtered evidence |
| `GET /api/projects/:id/claims/:claimId` | One claim with its evidence |
| `POST /api/projects/:id/claims/:claimId/review` | `verify` / `reject` / `edit` |
| `GET /api/projects/:id/gaps` | Detected gaps and risks |
| `GET /api/projects/:id/relationships` | Graph edges for the knowledge explorer |
| `GET /api/projects/:id/handover` | Draft (privileged) or approved snapshot |
| `POST /api/projects/:id/handover/approve` | Freeze and release a version |
| `GET /api/projects/:id/handover/versions` | Approval history |
| `GET /api/projects/:id/records/:recordId` | Inspect a source record (permission-checked) |
| `POST /api/projects/:id/assistant` | Ask a question grounded in the approved handover |
| `GET /api/projects/:id/audit` | Audit trail (administrators and reviewers) |

## Roadmap

1. **Second connector** — Jira or Slack ingestion to prove multi-source reconstruction beyond GitHub.
2. **Retrieval quality** — embeddings + pgvector, with precision and recall measured on a labelled
   claim set.
3. **Role-aware views** — manager and tech-lead views of the same approved snapshot under the same
   source-level enforcement.
4. Then: departure detection, continuous knowledge monitoring and knowledge-concentration risk scoring
   across projects.
