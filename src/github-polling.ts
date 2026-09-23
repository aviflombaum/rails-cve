import { createPrivateKey, sign } from "node:crypto";
import { boundedText } from "./security";

// Operator credentials for the fixed public Rails feed, independent of user login.
export async function advisoryToken(env: Env): Promise<string | undefined> {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const id = env.GITHUB_APP_ID;
  const installation = env.GITHUB_APP_INSTALLATION_ID;
  const pem = env.GITHUB_APP_PRIVATE_KEY;
  if (!id && !installation && !pem) return undefined;
  if (!/^[1-9]\d{0,19}$/.test(id || "") || !/^[1-9]\d{0,19}$/.test(installation || "") || !pem)
    throw new Error("GitHub polling app configuration is incomplete or invalid");

  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: id })}`;
  let jwt: string;
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") throw new Error("Expected RSA");
    jwt = `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
  } catch {
    throw new Error("GitHub polling app private key is invalid");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/app/installations/${installation}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "Rails-CVE/1.0",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ permissions: { metadata: "read" } }),
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new Error("GitHub polling token request failed");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`GitHub polling token request returned ${response.status}`);
  }
  try {
    const data = JSON.parse(await boundedText(response, 32768));
    if (
      typeof data.token !== "string" ||
      !/^[A-Za-z0-9_.-]{1,16384}$/.test(data.token) ||
      typeof data.expires_at !== "string" ||
      !Number.isFinite(Date.parse(data.expires_at)) ||
      Date.parse(data.expires_at) < Date.now() + 300000
    )
      throw new Error("Invalid token response");
    return data.token;
  } catch {
    throw new Error("GitHub polling token response is invalid");
  }
}
