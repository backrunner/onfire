/**
 * Email Provider Factory
 */
import type { EmailProvider } from '@onfire/shared/drizzle/schema';
import type { IEmailProvider, ProviderConfig } from '../types';
import { ResendProvider } from './resend';
import { SendGridProvider } from './sendgrid';
import { MailgunProvider } from './mailgun';
import { MailerooProvider } from './maileroo';
import { SmtpProvider } from './smtp';

export function createEmailProvider(config: ProviderConfig): IEmailProvider {
  const provider = config.outboundProvider;

  if (!provider) {
    throw new Error('Email provider not configured');
  }

  switch (provider) {
    case 'resend':
      return new ResendProvider(config);
    case 'sendgrid':
      return new SendGridProvider(config);
    case 'mailgun':
      return new MailgunProvider(config);
    case 'maileroo':
      return new MailerooProvider(config);
    case 'smtp':
      return new SmtpProvider(config);
    default:
      throw new Error(`Unsupported email provider: ${provider}`);
  }
}

export { ResendProvider } from './resend';
export { SendGridProvider } from './sendgrid';
export { MailgunProvider } from './mailgun';
export { MailerooProvider } from './maileroo';
export { SmtpProvider } from './smtp';
