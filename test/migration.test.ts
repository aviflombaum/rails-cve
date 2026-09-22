import { it, expect } from "vitest";
import { env } from "cloudflare:test";
const db = env as Env & { TEST_INITIAL: string; TEST_UPGRADE: string };
async function apply(sql: string) {
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.DB.prepare(statement).run();
}
it("upgrades existing token workspaces, verified endpoints and delivery records without changing IDs", async () => {
  await apply(db.TEST_INITIAL);
  await db.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES('account','hash')").run();
  for (const state of ["active", "paused", "pending"])
    await db.DB.prepare(
      "INSERT INTO endpoints(id,account_id,name,url,secret,status,challenge) VALUES(?,'account',?,'https://receiver.example.net','encrypted',?,'challenge')",
    )
      .bind(state, state, state)
      .run();
  await db.DB.prepare(
    "INSERT INTO events VALUES('event','advisory','revision','advisory.published','{}','2026-01-01')",
  ).run();
  await db.DB.prepare(
    "INSERT INTO deliveries(id,event_id,endpoint_id,status,attempts,response_code) VALUES('delivery','event','active','delivered',2,204)",
  ).run();
  await apply(db.TEST_UPGRADE);
  const row = await db.DB.prepare("SELECT * FROM deliveries").first();
  expect(row).toMatchObject({
    id: "delivery",
    event_id: "event",
    endpoint_id: "active",
    status: "delivered",
    attempts: 2,
    response_code: 204,
    channel: "webhook",
  });
  for (const state of ["active", "paused", "pending"])
    expect(
      await db.DB.prepare("SELECT webhook_verified FROM endpoints WHERE id=?")
        .bind(state)
        .first("webhook_verified"),
    ).toBe(state === "pending" ? 0 : 1);
  expect(await db.DB.prepare("SELECT token_hash FROM accounts").first("token_hash")).toBe("hash");
  expect((await db.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
