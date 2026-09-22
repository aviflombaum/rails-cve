import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
// A generated fake credential exists only in this throwaway repository, never
// in the project history. Test a deleted historical secret and full redaction.
const directory = mkdtempSync(join(tmpdir(), "rails-cve-secret-gate-"));
function run(args: string[]) {
  return Bun.spawnSync(args, { cwd: directory, stdout: "pipe", stderr: "pipe" });
}
function git(args: string[]) {
  if (run(["git", ...args]).exitCode) throw new Error("Fixture Git operation failed");
}
try {
  git(["init", "--quiet"]);
  const fake = "ghp_" + randomBytes(27).toString("base64url").replace(/[-_]/g, "A");
  const file = join(directory, "fixture.env");
  writeFileSync(file, `GITHUB_TOKEN=${fake}\n`, { mode: 0o600 });
  git(["add", "fixture.env"]);
  const identity = [
    "-c",
    "user.name=Security Gate Fixture",
    "-c",
    "user.email=fixture@example.org",
    "-c",
    "commit.gpgsign=false",
  ];
  git([...identity, "commit", "--quiet", "-m", "Synthetic historical secret"]);
  rmSync(file);
  git(["add", "fixture.env"]);
  git([...identity, "commit", "--quiet", "-m", "Remove synthetic fixture"]);
  const report = join(directory, "redacted.json");
  const result = run([
    "gitleaks",
    "git",
    "--redact=100",
    "--no-banner",
    "--ignore-gitleaks-allow",
    "--log-opts=--all",
    "--report-format=json",
    `--report-path=${report}`,
    ".",
  ]);
  if (result.exitCode !== 1)
    throw new Error("Secret scanner must reject a deleted historical fixture");
  const output = readFileSync(report, "utf8");
  const findings = JSON.parse(output) as { RuleID: string; Secret: string }[];
  if (!findings.some((f) => f.RuleID === "github-pat" && f.Secret === "REDACTED"))
    throw new Error("Expected fully redacted GitHub fixture finding");
  if (
    [output, result.stdout.toString(), result.stderr.toString()].some((text) => text.includes(fake))
  )
    throw new Error("Secret scanner failed full redaction");
  console.log("Secret gate rejects deleted historical fixtures and redacts their values.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
