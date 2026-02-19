export interface EmailMessage {
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export type ProviderType = "resend" | "sendgrid" | "mailgun" | "maileroo" | "smtp";

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

export async function createProvider(config: ProviderConfig): Promise<EmailProvider> {
  switch (config.type) {
    case "resend":
      const { ResendProvider } = await import("./resend");
      return new ResendProvider(config.apiKey || "");
    case "sendgrid":
      const { SendGridProvider } = await import("./sendgrid");
      return new SendGridProvider(config.apiKey || "");
    case "mailgun":
      const { MailgunProvider } = await import("./mailgun");
      return new MailgunProvider(config.apiKey || "");
    case "maileroo":
      const { MailerooProvider } = await import("./maileroo");
      return new MailerooProvider(config.apiKey || "");
    case "smtp":
      const { SmtpProvider } = await import("./smtp");
      return new SmtpProvider({
        host: config.smtpHost || "",
        port: config.smtpPort || 587,
        user: config.smtpUser || "",
        password: config.smtpPassword || "",
      });
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
