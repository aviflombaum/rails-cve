import { readFileSync } from "node:fs";
// Wrangler's config parser is authoritative. This guard just rejects the known local origin.
const config = readFileSync("wrangler.jsonc", "utf8");
const appUrl = /"APP_URL"\s*:\s*"([^"]+)"/.exec(config)?.[1];
if (!appUrl || !/^https:\/\/[^/?#]+$/.test(appUrl)) {
  throw new Error(
    "Set vars.APP_URL in wrangler.jsonc to your final HTTPS origin before Cloudflare Builds deployment. See docs/deploy-with-agent.md.",
  );
}
for (const args of [
  ["d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.jsonc"],
  ["deploy", "--config", "wrangler.jsonc"],
]) {
  const child = Bun.spawn(["bunx", "wrangler", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code) process.exit(code);
}
