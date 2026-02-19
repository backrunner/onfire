import type { EmailProvider, EmailMessage, SendResult } from "./index";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure?: boolean;
}

export class SmtpProvider implements EmailProvider {
  name = "smtp";
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    // Note: SMTP requires a Node.js environment with nodemailer or similar
    // In Cloudflare Workers, SMTP is not directly supported
    // This is a placeholder that logs the attempt
    console.log(`SMTP send attempt to ${message.to}:`, {
      host: this.config.host,
      port: this.config.port,
      from: message.from,
      subject: message.subject,
    });

    // For Cloudflare Workers, we recommend using HTTP-based providers
    // If running in Node.js, you would use nodemailer here
    return {
      success: false,
      error: "SMTP not supported in Cloudflare Workers. Use an HTTP-based provider instead.",
    };
  }
}
