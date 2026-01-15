/**
 * Inbound Email Processing Service
 * Processes incoming emails and creates tickets or adds replies
 */
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@onfire/shared/drizzle/client';
import {
  inboundEmails,
  emailConfigs,
  tickets,
  replies,
  customers,
  products,
  tenants,
  categoryRoutes
} from '@onfire/shared/drizzle/schema';
import { TicketStatus, TicketPriority } from '@onfire/shared';
import { classifyInboundEmail, type ClassificationResult } from './classifier';
import { pickAssignee } from '../../services/allocation';

export interface ProcessInboundResult {
  success: boolean;
  action: 'ticket_created' | 'reply_added' | 'filtered' | 'error';
  ticketId?: string;
  replyId?: string;
  filterReason?: string;
  error?: string;
}

/**
 * Process an inbound email record
 */
export async function processInboundEmail(
  db: Db,
  inboundEmailId: string
): Promise<ProcessInboundResult> {
  const now = new Date().toISOString();

  // 1. Get inbound email record
  const email = await db.query.inboundEmails.findFirst({
    where: eq(inboundEmails.id, inboundEmailId)
  });

  if (!email) {
    return { success: false, action: 'error', error: 'Inbound email not found' };
  }

  if (email.processingStatus !== 'pending') {
    return { success: false, action: 'error', error: 'Email already processed' };
  }

  try {
    // 2. Get email config
    const config = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, email.productId)
    });

    if (!config || !config.inboundEnabled) {
      await updateEmailStatus(db, inboundEmailId, 'error', now, 'Inbound email not enabled');
      return { success: false, action: 'error', error: 'Inbound email not enabled' };
    }

    // 3. Check if provider marked as spam
    if (email.isSpam) {
      await updateEmailStatus(db, inboundEmailId, 'filtered', now, undefined, {
        classification: 'SPAM',
        isSupport: false,
        confidence: 1.0,
        reasoning: 'Marked as spam by email provider',
        suggestedAction: 'ignore'
      });
      return { success: true, action: 'filtered', filterReason: 'Provider spam detection' };
    }

    // 4. Check if this is a reply to an existing ticket
    const existingTicket = await findExistingTicket(db, email.subject || '', email.fromEmail, email.productId);

    if (existingTicket) {
      // Add as reply to existing ticket
      const replyId = await addReplyToTicket(db, existingTicket.id, email, now);
      await updateEmailStatus(db, inboundEmailId, 'processed', now, undefined, undefined, undefined, replyId);
      return { success: true, action: 'reply_added', ticketId: existingTicket.id, replyId };
    }

    // 5. Run AI classification if enabled
    if (config.aiFilterEnabled) {
      const classification = await classifyInboundEmail(db, {
        subject: email.subject || '',
        body: email.bodyPlain || email.bodyHtml || '',
        fromEmail: email.fromEmail,
        productId: email.productId,
        strictness: config.aiFilterStrictness || 'medium'
      });

      if (!classification.isSupport || classification.suggestedAction === 'ignore') {
        await updateEmailStatus(db, inboundEmailId, 'filtered', now, undefined, classification);
        return {
          success: true,
          action: 'filtered',
          filterReason: `${classification.classification}: ${classification.reasoning}`
        };
      }

      // Store classification result even for support requests
      await db.update(inboundEmails)
        .set({ filterResult: JSON.stringify(classification) })
        .where(eq(inboundEmails.id, inboundEmailId));
    }

    // 6. Create new ticket
    const ticketId = await createTicketFromEmail(db, email, now);
    await updateEmailStatus(db, inboundEmailId, 'processed', now, undefined, undefined, ticketId);

    return { success: true, action: 'ticket_created', ticketId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateEmailStatus(db, inboundEmailId, 'error', now, errorMessage);
    return { success: false, action: 'error', error: errorMessage };
  }
}

/**
 * Find existing ticket by subject pattern or email thread
 */
