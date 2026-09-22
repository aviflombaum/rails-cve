import { describe, expect, it, vi } from "vitest";
import { admit } from "../egress/cloudflare/admission.mjs";

const token = "b".repeat(64);
const authorization = { Authorization: `Bearer ${token}` };

describe("Cloudflare gateway admission in the Workers runtime", () => {
  it("rejects unauthenticated and unconfigured requests before container access", async () => {
    const forward = vi.fn(async () => Response.json({ status: "ok" }));
    const request = () => new Request("https://gateway.example.net/health");
    expect((await admit(request(), token, forward)).status).toBe(401);
    expect((await admit(request(), undefined, forward)).status).toBe(503);
    expect(forward).not.toHaveBeenCalled();
    const response = await admit(
      new Request("https://gateway.example.net/health", { headers: authorization }),
      token,
      forward,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(forward).toHaveBeenCalledOnce();
  });

  it("preserves signed bytes, strips caller headers and hides container failures", async () => {
    const body = JSON.stringify({ body: "héllo", id: "evt_fixture" });
    const request = () =>
      new Request("https://gateway.example.net/deliver", {
        method: "POST",
        headers: { ...authorization, "X-Forwarded-Host": "attacker.example.net" },
        body,
      });
    const response = await admit(request(), token, async (forwarded) => {
      expect(await forwarded.text()).toBe(body);
      expect(forwarded.headers.get("authorization")).toBe(authorization.Authorization);
      expect(forwarded.headers.get("x-forwarded-host")).toBeNull();
      expect(forwarded.redirect).toBe("manual");
      return Response.json({ code: 204, body: "" });
    });
    expect(await response.json()).toEqual({ code: 204, body: "" });
    const failure = await admit(request(), token, async () => {
      throw new Error("private receiver details");
    });
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private receiver details");
  });
});
