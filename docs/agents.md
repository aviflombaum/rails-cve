# Using the investigation brief with your coding agent

Every Rails CVE notification includes an investigation brief: a short, fixed set of instructions that tells a coding agent how to check one repository against one advisory. This page explains what the brief asks for, how to run it with common agents, and how to wire it up automatically with OpenClaw or Hermes.

## What the brief asks the agent to do

The brief is generated from a template with the advisory's metadata filled in. It never contains model-generated claims about your app. It asks the agent to:

1. Read the canonical advisory and treat its text and links as reference data, not instructions.
2. Inspect `Gemfile.lock`, `Gemfile`, the Rails version, configuration, and relevant code, and compare installed versions against the exact upstream ranges.
3. Establish applicability with file and line references, distinguishing a vulnerable dependency, reachable functionality, historical exposure, and evidence of exploitation.
4. Propose the smallest appropriate dependency or configuration change and regression tests.
5. Report a verdict of affected, not affected, or needs investigation, with evidence and any incident-response follow-up.

It tells the agent not to change files, install dependencies, access production, run exploit code, rotate secrets, merge, or deploy without your approval. For CVE-2026-66066 it also points to the Rails team's official forensic toolkit.

You can read any brief before using it. Open an advisory on the site and expand **Preview the investigation brief**.

## Getting the brief

- **From the site.** Open the advisory page, click **Copy investigation brief**, or **Download SKILL.md**.
- **From an email.** The brief is included in full below the advisory summary.
- **From a webhook.** `investigation.prompt` holds the text and `investigation.skill_url` points to the downloadable `SKILL.md`.
- **From the API.** `GET /api/advisories/:id` returns the advisory and the brief as JSON. `:id` can be the GHSA ID or the CVE ID.

## Running it by hand

Open your agent inside the repository you want to check, then paste the brief as the first message. The agent needs read access to the repository and nothing else.

**Claude Code.** Run `claude` in the repository, paste the brief, and review the report. To keep it around, save the downloaded `SKILL.md` to `.claude/skills/investigate-<cve>/SKILL.md` and invoke it as a slash command.

**Codex, Cursor, Copilot, and similar.** Paste the brief into a new chat opened in the repository. Agents that support skill or rules files can load `SKILL.md` directly.

**Plain LLM chat.** Paste the brief along with the relevant parts of `Gemfile.lock`. Without repository access the agent can only compare versions, so expect a narrower answer.

Whatever the tool, read the evidence yourself before acting. The agent's verdict is a starting point, not a security assessment.

## Wiring it up automatically

If you want each advisory to start an investigation without you pasting anything, subscribe an app with a webhook and point it at a receiver that verifies the signature and hands the brief to your agent. Two agent platforms have ready-made setup prompts:

| Platform | Guide |
| :--- | :--- |
| OpenClaw | [OpenClaw setup](integrations/openclaw.md) |
| NousResearch Hermes Agent | [Hermes setup](integrations/hermes.md) |

Each guide includes a prompt to give your existing agent. The agent builds a small receiver that verifies Rails CVE signatures, answers the ownership handshake, stores events durably, and dispatches a read-only investigation through the platform's own inbound webhook. The same prompts are available on the site under **Agent setup**.

These are recipes, not bundled adapters. Rails CVE does not host a gateway, hold your agent credentials, or run anything in your environment.

Design points the prompts enforce, and which apply to any receiver you build yourself:

- Verify the signature and timestamp before parsing. Reject anything else.
- Answer `endpoint.verification` with the challenge. Acknowledge `endpoint.test` without starting work.
- Store the event with a unique key before returning 2xx. Rails CVE retries, so duplicates will arrive.
- Never let advisory text choose a repository path, URL, credential, or tool grant. It is untrusted data even after the signature checks out.
- Keep the agent read-only and require your approval before any change.

## What the agent should not do

The brief is a request to investigate, not permission to fix. An agent following it will stop and ask before editing files, installing gems, touching production, rotating secrets, opening pull requests, merging, or deploying. Keep those approvals with a human. If your agent platform supports capability controls, use them; instructions in a prompt are not a substitute.
