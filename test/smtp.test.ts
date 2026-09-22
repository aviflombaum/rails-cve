import { describe, it, expect, vi, afterEach } from "vitest";
import { connect } from "cloudflare:sockets";
import { mime, smtpSend } from "../src/smtp";
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
const mail = {
  from: "security@example.org",
  to: "owner@example.org",
  subject: "Security signal",
  text: "Plain text\n.quoted line",
  html: "<p>HTML version</p>",
};
function server(responses: string) {
  const writes: string[] = [];
  const socket = {
    opened: Promise.resolve({}),
    closed: Promise.resolve(),
    close: vi.fn(async () => {}),
    readable: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responses));
        controller.close();
      },
    }),
    writable: new WritableStream({
      write(data) {
        writes.push(new TextDecoder().decode(data));
      },
    }),
  };
  vi.mocked(connect).mockReturnValue(socket as unknown as ReturnType<typeof connect>);
  return { writes, socket };
}
const config = {
  SMTP_HOST: "smtp.example.org",
  SMTP_PORT: "465",
  SMTP_USERNAME: "smtp-user-fixture",
  SMTP_PASSWORD: "smtp-password-fixture",
} as Env;
afterEach(() => vi.clearAllMocks());
describe("SMTP TLS transport", () => {
  it("uses implicit TLS, validates SMTP stages, and treats final DATA acceptance as terminal", async () => {
    const { writes, socket } = server(
      "220 server\r\n250-server\r\n250 AUTH LOGIN\r\n334 user\r\n334 pass\r\n235 ok\r\n250 from\r\n250 to\r\n354 data\r\n250 queued\r\n",
    );
    const result = await smtpSend(config, mail);
    expect(result.messageId).toBeTruthy();
    expect(connect).toHaveBeenCalledWith(
      { hostname: "smtp.example.org", port: 465 },
      { secureTransport: "on", allowHalfOpen: true },
    );
    expect(writes[1]).toBe("AUTH LOGIN\r\n");
    expect(writes.at(-1)).toContain("multipart/alternative");
    expect(writes.at(-1)).toMatch(/\r\n\.\r\n$/);
    expect(writes.join("")).not.toContain("QUIT");
    expect(socket.close).toHaveBeenCalled();
  });
  it("bounds malformed/oversized replies and keeps provider response text out of errors", async () => {
    server("220 welcome\r\n550 private mailbox and credential detail\r\n");
    await expect(smtpSend(config, mail)).rejects.toThrow("SMTP rejected command (550)");
    server("220 welcome\r\n" + "250-more\r\n".repeat(65) + "250 done\r\n");
    await expect(smtpSend(config, mail)).rejects.toThrow("SMTP response too large");
  });
  it("rejects header injection and non-TLS port configuration before opening a connection", async () => {
    expect(() =>
      mime({ ...mail, to: "owner@example.org\r\nBcc: someone@example.org" }, "id"),
    ).toThrow("Invalid mail address");
    await expect(smtpSend({ ...config, SMTP_PORT: "587" }, mail)).rejects.toThrow("not configured");
    expect(connect).not.toHaveBeenCalled();
    const encoded = mime({ ...mail, subject: "Test\r\nBcc: injected@example.org" }, "id");
    expect(encoded).not.toContain("\r\nBcc:");
    expect(encoded).toContain("Content-Type: text/plain");
    expect(encoded).toContain("Content-Type: text/html");
  });
});
