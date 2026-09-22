import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { readFileSync, readdirSync } from "node:fs";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ENCRYPTION_KEY: "a".repeat(64),
          ADMIN_TOKEN: "test-admin",
          TEST_INITIAL: readFileSync("migrations/0001_initial.sql","utf8"),
          TEST_UPGRADE: readFileSync("migrations/0002_accounts_channels.sql","utf8"),
          TEST_MIGRATION: readdirSync("migrations").filter(f=>f.endsWith(".sql")).sort().map(f=>readFileSync(`migrations/${f}`,"utf8")).join("\n"),
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
