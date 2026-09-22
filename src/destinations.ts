import { seal, unseal } from "./security";
import type { Endpoint } from "./delivery";
const prefix = "url:v1:";
export const storeDestination = async (url: string, key: string) =>
  url ? prefix + (await seal(url, key)) : "";
export const readDestination = async (stored: string, key: string) =>
  stored.startsWith(prefix) ? unseal(stored.slice(prefix.length), key) : stored;
export async function displayEndpoint(env: Env, endpoint: Endpoint): Promise<Endpoint> {
  const url = await readDestination(endpoint.url, env.ENCRYPTION_KEY);
  // Paths can contain credentials too. Never render a destination beyond its origin.
  return { ...endpoint, url: url ? new URL(url).origin + "/…" : "" };
}
/** Bounded, resumable conversion; CAS never overwrites concurrent destination edits. */
export async function encryptLegacyDestinations(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id,url FROM endpoints WHERE url<>'' AND url NOT LIKE 'url:v1:%' LIMIT 50",
  ).all<{ id: string; url: string }>();
  for (const row of results)
    await env.DB.prepare("UPDATE endpoints SET url=? WHERE id=? AND url=?")
      .bind(await storeDestination(row.url, env.ENCRYPTION_KEY), row.id, row.url)
      .run();
  return results.length;
}
