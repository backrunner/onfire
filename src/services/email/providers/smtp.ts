import type { EmailProvider, EmailMessage, SendResult } from "./index";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure?: boolean;
}

// --- cloudflare:sockets (provided by the worker entry) ----------------------

interface CfSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  startTls(): CfSocket;
  close(): Promise<void>;
}

type ConnectFn = (
  address: string,
  options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean }
) => CfSocket;

/**
 * `cloudflare:sockets` cannot be imported from code inside the Next server
 * bundle (neither turbopack nor OpenNext's esbuild resolves the scheme), so
 * the worker entry (worker.ts) imports it natively and exposes `connect` on
 * globalThis for us.
 */
function getConnect(): ConnectFn {
  const connect = (globalThis as { __cfSocketsConnect?: ConnectFn })
    .__cfSocketsConnect;
  if (!connect) {
    throw new Error(
      "SMTP requires the Cloudflare Workers runtime (TCP sockets are unavailable in `next dev`)"
    );
  }
  return connect;
}

// --- Wire helpers -----------------------------------------------------------

const CRLF = "\r\n";
const IO_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

class SmtpConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(private socket: CfSocket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  /** Read one full SMTP response (handling `250-` continuation lines). */
  async readResponse(): Promise<{ code: number; text: string }> {
    for (;;) {
      const lines = this.buffer.split(CRLF);
      // The last element is an incomplete line (or "") — scan complete ones.
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}(?: |$)/.test(lines[i])) {
          const consumed = lines.slice(0, i + 1);
          this.buffer = lines.slice(i + 1).join(CRLF);
          return {
            code: Number(lines[i].slice(0, 3)),
            text: consumed.join(" "),
          };
        }
        if (!/^\d{3}-/.test(lines[i])) {
          throw new Error(`Malformed SMTP response: ${lines[i]}`);
        }
      }
      const { value, done } = await this.withTimeout(this.reader.read());
      if (done) throw new Error("SMTP connection closed unexpectedly");
      this.buffer += this.decoder.decode(value, { stream: true });
      if (this.buffer.length > MAX_RESPONSE_BYTES) {
        throw new Error("SMTP response is too large");
      }
    }
  }

  async command(line: string, expect: number[]): Promise<string> {
    await this.withTimeout(this.writer.write(this.encoder.encode(line + CRLF)));
    const res = await this.readResponse();
    if (!expect.includes(res.code)) {
      throw new Error(
        `SMTP ${line.split(" ")[0]} failed: ${res.text.slice(0, 2_000)}`
      );
    }
    return res.text;
  }

  async write(data: string): Promise<void> {
    await this.withTimeout(this.writer.write(this.encoder.encode(data)));
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void this.socket.close();
        reject(new Error("SMTP I/O timed out"));
      }, IO_TIMEOUT_MS);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Upgrade to TLS (STARTTLS); returns a new connection over the TLS socket. */
  upgrade(): SmtpConnection {
    this.reader.releaseLock();
    this.writer.releaseLock();
    return new SmtpConnection(this.socket.startTls());
  }

  async close(): Promise<void> {
    try {
      this.reader.releaseLock();
      this.writer.releaseLock();
      await this.socket.close();
    } catch {
      // best-effort teardown
    }
  }
}

// --- Message encoding -------------------------------------------------------

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** RFC 2047 encoded-word for non-ASCII header values. */
function encodeHeaderWord(value: string): string {
  value = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, `$1${CRLF}`);
}

