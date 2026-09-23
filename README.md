<div align="center">

<a href="https://rails-cve.avi.nyc">
  <img src="public/og/rails-cve-v1.jpg" alt="Rails CVE — Security updates. Right on track." width="100%" />
</a>

<br />

# Rails CVE

**Rails security advisories, delivered to the people and agents who maintain your apps.**

Email notifications. Signed webhooks. An investigation brief your coding agent can run.

[![License: MIT](https://img.shields.io/badge/License-MIT-cf3028?style=flat-square)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflareworkers&logoColor=white)](https://developers.cloudflare.com/workers/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Bun](https://img.shields.io/badge/Bun-1.3.14+-282422?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![CI](https://github.com/aviflombaum/rails-cve/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aviflombaum/rails-cve/actions/workflows/ci.yml)
[![Contributions welcome](https://img.shields.io/badge/Contributions-welcome-cf3028?style=flat-square)](CONTRIBUTING.md)

[**Use the hosted service ↗**](https://rails-cve.avi.nyc/connect) · [**Get started**](docs/getting-started.md) · [**See a real payload ↗**](https://rails-cve.avi.nyc/docs/webhooks#example-payload) · [**Deploy your own**](docs/self-hosting.md) · [**Contribute**](CONTRIBUTING.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aviflombaum/rails-cve)

</div>

---

## What it does

Rails CVE watches the official [rails/rails security advisories](https://github.com/rails/rails/security/advisories) and tells you when one is published, updated, or withdrawn. Every notification carries the exact affected and patched versions, a link to the canonical advisory, and a ready-to-run investigation brief for your coding agent.

You choose how each app hears about it:

| Channel | What you get | Good for |
| :--- | :--- | :--- |
| **Email** | A plain-text message with the advisory summary and the full investigation brief. | Anyone who wants a heads-up without building anything. |
| **Webhook** | A signed JSON event posted to an HTTPS endpoint you control. | Teams that want to queue work, open tickets, or wake an agent automatically. |
| **Both** | Both channels, retried independently. | Belt and braces. |

Rails CVE never reads your repositories, never runs an agent for you, and never changes your code. It tells you something happened and gives you a good first step. You decide what happens next.

## Two ways to use it

**Hosted.** Go to [rails-cve.avi.nyc](https://rails-cve.avi.nyc), create a workspace, and subscribe your apps. Nothing to install. Email notifications and GitHub sign-in are live. Webhook delivery on the hosted service depends on the operator's egress gateway; the dashboard shows a notice whenever webhooks are unavailable, and email keeps working regardless.

**Self-hosted.** Deploy the same code to your own Cloudflare account with the button above or a copy-paste prompt for your coding agent. You control the database, the secrets, and which channels are enabled. See [Self-hosting](docs/self-hosting.md).

## Quick start (hosted)

1. Open [rails-cve.avi.nyc/connect](https://rails-cve.avi.nyc/connect). Continue with GitHub, or create a workspace and save the management token it shows you once.
2. In **Settings**, add your email address and click the confirmation link that arrives.
3. In **Apps**, add an app. Name it after the codebase, pick **Email**, and choose your verified address.
4. Click **Send test**. A test message arrives within a few minutes. It is not an advisory.
5. When Rails publishes an advisory, you get an email with the details and an investigation brief. Paste the brief into your coding agent from inside that repository.

Want a webhook instead? Follow the [webhook guide](docs/webhooks.md). It takes a small receiver, a signing secret, and a one-time ownership handshake.

The full walkthrough, including what each screen does, is in [Getting started](docs/getting-started.md).

## What arrives

A webhook receives a versioned JSON event. Here is an abbreviated `advisory.published` event for a real advisory:

```json
{
  "schema_version": 1,
  "id": "evt_…",
  "type": "advisory.published",
  "created_at": "2026-07-29T18:00:00.000Z",
  "advisory": {
    "id": "GHSA-xr9x-r78c-5hrm",
    "cve": "CVE-2026-66066",
    "severity": "critical",
    "url": "https://github.com/rails/rails/security/advisories/GHSA-xr9x-r78c-5hrm",
    "packages": [
      { "name": "activestorage", "affected": "< 7.2.3.2", "patched": "7.2.3.2" }
    ]
  },
  "investigation": {
    "prompt": "Read the canonical advisory, inspect Gemfile.lock, establish applicability…",
    "skill_url": "https://rails-cve.avi.nyc/advisories/GHSA-xr9x-r78c-5hrm/SKILL.md"
  }
}
```

Fields and long text are trimmed here. [Download the complete example](https://rails-cve.avi.nyc/examples/cve-2026-66066.json) or [read the walkthrough](https://rails-cve.avi.nyc/docs/webhooks#example-payload).

An email carries the same information as text: the app name, advisory title, severity, canonical link, and the full investigation brief.

## Hand it to your agent

Every advisory page on the site has a **Copy investigation brief** button and a downloadable `SKILL.md`. The brief asks your agent to read the canonical advisory, check `Gemfile.lock` and configuration, report whether the app is affected with file and line evidence, and propose the smallest fix. It tells the agent to get your approval before changing files, touching production, rotating secrets, merging, or deploying.

Works with Claude Code, Codex, Cursor, or any agent that can read a repository. If you run OpenClaw or NousResearch Hermes, the [agent guides](docs/agents.md) include prompts that build a webhook receiver and start investigations automatically.

## Deploy your own

Use the **Deploy to Cloudflare** button or give your agent the [deployment prompt](docs/deploy-with-agent.md#copy-this-prompt-to-your-agent). You need a Cloudflare account, a D1 database, two random secrets, and your final HTTPS origin. GitHub sign-in and email are optional and use your own credentials. Webhook delivery requires the small [egress gateway](docs/egress.md) on a host you control; the Cloudflare button does not provision it.

Read [Self-hosting](docs/self-hosting.md) for the manual steps and [Deploy with an agent](docs/deploy-with-agent.md) for the button and prompt.

## Run locally

You need **Bun 1.3.14+** and **Node.js 22+**. No Cloudflare account is needed for local work or tests.

```sh
git clone https://github.com/aviflombaum/rails-cve.git
cd rails-cve
bun install --frozen-lockfile
bun run setup      # creates local secrets in .dev.vars (never overwrites)
bun run db:local   # applies D1 migrations to local storage
bun run dev        # http://localhost:8787
```

Import the current advisories into local D1:

```sh
curl --fail http://localhost:8787/cdn-cgi/local/scheduled
```

The first import is a quiet baseline and sends nothing. Later changes create events. Local webhook delivery needs a development [egress gateway](docs/egress.md); without one the site, feed, and email paths still work.

```sh
bun run check                    # format, types, Workers-runtime tests, gateway tests
bunx wrangler deploy --dry-run   # package without publishing
```

## Documentation

**Using Rails CVE**

| Guide | What it covers |
| :--- | :--- |
| [Getting started](docs/getting-started.md) | Workspace, settings, apps, email, tests, and what to do when an advisory lands. |
| [Email notifications](docs/integrations/email.md) | Verifying addresses, what the email contains, and delivery statuses. |
| [Webhooks](docs/webhooks.md) | Signing, the ownership handshake, event types, retries, and the Rails receiver. |
| [Your workspace](docs/accounts.md) | Sign-in options, recovery tokens, GitHub linking, the delivery log, and deletion. |
| [Coding agents](docs/agents.md) | Using the investigation brief with Claude Code, Codex, Cursor, OpenClaw, and Hermes. |

**Running your own**

| Guide | What it covers |
| :--- | :--- |
| [Self-hosting](docs/self-hosting.md) | Manual Cloudflare deployment: config, D1, secrets, deploy, bootstrap. |
| [Deploy with an agent](docs/deploy-with-agent.md) | The Cloudflare button and a copy-paste deployment prompt. |
| [Egress gateway](docs/egress.md) | The Node service that sends webhooks from a pinned public address. |
| [GitHub sign-in](docs/integrations/github-app.md) | Registering a GitHub App for login on your deployment. |
| [Authenticated polling](docs/integrations/github-polling.md) | Renewing GitHub App installation tokens for the public advisory feed. |
| [Email transport](docs/integrations/email.md#operators-configuring-outbound-email) | SMTP or Cloudflare Email Service configuration. |
| [Operations](docs/operations.md) | Monitoring, budgets, retention, upgrades, and rollback. |

**Contributing**

| Guide | What it covers |
| :--- | :--- |
| [Architecture](docs/architecture.md) | Code map, ingestion, delivery lifecycle, and database tables. |
| [Contributing](CONTRIBUTING.md) | Local workflow, testing expectations, and pull requests. |
| [Security policy](SECURITY.md) | Private vulnerability reporting and supported versions. |
| [Changelog](CHANGELOG.md) | What shipped. |

## Scope and limits

- The source is the published `rails/rails` advisory feed. Other gems are not covered.
- New subscriptions receive future events. Historical advisories are browsable on the site but are not replayed.
- Receiving an advisory does not mean your app is affected. The brief helps your agent find out.
- Delivery is at least once, with retries over roughly a day. Order is not guaranteed and there is no delivery-time SLA.
- Ten apps and five email addresses per workspace. Hourly budgets can return a 429 under heavy use.
- A future GitHub App could open one issue per advisory in opted-in repositories. GitHub sign-in ships today; issue delivery does not.

## Credits and license

Built by [Avi Flombaum](https://avi.nyc). Inspired by the Rails team's [CVE-specific forensic skills](https://github.com/rails/rails-forensics-CVE-2026-66066) and the idea of bringing security notifications directly into the codebases that need them.

**[MIT licensed](LICENSE).** Inter retains its SIL Open Font License; advisory snapshots and other upstream material retain their respective terms. See [third-party notices](THIRD_PARTY_NOTICES.md).

An independent community project. Not affiliated with or endorsed by the Rails core team.
