import { boundedText, endpointURL } from "./security";
export function webhookEnabled(env: Env) {
  try {
    if (!/^[a-f0-9]{64}$/.test(env.EGRESS_PROXY_TOKEN || "")) return false;
    const url = endpointURL(env.EGRESS_PROXY_URL || "");
    return url.pathname === "/deliver" && !url.search;
  } catch {
    return false;
  }
}
export async function forwardWebhook(
  env: Env,
  data: {
    destination: string;
    body: string;
    id: string;
    timestamp: string;
    signature: string;
    challenge: boolean;
  },
) {
  if (!webhookEnabled(env)) throw new Error("Webhook egress is not configured");
  const response = await fetch(env.EGRESS_PROXY_URL!, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.EGRESS_PROXY_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Egress did not confirm delivery");
  }
  const result = JSON.parse(await boundedText(response, 32768));
  if (
    !Number.isInteger(result.code) ||
    result.code < 100 ||
    result.code > 599 ||
    typeof result.body !== "string" ||
    new TextEncoder().encode(result.body).length > 4096
  )
    throw new Error("Invalid egress response");
  return { code: result.code as number, body: data.challenge ? (result.body as string) : "" };
}
