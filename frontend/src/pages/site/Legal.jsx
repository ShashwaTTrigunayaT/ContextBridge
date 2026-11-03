import { PageHero } from '../../components/site/blocks.jsx';

export default function Legal() {
  return (
    <div className="site-page">
      <PageHero
        eyebrow="Company"
        title="About this build"
        lead="ContextBridge is a working demonstration of evidence-backed project handovers, built for the WCC Forge hackathon from the ContextBridge blueprint. It runs on a live public GitHub repository."
        size="sm"
      />

      <section className="section">
        <div className="wrap prose">
          <article className="prose-block" id="about">
            <h2>About</h2>
            <p>
              The product exists to answer one question: when the person who understands a system leaves, what can the
              next engineer actually rely on? ContextBridge reconstructs project state from authorized records, keeps
              every statement tied to the excerpt that supports it, and requires a human reviewer to approve what is
              shared.
            </p>
            <p>
              The workspace is populated by importing a real, public GitHub repository — Two popular picks are{' '}
              <span className="mono">twentyhq/twenty</span> and <span className="mono">novuhq/novu</span>, and any other
              public <span className="mono">owner/name</span> works too. Nothing in the workspace is fabricated: if GitHub
              cannot be reached, the source is marked as failed rather than filled with invented activity.
            </p>
            <p>
              The people who appear — authors, reviewers and assignees — are the real GitHub accounts behind the imported
              commits, pull requests and issues. The marketing pages use illustrative figures for layout and label them as
              such.
            </p>
            <p>
              Implementation choices are documented in the repository README, including what was deliberately left out:
              no relational database server, no vector search, no queue, and no PDF or DOCX parsing. Those omissions are
              stated in the interface rather than hidden.
            </p>
          </article>

          <article className="prose-block" id="privacy">
            <h2>Privacy Policy</h2>
            <p>
              This demonstration stores only the data you create inside it: projects, imported records,
              extracted claims, review actions and audit entries. All of it lives in a local SQLite file inside the
              project directory and none of it is transmitted to a third party by the application itself.
            </p>
            <p>
              Two exceptions are worth naming. If you configure an optional model provider, the question you ask in the
              incoming workspace and the already-approved claim bullets needed to answer it are sent to that provider. If
              you import a live GitHub repository, your token is used for that single request and is never written to
              disk. Uploaded document text and extracted excerpts stay local.
            </p>
            <p>
              You can delete all stored data at any time by removing the SQLite file and re-seeding, or by running the
              reset script documented in the README.
            </p>
          </article>

          <article className="prose-block" id="terms">
            <h2>Terms of Service</h2>
            <p>
              This build is provided as-is for evaluation. It has no uptime commitment, no support agreement and no
              warranty of fitness for production use. Do not import confidential material into it: the demo is designed
              around public repository records, and the restricted-source model is a demonstration of enforcement rather
              than a certified data-handling control.
            </p>
            <p>
              Any numbers shown on the marketing pages are reproduced from an imported repository for illustration. They
              are not benchmarks, customer results or performance claims.
            </p>
          </article>

          <article className="prose-block" id="contact">
            <h2>Contact</h2>
            <p>
              This demonstration has no support inbox. The authoritative documentation for running it, including the
              seeding script, environment variables and test suite, is the README in the project repository. For questions
              about the design decisions behind the product, the blueprint document that scoped the build is included in
              the same repository.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
