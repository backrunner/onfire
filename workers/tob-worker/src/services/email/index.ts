/**
 * Email Service
 * Main exports for email functionality
 */

// Types
export * from './types';

// Providers
export { createEmailProvider } from './providers';

// Template rendering
export { renderTemplate, renderTemplateRaw, htmlToPlainText } from './templates';

// Outbound email
export { sendTicketNotification, sendTestEmail } from './outbound';
export type { SendTicketNotificationOptions, SendNotificationResult } from './outbound';
