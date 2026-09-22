import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ENCRYPTION_KEY: "a".repeat(64),
          ADMIN_TOKEN: "test-admin",
          TEST_MIGRATION: readFileSync("migrations/0001_initial.sql", "utf8"),
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
