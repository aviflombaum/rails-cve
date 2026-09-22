import { Layout, date } from "./views";
import type { Account } from "./auth";
import type { Endpoint } from "./delivery";
import type { EmailAddressRow } from "./email";
import type { Child } from "hono/jsx";
export interface DeliveryView {
  id: string;
  event_id: string;
  name: string;
  type: string;
  channel: string;
  status: string;
  attempts: number;
  response_code: number | null;
  error: string | null;
  provider_id: string | null;
  created_at: string;
  payload?: string;
}
export function Workspace({
  title,
  active,
  children,
  message,
}: {
  title: string;
  active: string;
  children: Child;
  message?: string;
}) {
  return (
    <Layout
      title={title}
      active="dashboard">
      <section class="section">
        <div class="container">
          <div class="section-heading">
            <div>
              <p class="eyebrow">YOUR SIGNAL STATION</p>
              <h1 class="page-title">{title}</h1>
            </div>
            <form
              method="post"
              action="/logout">
              <button class="button secondary">Sign out</button>
            </form>
          </div>
          <nav
            class="workspace-tabs"
            aria-label="Workspace">
            {[
              ["/dashboard", "Apps"],
              ["/events", "Delivery log"],
              ["/settings", "Settings"],
              ["/integrations", "Agent setup"],
            ].map(([href, label]) => (
              <a
                href={href}
                aria-current={active === href ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
          {message && (
            <p
              role="status"
              class="notice">
              {message}
            </p>
          )}
          {children}
        </div>
      </section>
    </Layout>
  );
}
export function Settings({
  account,
  emails,
  github,
  email,
  message,
}: {
  account: Account;
  emails: EmailAddressRow[];
  github: boolean;
  email: boolean;
  message?: string;
}) {
  return (
    <Workspace
      title="Make yourself at home."
      active="/settings"
      message={message}>
      <div class="dashboard-grid">
        <div class="form-panel">
          <h2>Your workspace</h2>
          <form
            method="post"
            action="/settings">
            <label for="workspace-name">Display name</label>
            <input
              id="workspace-name"
              name="name"
              maxlength={80}
              value={account.name}
              placeholder="Your name or team"
            />
            <button class="button primary">Save settings</button>
          </form>
          <h2 class="panel-subheading">GitHub sign-in</h2>
          {account.github_id ? (
            <p>
              Connected as <strong>@{account.github_login}</strong>. You can use GitHub to return to
              this workspace.
            </p>
          ) : github ? (
            <>
              <p>Link your GitHub identity to this workspace. Your apps and history stay here.</p>
              <form
                method="post"
                action="/auth/github">
                <label for="link-token">Current management token</label>
                <input
                  id="link-token"
                  name="current_token"
                  type="password"
                  autocomplete="off"
                  maxlength={128}
                  required
                />
                <button class="button secondary">Connect GitHub →</button>
              </form>
            </>
          ) : (
            <p class="notice">GitHub sign-in is not configured on this deployment yet.</p>
          )}
          <p class="source-note">
            Sign-in doesn’t install a repository bot or grant this service access to your code.
          </p>
          <h2 class="panel-subheading">Secure your account</h2>
          <p>
            Replace your management token and sign out every other device. Review your GitHub link
            and app destinations if you suspect unauthorized access.
          </p>
          {github && account.github_id && (
            <form
              method="post"
              action="/auth/github">
              <input
                type="hidden"
                name="purpose"
                value="recovery"
              />
              <button class="button secondary">Confirm identity with GitHub</button>
            </form>
          )}
          {account.recovery_ready ? (
            <p role="status">
              GitHub identity confirmed. You can secure this account within five minutes.
            </p>
          ) : null}
          <form
            method="post"
            action="/settings/token"
            data-confirm="Replace the token and sign out all other devices? Save the new token before continuing.">
            <label for="current-token">Current management token</label>
            <input
              id="current-token"
              name="current_token"
              type="password"
              autocomplete="off"
              maxlength={128}
            />
            <p class="source-note">
              Enter your saved token, or confirm your linked GitHub identity above.
            </p>
            {account.github_id && (
              <label>
                <input
                  type="checkbox"
                  name="unlink_github"
                />{" "}
                Remove the GitHub link ({account.github_login}) too
              </label>
            )}
            <button class="button secondary">Replace token and sign out other devices</button>
          </form>
        </div>
        <div class="form-panel">
          <h2>Notification addresses</h2>
          <p>Verify an address, then choose it for each app. Up to five addresses per workspace.</p>
          {!email && (
            <p class="notice">
              Email delivery is not configured on this deployment. Verified webhook delivery remains
              available.
            </p>
          )}
          {emails.map((m) => (
            <div class="email-row">
              <strong>{m.address}</strong>
              <span class={`badge ${m.verified_at ? "active" : "pending"}`}>
                {m.verified_at ? "Verified" : "Unverified"}
              </span>
              <form
                method="post"
                action={`/settings/email/${m.id}/remove`}
                data-confirm="Remove this address? Pending email deliveries to it will be cancelled.">
                <button class="button ghost">Remove</button>
              </form>
            </div>
          ))}
          <form
            method="post"
            action="/settings/email">
            <label for="email">Notification email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxlength={254}
              placeholder="security@your-company.com"
              disabled={!email}
            />
            <button
              class="button primary"
              disabled={!email}>
              Send verification email →
            </button>
            <p class="source-note">
              Links expire in one hour. Sign in to this workspace to confirm. Enter a pending
              address again to resend after 15 minutes.
            </p>
          </form>
        </div>
      </div>
    </Workspace>
  );
}
export function ConfirmEmail({ token }: { token: string }) {
  return (
    <Workspace
      title="Confirm your inbox."
      active="/settings">
      <div class="form-panel">
        <p>
          Confirm this notification address for the workspace you’re signed into. This will not
          change your login identity.
        </p>
        <form
          method="post"
          action="/settings/email/confirm">
          <input
            type="hidden"
            name="token"
            value={token}
          />
          <button class="button primary">Confirm notification address</button>
        </form>
      </div>
    </Workspace>
  );
}
function Preferences({
  endpoint,
  emails,
  email,
}: {
  endpoint?: Endpoint;
  emails: EmailAddressRow[];
  email: boolean;
}) {
  const suffix = endpoint?.id || "new";
  return (
    <>
      <label for={`name-${suffix}`}>App / codebase name</label>
      <input
        id={`name-${suffix}`}
        name="name"
        required
        maxlength={80}
        value={endpoint?.name || ""}
        placeholder="My Rails app"
      />
      <label for={`mode-${suffix}`}>Delivery mode</label>
      <select
        id={`mode-${suffix}`}
        name="delivery_mode">
        {[
          ["webhook", "Webhook"],
          ["email", "Email"],
          ["both", "Webhook + email"],
        ].map(([value, label]) => (
          <option
            value={value}
            selected={(endpoint?.delivery_mode || "webhook") === value}
            disabled={value !== "webhook" && !email && endpoint?.delivery_mode !== value}>
            {label}
          </option>
        ))}
      </select>
      <label for={`url-${suffix}`}>Webhook URL</label>
      <input
        id={`url-${suffix}`}
        name="url"
        type="url"
        maxlength={2048}
        value=""
        placeholder={
          endpoint?.url
            ? "Leave blank to keep the saved destination"
            : "https://your-app.com/webhooks/rails-cve"
        }
      />
      <p class="source-note">
        {endpoint?.url
          ? "The saved path and query are hidden. Leave this field blank to keep them. "
          : "Required for webhook or both. "}
        Changing this URL requires a new signing secret and verification.
      </p>
      {endpoint?.url && (
        <label>
          <input
            type="checkbox"
            name="clear_url"
          />{" "}
          Remove the webhook destination (email-only apps)
        </label>
      )}
      <label for={`email-${suffix}`}>Verified notification address</label>
      <select
        id={`email-${suffix}`}
        name="email_id">
        <option value="">Choose an address</option>
        {emails
          .filter((m) => m.verified_at)
          .map((m) => (
            <option
              value={m.id}
              selected={endpoint?.email_id === m.id}>
              {m.address}
            </option>
          ))}
      </select>
      <p class="source-note">
        Required for email or both. <a href="/settings">Verify an address in settings →</a>
      </p>
    </>
  );
}
export function Dashboard({
  endpoints,
  emails,
  email,
  message,
}: {
  endpoints: Endpoint[];
  emails: EmailAddressRow[];
  email: boolean;
  message?: string;
}) {
  return (
    <Workspace
      title="Keep your apps in the loop."
      active="/dashboard"
      message={message}>
      <p class="lead">One advisory. Every subscribed codebase. Choose where each signal goes.</p>
      <div class="dashboard-grid">
        <div>
          <h2>
            Your apps <span class="count">{endpoints.length}/10</span>
          </h2>
          {!endpoints.length && (
            <div class="empty">
              <h3>Your first signal starts here.</h3>
              <p>
                Add an app and choose webhook, email, or both. Each app receives future Rails
                advisories and updates.
              </p>
              <a href="/integrations">Connect an OpenClaw or Hermes agent →</a>
            </div>
          )}
          {endpoints.map((e) => (
            <article class="endpoint">
              <div class="section-heading">
                <h3>{e.name}</h3>
                <span class={`badge ${e.status}`}>{e.status}</span>
              </div>
              <p>
                <strong>
                  {e.delivery_mode === "both"
                    ? "Webhook + email"
                    : e.delivery_mode === "email"
                      ? "Email"
                      : "Webhook"}
                </strong>
              </p>
              {e.delivery_mode !== "email" && (
                <>
                  <p class="endpoint-url">{e.url}</p>
                  <p class="source-note">
                    Webhook {e.webhook_verified ? "verified" : "awaiting ownership verification"}
                  </p>
                </>
              )}
              {e.delivery_mode !== "webhook" && (
                <p>
                  {e.email_address || "Select a verified email address"}
                  {!email && " · Email service unavailable"}
                </p>
              )}
              <div class="endpoint-actions">
                {e.delivery_mode !== "email" && !e.webhook_verified && (
                  <form
                    method="post"
                    action={`/endpoints/${e.id}/verify`}>
                    <button class="button secondary">Verify webhook</button>
                  </form>
                )}
                <form
                  method="post"
                  action={`/endpoints/${e.id}/test`}>
                  <button
                    class="button secondary"
                    disabled={e.status !== "active"}>
                    Send test
                  </button>
                </form>
                <form
                  method="post"
                  action={`/endpoints/${e.id}/toggle`}>
                  <button class="button secondary">
                    {e.status === "paused" ? "Resume" : "Pause"}
                  </button>
                </form>
                <a
                  href={`/events?app=${e.id}`}
                  class="text-link">
                  Delivery log →
                </a>
              </div>
              <details class="app-settings">
                <summary>Edit delivery settings</summary>
                <form
                  method="post"
                  action={`/endpoints/${e.id}/settings`}>
                  <Preferences
                    endpoint={e}
                    emails={emails}
                    email={email}
                  />
                  <button class="button primary">Save app</button>
                </form>
                <form
                  method="post"
                  action={`/endpoints/${e.id}/delete`}
                  data-confirm="Delete this app and its delivery history?">
                  <button class="button ghost">Delete app and history</button>
                </form>
              </details>
            </article>
          ))}
        </div>
        <aside class="form-panel">
          <h2>Add an app</h2>
          {!email && (
            <p class="notice">
              Email delivery becomes available when the operator configures sending.
            </p>
          )}
          <form
            method="post"
            action="/endpoints">
            <Preferences
              emails={emails}
              email={email}
            />
            <button
              class="button primary"
              disabled={endpoints.length >= 10}>
              Subscribe app →
            </button>
          </form>
          <p class="source-note">
            Webhook delivery starts after a signed ownership handshake. A verified email channel can
            start independently.
          </p>
        </aside>
      </div>
    </Workspace>
  );
}
export function Events({
  deliveries,
  endpoints,
  query,
  page,
  more,
}: {
  deliveries: DeliveryView[];
  endpoints: Endpoint[];
  query: { app: string; channel: string; status: string };
  page: number;
  more: boolean;
}) {
  const link = (p: number) => `/events?${new URLSearchParams({ ...query, page: String(p) })}`;
  return (
    <Workspace
      title="Follow every signal."
      active="/events">
      <form
        method="get"
        class="filters">
        <div>
          <label for="filter-app">App</label>
          <select
            id="filter-app"
            name="app">
            <option value="">All apps</option>
            {endpoints.map((e) => (
              <option
                value={e.id}
                selected={e.id === query.app}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label for="filter-channel">Channel</label>
          <select
            id="filter-channel"
            name="channel">
            {["", "webhook", "email"].map((v) => (
              <option
                value={v}
                selected={v === query.channel}>
                {v || "All channels"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label for="filter-status">Status</label>
          <select
            id="filter-status"
            name="status">
            {[
              "",
              "pending",
              "sending",
              "retry",
              "delivered",
              "accepted",
              "failed",
              "cancelled",
            ].map((v) => (
              <option
                value={v}
                selected={v === query.status}>
                {v || "All statuses"}
              </option>
            ))}
          </select>
        </div>
        <button class="button secondary">Filter</button>
      </form>
      {deliveries.length ? (
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>App / event</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr>
                  <td>
                    <a href={`/events/${d.id}`}>
                      <strong>{d.name}</strong>
                      <br />
                      <code>{d.type}</code>
                    </a>
                  </td>
                  <td>{d.channel}</td>
                  <td>
                    <span class={`badge ${d.status}`}>{d.status}</span>
                  </td>
                  <td>{d.attempts}</td>
                  <td>{date(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="empty">
          No deliveries match these filters. Send a test from an active app to see its journey.
        </p>
      )}
      <nav
        class="pagination"
        aria-label="Delivery pages">
        {page > 1 && <a href={link(page - 1)}>← Newer</a>}
        <span>Page {page}</span>
        {more && <a href={link(page + 1)}>Older →</a>}
      </nav>
      <p class="source-note">
        Email “accepted” means the provider accepted the message, not that it reached the inbox.
        Retries stop after eight failed attempts. Delivery is at least once; receivers must
        deduplicate event IDs.
      </p>
    </Workspace>
  );
}
export function EventDetail({
  delivery,
  attempts,
}: {
  delivery: DeliveryView;
  attempts: {
    attempt: number;
    status: string;
    response_code: number | null;
    error: string | null;
    created_at: string;
  }[];
}) {
  return (
    <Workspace
      title="A signal, end to end."
      active="/events">
      <a
        href="/events"
        class="text-link">
        ← Delivery log
      </a>
      <div class="delivery-summary">
        <h2>{delivery.name}</h2>
        <p>
          {delivery.channel} · <strong>{delivery.status}</strong> · {delivery.attempts} attempts
        </p>
        <p class="endpoint-url">Event: {delivery.event_id}</p>
        <p>{delivery.response_code || delivery.error || "No receiver error recorded."}</p>
      </div>
      <h2>Attempt history</h2>
      {attempts.length ? (
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Result</th>
                <th>Response</th>
                <th>Time (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr>
                  <td>{a.attempt}</td>
                  <td>{a.status}</td>
                  <td>{a.response_code || a.error || "—"}</td>
                  <td>{a.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="empty">
          No completed attempts recorded in this version. Older deliveries retain their aggregate
          attempt count.
        </p>
      )}
      <h2 class="panel-subheading">Immutable event payload</h2>
      <p>
        This is the event body supplied to the webhook or used to compose the email. Secrets and
        receiver response bodies are never included.
      </p>
      <pre class="event-payload">
        <code>{JSON.stringify(JSON.parse(delivery.payload!), null, 2)}</code>
      </pre>
    </Workspace>
  );
}
