import { Layout } from "./views";
import { openclawPrompt, hermesPrompt, deployPrompt } from "./integration-content";
const guides = {
  openclaw: {
    title: "Connect OpenClaw.",
    description:
      "Let your existing agent investigate the next Rails advisory in your own checkout.",
    prompt: openclawPrompt,
    source: "https://docs.openclaw.ai/automation/cron-jobs/webhooks",
  },
  hermes: {
    title: "Connect Hermes.",
    description:
      "Route signed advisories into a NousResearch Hermes investigation, with a durable receiver in between.",
    prompt: hermesPrompt,
    source: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks",
  },
  "self-host": {
    title: "Your signal. Your infrastructure.",
    description: "Give your agent a deployment brief for your own Cloudflare account.",
    prompt: deployPrompt,
    source: "https://developers.cloudflare.com/workers/platform/deploy-buttons/",
  },
};
export function IntegrationIndex() {
  return (
    <Layout
      title="Agent integrations"
      path="/integrations">
      <section class="section">
        <div class="container">
          <p class="eyebrow">TAKE THE SIGNAL FURTHER</p>
          <h1 class="page-title">Bring your own agent.</h1>
          <p class="lead">
            Your code stays with you. A signed signal gives your agent a place to start.
          </p>
          <div class="integration-grid">
            {Object.entries(guides).map(([key, g]) => (
              <article class="form-panel">
                <h2>{g.title}</h2>
                <p>{g.description}</p>
                <a
                  class="text-link"
                  href={`/integrations/${key}`}>
                  Get the setup prompt →
                </a>
              </article>
            ))}
          </div>
          <div class="prose">
            <h2>A receiver, then an investigation.</h2>
            <p>
              OpenClaw and Hermes use their own authentication and message formats. These guides
              help your agent build a receiver that verifies Rails CVE signatures, answers the
              ownership challenge, queues events, and starts a local investigation.
            </p>
            <p>
              These are setup instructions, not preinstalled adapters. Keep your gateway private and
              review configuration changes before enabling tools. Receiving an advisory does not
              authorize code changes or deployment.
            </p>
            <a
              href="/dashboard"
              class="button primary">
              Configure your apps →
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
export function IntegrationGuide({ slug }: { slug: keyof typeof guides }) {
  const g = guides[slug];
  return (
    <Layout
      title={g.title}
      path={`/integrations/${slug}`}>
      <section class="section">
        <div class="container">
          <a
            href="/integrations"
            class="text-link">
            ← Integration guides
          </a>
          <p class="eyebrow">COPY. CONFIGURE. VERIFY.</p>
          <h1 class="page-title">{g.title}</h1>
          <p class="lead">{g.description}</p>
          <div class="prose">
            <ol>
              <li>
                Open your agent in the intended codebase and confirm it can access that checkout.
              </li>
              <li>
                Copy this brief. Let the agent inspect your installed version and propose the
                required configuration.
              </li>
              <li>
                Supply credentials through your secret manager. Verify with a harmless connection
                test before enabling investigation jobs.
              </li>
            </ol>
            {slug === "self-host" && (
              <p>
                <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/aviflombaum/rails-cve">
                  Deploy to Cloudflare →
                </a>{" "}
                or use the agent prompt below. Follow the{" "}
                <a href="https://github.com/aviflombaum/rails-cve/blob/main/docs/deploy-with-agent.md">
                  setup guide on GitHub
                </a>{" "}
                to configure your account, secrets, app URL, and build command.
              </p>
            )}
          </div>
          <div class="secret-panel">
            <label for="integration-prompt">Setup prompt</label>
            <textarea
              id="integration-prompt"
              readonly
              rows={24}>
              {g.prompt}
            </textarea>
            <button
              class="button secondary"
              data-copy="integration-prompt"
              type="button">
              Copy setup prompt
            </button>
            <p
              id="copy-status"
              role="status"
            />
          </div>
          <p class="source-note">
            Research checked September 22, 2026. Installed versions may differ.{" "}
            <a
              href={g.source}
              target="_blank"
              rel="noreferrer">
              Official reference ↗
            </a>
          </p>
        </div>
      </section>
    </Layout>
  );
}