async function findExistingTicket(
  db: Db,
  subject: string,
  fromEmail: string,
  productId: string
): Promise<{ id: string } | null> {
  // Check for ticket ID in subject (e.g., "[Ticket #abc123]" or "Re: [Ticket #abc123]")
  const ticketIdMatch = subject.match(/\[Ticket #([a-zA-Z0-9_-]+)\]/i);

  if (ticketIdMatch) {
    const ticketId = ticketIdMatch[1];
    const ticket = await db.query.tickets.findFirst({
      where: and(
        eq(tickets.id, ticketId),
        eq(tickets.productId, productId)
      )
    });

    if (ticket && ticket.status !== TicketStatus.Closed) {
      return { id: ticket.id };
    }
  }

  // Check for recent open ticket from same email with similar subject
  const recentTickets = await db.select().from(tickets)
    .where(and(
      eq(tickets.customerEmail, fromEmail),
      eq(tickets.productId, productId)
    ))
    .orderBy(desc(tickets.createdAt))
    .limit(5);

  // Find ticket with matching subject (ignoring Re:, Fwd:, etc.)
  const cleanSubject = subject.replace(/^(Re:|Fwd:|Fw:)\s*/gi, '').trim().toLowerCase();

  for (const ticket of recentTickets) {
    if (ticket.status === TicketStatus.Closed) continue;

    const ticketSubject = ticket.subject.toLowerCase();
    if (ticketSubject === cleanSubject || cleanSubject.includes(ticketSubject) || ticketSubject.includes(cleanSubject)) {
      return { id: ticket.id };
    }
  }

  return null;
}

/**
 * Add a reply to an existing ticket
 */
async function addReplyToTicket(
  db: Db,
  ticketId: string,
  email: { fromEmail: string; bodyPlain?: string | null; bodyHtml?: string | null; id: string },
  now: string
): Promise<string> {
  const replyId = nanoid();
  const content = email.bodyPlain || stripHtml(email.bodyHtml || '') || '(empty message)';

  await db.insert(replies).values({
    id: replyId,
    ticketId,
    senderId: null, // Customer reply
    senderEmail: email.fromEmail,
    content,
    internal: false,
    source: 'email',
    sourceEmailId: email.id,
    emailSent: false,
    createdAt: now
  });

  // Update ticket status to processing (customer replied)
  await db.update(tickets)
    .set({
      status: TicketStatus.Processing,
      updatedAt: now
    })
    .where(eq(tickets.id, ticketId));

  return replyId;
}

/**
 * Create a new ticket from an inbound email
 */
async function createTicketFromEmail(
  db: Db,
  email: {
    productId: string;
    fromEmail: string;
    subject?: string | null;
    bodyPlain?: string | null;
    bodyHtml?: string | null;
    id: string;
  },
  now: string
): Promise<string> {
  // Get product and tenant
  const product = await db.query.products.findFirst({
    where: eq(products.id, email.productId)
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, product.tenantId)
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Upsert customer
  const customerId = await upsertCustomer(db, {
    tenantId: product.tenantId,
    productId: email.productId,
    email: email.fromEmail
  }, now);

  // Determine team (use default team)
  const teamId = tenant.defaultTeamId || '';

  // Pick assignee
  const assignee = teamId ? await pickAssignee(db, teamId) : null;

  // Create ticket
  const ticketId = nanoid();
  const content = email.bodyPlain || stripHtml(email.bodyHtml || '') || '(empty message)';

  await db.insert(tickets).values({
    id: ticketId,
    tenantId: product.tenantId,
    productId: email.productId,
    teamId,
    assigneeId: assignee?.id || null,
    status: assignee ? TicketStatus.Processing : TicketStatus.New,
    priority: TicketPriority.Medium,
    subject: email.subject || '(no subject)',
    content,
    customerEmail: email.fromEmail,
    customerLevel: null,
    templateId: null,
    metadata: null,
    source: 'email',
    sourceEmailId: email.id,
    createdAt: now,
    updatedAt: now
  });

  return ticketId;
}

/**
 * Upsert customer record
 */
async function upsertCustomer(
  db: Db,
  data: { tenantId: string; productId: string; email: string },
  now: string
): Promise<string> {
  const existing = await db.query.customers.findFirst({
    where: and(
      eq(customers.productId, data.productId),
      eq(customers.email, data.email)
    )
  });

  if (existing) {
    return existing.id;
  }

  const customerId = nanoid();
  await db.insert(customers).values({
    id: customerId,
    tenantId: data.tenantId,
    productId: data.productId,
    email: data.email,
    externalId: null,
    level: null,
    meta: null,
    createdAt: now,
    updatedAt: now
  });

  return customerId;
}

/**
 * Update inbound email status
 */
async function updateEmailStatus(
  db: Db,
  emailId: string,
  status: 'pending' | 'processed' | 'filtered' | 'error',
  processedAt: string,
  errorMessage?: string,
  filterResult?: ClassificationResult,
  ticketId?: string,
  replyId?: string
): Promise<void> {
  await db.update(inboundEmails)
    .set({
      processingStatus: status,
      processedAt,
      errorMessage: errorMessage || null,
      filterResult: filterResult ? JSON.stringify(filterResult) : null,
      ticketId: ticketId || null,
      replyId: replyId || null
    })
    .where(eq(inboundEmails.id, emailId));
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
