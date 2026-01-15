/**
 * Base Email Provider
 */
import type { IEmailProvider, EmailMessage, SendResult, ProviderConfig } from '../types';

export abstract class BaseEmailProvider implements IEmailProvider {
  abstract name: string;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract send(message: EmailMessage): Promise<SendResult>;

  async validateConfig(): Promise<boolean> {
    // Default implementation - override in subclasses for specific validation
    return true;
  }

  protected getDefaultFrom(): { email: string; name?: string } {
    return {
      email: this.config.outboundSenderEmail || '',
      name: this.config.outboundSenderName || undefined
    };
  }

  protected getReplyTo(): string | undefined {
    return this.config.outboundReplyTo || undefined;
  }
}