function assertMailbox(value: string): string {
  const mailbox = value.trim();
  if (
    mailbox.includes("\r") ||
    mailbox.includes("\n") ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)
  ) {
    throw new Error("Invalid SMTP mailbox");
  }
  return mailbox;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function buildMime(
  message: EmailMessage,
  host: string
): { raw: string; messageId: string } {
  const from = assertMailbox(message.from);
  const to = assertMailbox(message.to);
  const replyTo = message.replyTo ? assertMailbox(message.replyTo) : undefined;
  const fromHeader = message.fromName
    ? `${encodeHeaderWord(message.fromName)} <${from}>`
    : from;
  const suppliedMessageId = message.headers?.["Message-ID"]?.trim();
  const messageId = suppliedMessageId ||
    `<${crypto.randomUUID()}@${host.replace(/[^a-zA-Z0-9.-]/g, "")}>`;
  if (
    !/^<[^<>\s\r\n]+>$/.test(messageId) ||
    messageId.length > 998
  ) {
    throw new Error("Invalid SMTP Message-ID");
  }
  const boundary = `onfire-${crypto.randomUUID()}`;
  const threadHeaders = Object.entries(message.headers ?? {}).map(
    ([name, value]) => {
      if (
        name !== "In-Reply-To" &&
        name !== "References" &&
        name !== "Message-ID"
      ) {
        throw new Error(`Unsupported SMTP header: ${name}`);
      }
      if (name === "Message-ID") return null;
      if (/\r|\n/.test(value)) {
        throw new Error(`Invalid SMTP header value: ${name}`);
      }
      return `${name}: ${value.trim()}`;
    }
  );

  const headers = [
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `From: ${fromHeader}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    ...threadHeaders.filter((header): header is string => Boolean(header)),
    `Subject: ${encodeHeaderWord(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const text = message.text || htmlToText(message.html);
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(base64Utf8(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(base64Utf8(message.html)),
    `--${boundary}--`,
  ];
  return { raw: headers.join(CRLF) + CRLF + CRLF + parts.join(CRLF), messageId };
}

// --- Provider ---------------------------------------------------------------

/**
 * Minimal SMTP client on Cloudflare Workers TCP sockets.
 * Port 465 uses implicit TLS; anything else negotiates STARTTLS (and
 * refuses to authenticate over plaintext if the server lacks it).
 */
export class SmtpProvider implements EmailProvider {
  name = "smtp";

  constructor(private config: SmtpConfig) {}

  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.config.host || !this.config.user || !this.config.password) {
      return { success: false, error: "SMTP host/user/password not configured" };
    }

    try {
      return await this.transmit(message);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "SMTP send failed",
      };
    }
  }

  private async transmit(message: EmailMessage): Promise<SendResult> {
    const connect = getConnect();
    const implicitTls = this.config.secure ?? this.config.port === 465;

    const socket = connect(`${this.config.host}:${this.config.port}`, {
      secureTransport: implicitTls ? "on" : "starttls",
    });

    let conn = new SmtpConnection(socket);
    try {
      const greeting = await conn.readResponse();
      if (greeting.code !== 220) {
        throw new Error(`SMTP greeting failed: ${greeting.text}`);
      }

      let ehlo = await conn.command("EHLO onfire", [250]);

      if (!implicitTls) {
        if (!/STARTTLS/i.test(ehlo)) {
          throw new Error("SMTP server does not support STARTTLS");
        }
        await conn.command("STARTTLS", [220]);
        conn = conn.upgrade();
        ehlo = await conn.command("EHLO onfire", [250]);
      }

      if (/AUTH[^\r\n]*\bPLAIN\b/i.test(ehlo)) {
        const credentials = base64Utf8(
          `\u0000${this.config.user}\u0000${this.config.password}`
        );
        await conn.command(`AUTH PLAIN ${credentials}`, [235]);
      } else if (/AUTH[^\r\n]*\bLOGIN\b/i.test(ehlo)) {
        await conn.command("AUTH LOGIN", [334]);
        await conn.command(base64Utf8(this.config.user), [334]);
        await conn.command(base64Utf8(this.config.password), [235]);
      } else {
        throw new Error("SMTP server does not offer AUTH PLAIN or AUTH LOGIN");
      }

      const from = assertMailbox(message.from);
      const to = assertMailbox(message.to);
      await conn.command(`MAIL FROM:<${from}>`, [250]);
      await conn.command(`RCPT TO:<${to}>`, [250, 251]);
      await conn.command("DATA", [354]);

      const mime = buildMime(message, this.config.host);
      await conn.write(mime.raw + CRLF + "." + CRLF);
      const accepted = await conn.readResponse();
      if (accepted.code !== 250) {
        throw new Error(`SMTP DATA rejected: ${accepted.text}`);
      }

      // Best-effort polite shutdown; the message is already accepted.
      try {
        await conn.command("QUIT", [221]);
      } catch {
        // ignore
      }

      return { success: true, messageId: mime.messageId };
    } finally {
      await conn.close();
    }
  }
}
