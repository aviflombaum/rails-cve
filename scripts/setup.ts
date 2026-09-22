import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

// Never replace an existing key: local D1 may already contain encrypted secrets.
try {
  writeFileSync(
    ".dev.vars",
    `ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nADMIN_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created .dev.vars with independent local secrets (mode 0600).");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  console.log("Kept existing .dev.vars unchanged.");
}
console.log("Next: bun run db:local, then bun run dev.");
