import { connect } from "cloudflare:sockets";
export type Mail = { from: string; to: string; subject: string; text: string; html: string };
function address(value: string) {
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(value) || value.length > 254)
    throw new Error("Invalid mail address");
  return value;
}
function base64(value: string) {
  return btoa(Array.from(new TextEncoder().encode(value), (v) => String.fromCharCode(v)).join(""));
}
function encoded(value: string) {
  return (
    base64(value)
      .match(/.{1,76}/g)
      ?.join("\r\n") || ""
  );
}
export function mime(message: Mail, id: string) {
  const from = address(message.from),
    to = address(message.to),
    boundary = `rails-cve-${crypto.randomUUID()}`;
  const subject = message.subject.replace(/[\r\n]/g, " ").slice(0, 200);
  // Short RFC 2047 encoded words, folded on continuation lines.
  const header = Array.from(subject)
    .reduce<string[]>((chunks, char) => {
      if (!chunks.length || new TextEncoder().encode(chunks[chunks.length - 1] + char).length > 42)
        chunks.push(char);
      else chunks[chunks.length - 1] += char;
      return chunks;
    }, [])
    .map((v) => `=?UTF-8?B?${base64(v)}?=`)
    .join("\r\n ");
  return [
    `From: Rails CVE <${from}>`,
    `To: <${to}>`,
    `Subject: ${header}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encoded(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encoded(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
/** Implicit TLS submission only. Never authenticate on an unencrypted socket. */
export async function smtpSend(env: Env, message: Mail) {
  if (
    !env.SMTP_HOST ||
    !env.SMTP_USERNAME ||
    !env.SMTP_PASSWORD ||
    (env.SMTP_PORT && env.SMTP_PORT !== "465")
  )
    throw new Error("SMTP TLS submission is not configured");
  address(message.from);
  address(message.to);
  const socket = connect(
    { hostname: env.SMTP_HOST, port: 465 },
    { secureTransport: "on", allowHalfOpen: true },
  );
  const reader = socket.readable.getReader(),
    writer = socket.writable.getWriter();
  let buffer = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new TextDecoder();
  const read = async (expected: number[]) => {
    let lines = 0,
      total = 0,
      code = 0;
    while (true) {
      while (!buffer.includes("\n")) {
        const part = await reader.read();
        if (part.done) throw new Error("SMTP closed");
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > 16384) throw new Error("SMTP response too large");
      }
      const end = buffer.indexOf("\n"),
        line = buffer.slice(0, end).replace(/\r$/, "");
      buffer = buffer.slice(end + 1);
      total += line.length;
      if (++lines > 64 || total > 16384) throw new Error("SMTP response too large");
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match || (code && code !== Number(match[1]))) throw new Error("Malformed SMTP response");
      code = Number(match[1]);
      if (match[2] === " ") {
        if (!expected.includes(code)) throw new Error(`SMTP rejected command (${code})`);
        return;
      }
    }
  };
  const write = (value: string) => writer.write(new TextEncoder().encode(value));
  const command = async (value: string, codes: number[]) => {
    if (/[\r\n]/.test(value)) throw new Error("Invalid SMTP command");
    await write(`${value}\r\n`);
    await read(codes);
  };
  const messageId = crypto.randomUUID();
  try {
    await Promise.race([
      (async () => {
        await socket.opened;
        await read([220]);
        await command("EHLO rails-cve", [250]);
        await command("AUTH LOGIN", [334]);
        await command(base64(env.SMTP_USERNAME!), [334]);
        await command(base64(env.SMTP_PASSWORD!), [235]);
        await command(`MAIL FROM:<${message.from}>`, [250]);
        await command(`RCPT TO:<${message.to}>`, [250, 251]);
        await command("DATA", [354]);
        await write(mime(message, messageId).replace(/^\./gm, "..") + ".\r\n");
        await read([250]);
        // Acceptance is terminal. A failed QUIT must never cause a duplicate retry.
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void socket.close().catch(() => {});
          reject(new Error("SMTP timeout"));
        }, 30_000);
      }),
    ]);
    return { messageId };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void socket.close().catch(() => {});
    try {
      reader.releaseLock();
      writer.releaseLock();
    } catch {
      /* Pending I/O will fail as socket closes. */
    }
  }
}
