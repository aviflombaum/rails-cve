import { raw } from "hono/html";
import { getContext } from "hono/context-storage";
import type { Child } from "hono/jsx";
import type { Advisory } from "./advisories";
import type { Endpoint } from "./delivery";
function SourceLink() {
  return (
    <a
      class="source-link"
      href="https://github.com/aviflombaum/rails-cve"
      target="_blank"
      rel="noopener noreferrer">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false">
        <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.769-.244.769-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.79-1.508-3.79-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.023-.7.078-.686.078-.686 1.13.08 1.725 1.16 1.725 1.16 1.005 1.723 2.637 1.225 3.28.937.102-.728.394-1.225.715-1.507-2.5-.284-5.13-1.25-5.13-5.565 0-1.23.44-2.233 1.16-3.02-.117-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.153A10.8 10.8 0 0 1 12 6.18c.957.004 1.922.13 2.823.38 2.147-1.456 3.09-1.153 3.09-1.153.615 1.55.23 2.695.113 2.98.722.787 1.157 1.79 1.157 3.02 0 4.326-2.634 5.278-5.143 5.557.405.35.767 1.042.767 2.1 0 1.516-.014 2.74-.014 3.112 0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
      </svg>
      View Source
    </a>
  );
}
export function Layout({
  title,
  children,
  active = "",
  path = "/",
  description = "Rails security advisories, delivered to your codebase. Signed webhooks and evidence-first investigation briefs for your coding agent.",
}: {
  title: string;
  children: Child;
  active?: string;
  path?: string;
  description?: string;
}) {
  const siteUrl = getContext<{ Bindings: Env }>().env.APP_URL.replace(/\/$/, "");
  const canonical = `${siteUrl}${path}`;
  const socialImage = `${siteUrl}/og/rails-cve-v1.jpg`;
  const imageAlt =
    "Rails CVE: Security updates. Right on track. Red railway tracks curve into a signal on warm ivory paper.";
  const links = (
    <>
      <a
        href="/advisories"
        aria-current={active === "advisories" ? "page" : undefined}>
        Advisories
      </a>
      <a
        href="/docs"
        aria-current={active === "docs" ? "page" : undefined}>
        Docs
      </a>
      <a
        href="/dashboard"
        aria-current={active === "dashboard" ? "page" : undefined}>
        Your connections <span aria-hidden="true">↗</span>
      </a>
      <SourceLink />
    </>
  );
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
          <title>{title} · Rails CVE</title>
          <meta
            name="description"
            content={description}
          />
          <link
            rel="canonical"
            href={canonical}
          />
          <meta
            property="og:type"
            content="website"
          />
          <meta
            property="og:site_name"
            content="Rails CVE"
          />
          <meta
            property="og:locale"
            content="en_US"
          />
          <meta
            property="og:title"
            content={`${title} · Rails CVE`}
          />
          <meta
            property="og:description"
            content={description}
          />
          <meta
            property="og:url"
            content={canonical}
          />
          <meta
            property="og:image"
            content={socialImage}
          />
          <meta
            property="og:image:secure_url"
            content={socialImage}
          />
          <meta
            property="og:image:type"
            content="image/jpeg"
          />
          <meta
            property="og:image:width"
            content="1200"
          />
          <meta
            property="og:image:height"
            content="630"
          />
          <meta
            property="og:image:alt"
            content={imageAlt}
          />
          <meta
            name="twitter:card"
            content="summary_large_image"
          />
          <meta
            name="twitter:title"
            content={`${title} · Rails CVE`}
          />
          <meta
            name="twitter:description"
            content={description}
          />
          <meta
            name="twitter:image"
            content={socialImage}
          />
          <meta
            name="twitter:image:alt"
            content={imageAlt}
          />
          <link
            rel="stylesheet"
            href="/style.css"
          />
          <link
            rel="icon"
            href="/favicon.svg"
            type="image/svg+xml"
          />
          <script
            src="/app.js"
            defer
          />
        </head>
        <body>
          <a
            class="skip"
            href="#main">
            Skip to content
          </a>
          <header>
            <div class="container header">
              <a
                class="brand"
                href="/"
                aria-label="Rails CVE homepage">
                rails<span class="brand-divider">/</span>cve<span class="brand-dot">.</span>
              </a>
              <nav aria-label="Main navigation">{links}</nav>
              <details class="mobile-nav">
                <summary>Menu</summary>
                <nav aria-label="Mobile navigation">{links}</nav>
              </details>
            </div>
          </header>
          <main id="main">{children}</main>
          <footer>
            <div class="container footer">
              <div>
                <a
                  class="brand small"
                  href="/">
                  rails / cve.
                </a>
                <p>
                  An independent project for the Rails community.
                  <br />
                  Not affiliated with the Rails core team.
                </p>
              </div>
              <div>
                <a href="https://github.com/rails/rails/security/advisories">
                  Rails security advisories ↗
                </a>
                <a href="/docs">Get started</a>
                <a href="/docs/webhooks">Webhook contract</a>
                <a href="/api/advisories">JSON feed</a>
                <SourceLink />
                <a href="/docs/self-host">Deploy your own →</a>
              </div>
              <p>
                Built by <a href="https://avi.nyc">Avi Flombaum</a>.<br />
                Small signals. Safer applications.
              </p>
            </div>
          </footer>
        </body>
      </html>
    </>
  );
}
export function Badge({ severity }: { severity: string }) {
  return <span class={`badge ${severity}`}>{severity}</span>;
}
export function date(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function AdvisoryRow({ a }: { a: Advisory }) {
  return (
    <a
      class="advisory-row"
      href={`/advisories/${a.id}`}>
      <div class="row-meta">
        <Badge severity={a.severity} />
        <p class="mono">{a.cve || a.id}</p>
      </div>
      <div class="row-title">
        <h3>{a.title}</h3>
        <p>
          {[...new Set(a.packages.map((p) => p.name))].join(" · ")}
          {a.withdrawn_at ? " · Withdrawn" : ""}
        </p>
      </div>
      <div class="row-date">
        <time datetime={a.published_at}>{date(a.published_at)}</time>
        <span aria-hidden="true">↗</span>
      </div>
    </a>
  );
}
export function Home({
  advisories,
  lastSync,
}: {
  advisories: Advisory[];
  lastSync: string | null;
}) {
  return (
    <Layout title="From advisory to action">
      <section class="hero">
        <div class="container hero-grid">
          <div>
            <p class="eyebrow">
              <span class="signal-dot" /> THE RAILS SECURITY RELAY
            </p>
            <h1>
              Security updates.
              <br />
              <em>Right on track.</em>
            </h1>
            <p class="lead">
              Rails advisories, delivered to your codebase by email or signed webhook, with a clear
              starting point for your coding agent.
            </p>
            <div class="actions">
              <a
                class="button primary"
                href="/connect">
                Connect your application <span aria-hidden="true">↗</span>
              </a>
              <a
                class="text-link"
                href="/docs/webhooks#example-payload">
                See an example payload <span aria-hidden="true">→</span>
              </a>
            </div>
            <p class="hero-note">Opt in. Stay informed. Keep humans in the loop.</p>
          </div>
          <div class="signal-card">
            <div class="signal-header">
              <span class="mono">ADVISORY → APPLICATION</span>
              <span class="signal-dot" />
            </div>
            <div class="flow-source">
              <div class="flow-number">01</div>
              <div>
                <p class="mono">THE SOURCE</p>
                <h3>Rails publishes an advisory</h3>
                <p>Canonical details. Exact affected versions.</p>
              </div>
            </div>
            <div class="flow-line" />
            <div class="flow-source">
              <div class="flow-number">02</div>
              <div>
                <p class="mono">THE SIGNAL</p>
                <h3>Your app hears about it</h3>
                <p>By email or signed webhook. Retried until it lands.</p>
              </div>
            </div>
            <div class="flow-line" />
            <div class="flow-source">
              <div class="flow-number red">03</div>
              <div>
                <p class="mono">THE NEXT STEP</p>
                <h3>Your agent investigates</h3>
                <p>Repository evidence. A fix for you to review.</p>
              </div>
            </div>
            <div class="terminal">
              <span>$</span> investigate → review → patch
              <span
                class="cursor"
                aria-hidden="true">
                _
              </span>
            </div>
          </div>
        </div>
      </section>
      <section class="source-strip">
        <div class="container">
          <p>From the Rails maintainers</p>
          <span>Email or signed webhook</span>
          <span>Agent-ready investigation briefs</span>
          <span>No repository access required</span>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <div class="section-heading">
            <div>
              <p class="eyebrow">THE LATEST SIGNALS</p>
              <h2>Know what needs attention.</h2>
            </div>
            <a
              class="text-link"
              href="/advisories">
              All advisories <span aria-hidden="true">→</span>
            </a>
          </div>
          <div class="advisory-list">
            {advisories.length ? (
              advisories.slice(0, 3).map((a) => <AdvisoryRow a={a} />)
            ) : (
              <p class="empty">The first advisory sync is on its way. Check back shortly.</p>
            )}
          </div>
          <p class="source-note">
            Source: rails/rails on GitHub.{" "}
            {lastSync
              ? `Last checked ${date(lastSync)} at ${new Date(lastSync).toISOString().slice(11, 16)} UTC.`
              : "Waiting for first sync."}{" "}
            Checked every five minutes.
          </p>
        </div>
      </section>
      <section class="section bottom-section">
        <div class="container bottom-grid">
          <div>
            <p class="eyebrow">LESS INBOX. MORE CONTEXT.</p>
            <h2>
              A useful first step,
              <br />
              already written.
            </h2>
          </div>
          <div>
            <p class="body-large">
              Every advisory comes with a focused investigation brief. Give it to your agent to
              check your dependencies, trace affected code, and propose the next step.
            </p>
            <p>
              Your code stays with you. Your agent works in your environment. You decide what gets
              changed.
            </p>
            <a
              class="text-link"
              href={advisories[0] ? `/advisories/${advisories[0].id}` : "/advisories"}>
              Explore an investigation brief →
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
export function AdvisoryIndex({
  advisories,
  q,
  severity,
}: {
  advisories: Advisory[];
  q: string;
  severity: string;
}) {
  return (
    <Layout
      title="Advisories"
      path="/advisories"
      active="advisories">
      <section class="section">
        <div class="container">
          <p class="eyebrow">THE ADVISORY INDEX</p>
          <h1 class="page-title">Rails security, in the open.</h1>
          <p class="lead">
            Published advisories from the Rails maintainers, with a starting point for every
            investigation.
          </p>
          <form
            class="filters"
            method="get">
            <div>
              <label for="q">Search advisories</label>
              <input
                id="q"
                name="q"
                type="search"
                value={q}
                placeholder="CVE, package, or keyword"
              />
            </div>
            <div>
              <label for="severity">Severity</label>
              <select
                name="severity"
                id="severity">
                {["all", "critical", "high", "moderate", "low", "unknown"].map((s) => (
                  <option
                    value={s}
                    selected={severity === s}>
                    {s === "all" ? "All severities" : s}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              class="button secondary">
              Filter
            </button>
          </form>
          <p class="source-note">
            {advisories.length} {advisories.length === 1 ? "advisory" : "advisories"}
          </p>
          <div class="advisory-list">
            {advisories.map((a) => (
              <AdvisoryRow a={a} />
            ))}
            {!advisories.length && (
              <p class="empty">
                No advisories match these filters. Try a different keyword or severity.
              </p>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
export function Detail({ a, prompt }: { a: Advisory; prompt: string }) {
  return (
    <Layout
      title={a.cve || a.id}
      path={`/advisories/${a.id}`}
      description={`${a.title}. Review affected versions and get an agent-ready investigation brief.`}
      active="advisories">
      <section class="section">
        <div class="container">
          <a
            class="back"
            href="/advisories">
            ← All advisories
          </a>
          <div class="detail-meta">
            <Badge severity={a.severity} />
            <span class="mono">{a.cve || a.id}</span>
            <span>Published {date(a.published_at)}</span>
          </div>
          <h1 class="detail-title">{a.title}</h1>
          {a.withdrawn_at && (
            <p class="notice">
              This advisory has been withdrawn. Read the canonical source before acting.
            </p>
          )}
          <div class="detail-grid">
            <article>
              <h2>Affected packages</h2>
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Affected versions</th>
                      <th>Patched versions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.packages.map((p) => (
                      <tr>
                        <td>
                          <code>{p.name}</code>
                        </td>
                        <td>
                          <code>{p.affected}</code>
                        </td>
                        <td>
                          <code>{p.patched || "See advisory"}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2>From the maintainers</h2>
              <p>
                Read the complete impact, prerequisites, and mitigation guidance in the canonical
                advisory.
              </p>
              <a
                class="text-link"
                href={a.url}>
                Read the Rails advisory ↗
              </a>
              <details class="upstream">
                <summary>Read upstream advisory text</summary>
                <pre class="advisory-prose">{a.description}</pre>
              </details>
              <p class="source-note">
                Updated {date(a.updated_at)} · {a.id}
              </p>
            </article>
            <aside class="brief">
              <p class="eyebrow">YOUR NEXT STEP</p>
              <h2>Start an investigation.</h2>
              <p>Give your agent the brief below from inside your application’s repository.</p>
              <button
                type="button"
                class="button primary"
                data-copy="investigation">
                Copy investigation brief
              </button>
              <a
                class="text-link"
                href={`/advisories/${a.id}/SKILL.md`}
                download="SKILL.md">
                Download SKILL.md ↓
              </a>
              <p class="source-note">
                Read-only by default. Asks for evidence and your approval before making changes.
              </p>
              {a.cve === "CVE-2026-66066" && (
                <div class="toolkit">
                  <h3>Official Rails forensic toolkit</h3>
                  <p>
                    Additional skills to assess vulnerability and investigate possible exploitation.
                  </p>
                  <a href="https://github.com/rails/rails-forensics-CVE-2026-66066">
                    Explore the toolkit ↗
                  </a>
                </div>
              )}
            </aside>
          </div>
          <details class="prompt-details">
            <summary>Preview the investigation brief</summary>
            <pre id="investigation">{prompt}</pre>
          </details>
          <p
            role="status"
            id="copy-status"
          />
        </div>
      </section>
    </Layout>
  );
}
export function Connect({
  restore = false,
  error,
  github = false,
}: {
  restore?: boolean;
  error?: string;
  github?: boolean;
}) {
  return (
    <Layout
      title={restore ? "Restore access" : "Connect your application"}
      path={restore ? "/login" : "/connect"}
      active="dashboard">
      <section class="section">
        <div class="container connect-grid">
          <div>
            <p class="eyebrow">A SMALL CONNECTION. A USEFUL SIGNAL.</p>
            <h1 class="page-title">
              Give your app
              <br />a heads-up.
            </h1>
            <p class="lead">
              Create a private workspace, choose webhook or email delivery, and let the next Rails
              advisory come to you.
            </p>
            <ol class="steps">
              <li>
                <strong>Create your workspace</strong>
                <p>Use GitHub when available, or save a private management token.</p>
              </li>
              <li>
                <strong>Choose your destinations</strong>
                <p>Verify your webhook or notification address for each app.</p>
              </li>
              <li>
                <strong>Receive the next advisory</strong>
                <p>Structured details and an investigation brief, signed for your application.</p>
              </li>
            </ol>
          </div>
          <div class="form-panel">
            <h2>{restore ? "Welcome back." : "Make the connection."}</h2>
            {error && (
              <p
                class="notice"
                role="alert">
                {error}
              </p>
            )}
            {github && (
              <form
                method="post"
                action="/auth/github">
                <button class="button primary">Continue with GitHub →</button>
                <p class="source-note">
                  Sign in or create an account. No repository installation required.
                </p>
              </form>
            )}
            {restore ? (
              <form
                method="post"
                action="/session">
                <label for="token">Management token</label>
                <input
                  id="token"
                  name="token"
                  type="password"
                  required
                  autocomplete="off"
                  placeholder="rcve_…"
                />
                <button
                  class="button primary"
                  type="submit">
                  Restore workspace →
                </button>
                <a href="/connect">Create a new workspace</a>
              </form>
            ) : (
              <form
                method="post"
                action="/accounts">
                <p>
                  Your workspace uses a private token instead of a password. You’ll see it once, so
                  save it in your password manager.
                </p>
                <button
                  class="button primary"
                  type="submit">
                  Create your workspace →
                </button>
                <a href="/login">Already connected? Restore access</a>
              </form>
            )}
            <p class="source-note">
              This service doesn’t access your repositories or make changes to your applications.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
export function SecretPage({
  title,
  secret,
  label,
  endpoint,
}: {
  title: string;
  secret: string;
  label: string;
  endpoint?: Endpoint;
}) {
  return (
    <Layout title={title}>
      <section class="section">
        <div class="container">
          <p class="eyebrow">SAVE THIS BEFORE CONTINUING</p>
          <h1 class="page-title">{title}</h1>
          <p class="lead">
            {endpoint
              ? "Use this signing secret to verify deliveries. It is shown only once."
              : "Keep this token in your password manager. Use it to restore access on another browser, or link GitHub from settings."}
          </p>
          <div class="secret-panel">
            <label for="saved-secret">{label}</label>
            <textarea
              id="saved-secret"
              readonly
              rows={3}>
              {secret}
            </textarea>
            <button
              type="button"
              class="button secondary"
              data-copy="saved-secret">
              Copy {label.toLowerCase()}
            </button>
            <p
              id="copy-status"
              role="status"
            />
          </div>
          {endpoint && (
            <div class="prose">
              <h2>One handshake before delivery</h2>
              <p>
                Your webhook awaits verification. When you click Verify webhook in the workspace, we
                POST a signed <code>endpoint.verification</code> event with a <code>challenge</code>{" "}
                field. Return that value as the plain-text response body with a 2xx status.
              </p>
              <p>Configure the secret in your receiver, then verify the connection.</p>
              <a href="/docs/webhooks#receiver">Receiver example and signing instructions →</a>
            </div>
          )}
          <a
            class="button primary"
            href={endpoint ? "/dashboard" : "/settings"}>
            Continue to your workspace →
          </a>
        </div>
      </section>
    </Layout>
  );
}
export function ErrorPage({ message }: { message: string }) {
  return (
    <Layout title="Something needs attention">
      <section class="section">
        <div class="container">
          <p class="eyebrow">LET’S GET BACK ON TRACK</p>
          <h1 class="page-title">Something needs attention.</h1>
          <p
            class="lead"
            role="alert">
            {message}
          </p>
          <a
            class="button secondary"
            href="/dashboard">
            Return to your workspace →
          </a>
        </div>
      </section>
    </Layout>
  );
}
