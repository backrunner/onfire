# OnFire - Modern Ticket System

OnFire is a minimalist modern ticket system designed to enable users to quickly create tickets while providing development teams with a convenient dashboard for viewing and managing tickets with comprehensive permission management.

## Tech Stack

- **Runtime**: Node.js 22+ + Cloudflare Workers
- **Framework**: Next.js 16 (App Router) + OpenNext/Cloudflare
- **Database**: Cloudflare D1 (SQLite) + Drizzle ORM
- **Authentication**: Better Auth (ToB) / JWT + API Key (ToC)
- **Frontend**: React 19 + TypeScript
- **UI Components**: shadcn/ui (zinc theme)
- **Styling**: Tailwind CSS 4
- **AI**: Vercel AI SDK v6 (支持 OpenAI/Anthropic/Google/xAI/DeepSeek)

## Project Structure

```
onfire/
├── src/
│   ├── app/
│   │   ├── (toc)/                    # ToC routes (customer portal)
│   │   │   ├── page.tsx              # Home/ticket submission
│   │   │   └── layout.tsx
│   │   ├── admin/                    # ToB routes (admin dashboard)
│   │   │   ├── page.tsx              # Dashboard
│   │   │   ├── tickets/
│   │   │   ├── management/
│   │   │   ├── account/
│   │   │   ├── login/page.tsx
│   │   │   ├── install/page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── tob/                  # ToB API routes
│   │   │   │   ├── auth/[...all]/route.ts
│   │   │   │   ├── tickets/route.ts
│   │   │   │   ├── dashboard/route.ts
│   │   │   │   └── admin/[...path]/route.ts
│   │   │   └── toc/                  # ToC API routes
│   │   │       ├── tokens/route.ts
│   │   │       ├── tickets/route.ts
│   │   │       └── webhooks/[...path]/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/                   # Shared components
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── tob/                      # ToB-specific components
│   │   └── toc/                      # ToC-specific components
│   ├── lib/
│   │   ├── db.ts                     # D1 database client
│   │   ├── auth.ts                   # Better Auth config
│   │   ├── auth-client.ts            # Client-side auth
│   │   ├── types.ts                  # Shared types and RBAC
│   │   ├── i18n.tsx                  # Internationalization
│   │   └── utils.ts
│   ├── services/                     # Business logic
│   │   ├── allocation.ts
│   │   ├── email/
│   │   └── notification/
│   ├── drizzle/
│   │   └── schema.ts
│   ├── locales/                      # i18n
│   │   ├── en.ts
│   │   └── zh.ts
│   └── middleware.ts                 # Multi-domain routing
├── drizzle/
│   └── migrations/                   # Database Migration Files
├── public/
├── package.json
├── next.config.ts
├── wrangler.jsonc
├── open-next.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

## Architecture

OnFire is divided into two parts:

### ToB (To Business) - Internal Management System

Backend management system for internal support teams, including:
- Ticket processing and management
- Customer information viewing
- Team and personnel management
- Product and template configuration
- Dashboard statistics

### ToC (To Customer) - Customer Portal

Ticket submission and query system for end users, including:
- Ticket submission page
- Ticket list and detail viewing
- Ticket reply functionality

Both systems are served by a single Cloudflare Worker via OpenNext, with multi-domain routing handled by Next.js middleware.

---

## RBAC Role Permission System

### Role Hierarchy

```
SuperAdmin
    └── TenantAdmin
            └── ProductAdmin
                    └── TeamAdmin
                            └── Agent
```

### Business Hierarchy

```
Tenant
    ├── Product ←→ Team  [Many-to-Many]
    │       │
    │       └── Template (Ticket Template)
    │       └── ProductKey (API Key)
    │
    └── Team
            └── Agent (Support Agent)
```

### Permission List

| Permission | SuperAdmin | TenantAdmin | ProductAdmin | TeamAdmin | Agent |
|------------|:----------:|:-----------:|:------------:|:---------:|:-----:|
| ticket.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.write | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.assign | ✓ | ✓ | ✓ | ✓ | - |
| ticket.escalate | ✓ | ✓ | ✓ | ✓ | - |
| ticket.close | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.reassign | ✓ | ✓ | ✓ | ✓ | - |
| template.read | ✓ | ✓ | ✓ | - | - |
| template.write | ✓ | ✓ | ✓ | - | - |
| team.manage | ✓ | ✓ | ✓ | - | - |
| product.manage | ✓ | ✓ | - | - | - |
| tenant.manage | ✓ | - | - | - | - |
| user.manage | ✓ | ✓ | - | - | - |
| role.manage | ✓ | ✓ | - | - | - |
| customer.read | ✓ | ✓ | ✓ | ✓ | - |
| customer.write | ✓ | ✓ | ✓ | - | - |
| category.map | ✓ | ✓ | ✓ | ✓ | - |
| agent.profile | ✓ | ✓ | ✓ | ✓ | ✓ |

### Key Concepts

- **Agent**: The lowest permission user role in the system
- **Support Agent**: The assignment target for tickets, separate from system user accounts
- Administrators can also become support agents; the ability to reply to tickets is independent of RBAC permissions

---

## Ticket Lifecycle

### Status Flow

```
New
  ↓ [Accept]
Processing
  ↓ [Reply]
Replied
  ↓ [Customer replies] → Processing
  ↓ [Timeout/Manual close]
Closed

Any status → [Escalate] → Escalated
```

### Status Descriptions

| Status | Description |
|--------|-------------|
| new | Newly submitted ticket, awaiting acceptance |
| processing | Agent has accepted, currently processing |
| replied | Agent has replied, awaiting customer feedback |
| escalated | Ticket has been escalated to a higher-level agent |
| closed | Ticket is closed, no longer accepting replies |

### Priority Levels

| Priority | Description |
|----------|-------------|
| high | High priority, process first |
| medium | Medium priority, default |
| low | Low priority |

### SLA Management

Product administrators can configure different SLA timeframes for each priority:

- **Accept SLA** (slaAcceptMinutes): Time allowed to accept a ticket after creation
- **Reply SLA** (slaReplyMinutes): Time allowed for first reply after acceptance

Overdue tickets are marked as breached in the system and displayed with alerts on the Dashboard.

### Auto-Close Configuration

Product administrators can configure automatic ticket closure:

- **Auto-Close Timeout** (autoCloseMinutes): Minutes of customer inactivity before auto-closing a ticket in "replied" status
- When set, tickets in "replied" status will be automatically closed if the customer doesn't respond within the configured time
- Set to `null` to disable auto-close for a product

---

## Ticket Assignment Mechanism

### Auto-Assignment Rules

1. User specifies product and category when submitting a ticket
2. System finds the handling team based on CategoryRoute
3. If no matching route, uses the tenant's default team
4. Selects an agent within the team using load balancing algorithm

### Load Balancing Algorithm

```
Sorting Rules:
1. Current pending ticket count (ascending)
2. Agent level (descending)
```

### Ticket Escalation

Lower-level agents can escalate tickets they cannot handle:
- Escalation finds a higher-level agent within the current team
- Auto-assigns based on load balancing algorithm
- Ticket status changes to escalated after escalation

### Reassignment

Team administrators can control whether agents can reassign tickets:
- If allowed, agents can reassign to others within the current team
- Reassignment resets SLA timers

---

## Notification System

OnFire supports multi-channel notifications to keep agents informed about ticket events.

### Notification Channels

| Channel | Description |
|---------|-------------|
| Email | Email notifications via configured provider |
| PushDeer | iOS/macOS push notifications |
| Bark | iOS push notifications |
| ntfy | Open-source push notification service |
| Telegram | Telegram bot notifications |
| Discord | Discord webhook notifications |

### Notification Events

Each notification channel can be configured to trigger on specific events:

| Event | Description |
|-------|-------------|
| ticket_created | New ticket has been created |
| ticket_assigned | Ticket assigned to an agent |
| ticket_reassigned | Ticket reassigned to a different agent |
| ticket_escalated | Ticket escalated to higher-level agent |
| ticket_expiring | Ticket SLA is about to breach |
| customer_replied | Customer has replied to a ticket |
| ticket_closed | Ticket has been closed |

### Channel Configuration

Each product can have multiple notification channels configured:
- **Channel Type**: Select from available notification providers
- **Trigger Events**: Choose which events trigger notifications
- **Channel Config**: Provider-specific configuration (API keys, webhook URLs, etc.)

---

## Email System

OnFire supports ticket creation and communication via email, including:
- **Inbound Email**: Receive emails via webhooks, automatically create tickets
- **Outbound Email**: Automatically send email notifications when agents reply
- **AI Filtering**: Use LLM to filter spam/junk, prevent invalid ticket creation

### Inbound Email Flow

```
Email arrives → Webhook receives → Security check (SPF/DKIM)
    ↓
Spam check → Is spam → Log, don't create ticket
    ↓
Reply detection → Is reply → Add to existing ticket
    ↓ New email
AI Classification → Support request → Create ticket
                  → Non-support → Log, don't create ticket
```

### Outbound Email Providers

| Provider | Type | Description |
|----------|------|-------------|
| Resend | API | Modern email API |
| SendGrid | API | Enterprise email service |
| Mailgun | API | Developer-friendly |
| Maileroo | API | Simple and easy to use |
| SMTP | Protocol | Generic SMTP server |

### Email Configuration

Each product can be independently configured:
- **Inbound Address**: Address for receiving support emails
- **Outbound Provider**: Choose email sending service
- **Sender Info**: Sender name and email
- **Email Templates**: Customize notification email content
- **AI Filtering**: Enable/disable smart filtering and strictness level

### Email Template Types

| Template Type | Trigger |
|---------------|---------|
| ticket_created | Ticket created successfully |
| ticket_replied | Agent replied to ticket |
| ticket_closed | Ticket closed |
| ticket_escalated | Ticket escalated |

### Template Variables

```
{{ticket_id}}      - Ticket ID
{{subject}}        - Ticket subject
{{customer_name}}  - Customer name
{{customer_email}} - Customer email
{{agent_name}}     - Agent name
{{reply_content}}  - Reply content
{{product_name}}   - Product name
```

### Generic Inbound Webhook

OnFire provides a generic inbound email webhook, allowing users to use any email routing service (Zapier, Make, custom scripts, etc.) to forward emails to the system.

**Endpoint**: `POST /webhooks/inbound`

**Authentication Methods** (choose one):
1. Bearer Token: `Authorization: Bearer <webhook_secret>`
2. HMAC Signature: `X-Webhook-Signature: sha256=<hmac_signature>`
   - Signature calculation: `HMAC-SHA256(request_body, webhook_secret)`

**Payload Format**:
```json
{
  "from_email": "customer@example.com",    // Required: Sender email
  "to_email": "support@yourcompany.com",   // Required: Recipient email (configured inbound address)
  "subject": "Issue title",                // Required: Email subject
  "body_plain": "Email body...",           // Optional: Plain text content
  "body_html": "<p>Email body...</p>",     // Optional: HTML content
  "from_name": "Customer Name",            // Optional: Sender name
  "message_id": "<unique-id@mail.com>",    // Optional: Message ID (for deduplication)
  "spf_result": "pass",                    // Optional: SPF check result
  "dkim_result": true,                     // Optional: DKIM check result
  "is_spam": false                         // Optional: Whether it's spam
}
```

**Note**: At least one of `body_plain` or `body_html` is required.

**Generate Webhook Secret**:
```
POST /admin/email-config/:productId/webhook-secret
```
Returns a newly generated webhook secret. Store it securely.

---

## API Structure

### ToB API (`/api/tob`)

Authentication: Better Auth (Bearer Token)

```
# System
GET  /health              - Health check
GET  /me                  - Get current user info and permissions

# Authentication
POST /auth/email/sign-in  - Email login
POST /auth/email/sign-up  - Email registration
POST /auth/change-password - Change password

# Installation
GET  /install/status      - Check if initialization is needed
POST /install/finalize    - Complete initialization setup

# Dashboard
GET  /dashboard/summary   - Get dashboard statistics

# Ticket Management
GET    /tickets           - Ticket list (with filters)
GET    /tickets/:id       - Ticket details (with timeline)
POST   /tickets/:id/status    - Update status
POST   /tickets/:id/assign    - Assign/reassign
POST   /tickets/:id/priority  - Change priority
POST   /tickets/:id/close     - Close ticket
POST   /tickets/:id/escalate  - Escalate ticket
POST   /tickets/:id/reply     - Reply to ticket
POST   /tickets/status/bulk   - Bulk update status
POST   /tickets/assign/bulk   - Bulk assign

# Admin
GET/POST/PATCH/DELETE /admin/tenants      - Tenant management
GET/POST/PATCH/DELETE /admin/products     - Product management
GET/POST/PATCH/DELETE /admin/teams        - Team management
GET/POST/PATCH/DELETE /admin/templates    - Template management
GET/PATCH             /admin/users        - User management
GET/PATCH             /admin/agents       - Agent management
GET                   /admin/customers    - Customer query
GET/POST/PATCH/DELETE /admin/category-routes - Category routing
GET/POST              /admin/product-keys     - API key management
POST                  /admin/product-keys/:id/rotate - Rotate key

# Email Configuration (Admin)
GET/POST/PATCH        /admin/email-config     - Email config management
GET/POST/PATCH/DELETE /admin/email-templates  - Email template management
GET                   /admin/email-logs/inbound  - Inbound email logs
GET                   /admin/email-logs/outbound - Outbound email logs
POST                  /admin/email-config/:productId/test - Test outbound config
POST                  /admin/email-config/:productId/webhook-secret - Generate webhook secret

# Metadata
GET  /meta/teams          - Get accessible teams
GET  /meta/products       - Get accessible products
```

### ToC API (`/api/toc`)

Authentication: JWT (Bearer Token) or API Key

```
# System
GET  /health              - Health check
GET  /whoami              - Verify current identity

# Token
POST /tokens/issue        - Issue JWT using API Key

# Templates
GET  /templates           - Get product template list

# Tickets
POST   /tickets           - Submit ticket
GET    /tickets           - Get user ticket list
GET    /tickets/:id       - Get ticket details
POST   /tickets/:id/reply     - Reply to ticket
POST   /tickets/:id/escalate  - Escalate ticket

# Background Tasks
POST /tasks/sla-scan      - SLA timeout scan

# Webhooks
POST /webhooks/maileroo   - Maileroo inbound email webhook
POST /webhooks/inbound    - Generic inbound email webhook (requires auth)
```

---

## SDK Usage

### Installation

```typescript
import { OnfireClient } from '@onfire/sdk';
```

### Initialization

```typescript
const client = new OnfireClient({
  baseUrl: 'https://your-toc-worker.workers.dev/api/toc',
  token: 'jwt-token',  // Optional, for logged-in users
  tocBaseUrl: 'https://your-toc-web.pages.dev'  // ToC frontend URL
});
```

### Main Methods

```typescript
// Get template list
await client.listTemplates(productId);

// Create ticket
await client.createTicket({
  productId: 'prod-xxx',
  templateId: 'tpl-xxx',
  subject: 'Issue title',
  content: 'Issue description',
  priority: 'medium',
  metadata: { category: 'Technical Support' },
  customer: {
    email: 'user@example.com',
    externalId: 'user-123',
    level: 80
  },
  turnstileToken: 'cf-turnstile-token'
});

// Get ticket list
await client.listTickets({ status: 'new', productId: 'prod-xxx' });

// Get ticket details
await client.getTicket(ticketId);

// Reply to ticket
await client.reply(ticketId, { content: 'Reply content', turnstileToken: 'token' });

// Issue JWT (server-side use)
await client.issueCustomerJwt({
  apiKey: 'key-id.secret',
  email: 'user@example.com',
  externalId: 'user-123',
  level: 80
});

// Generate ToC page URL
const url = client.buildTocUrl(productId, jwt, { tab: 'list' });

// Issue JWT and generate URL (one step)
const url = await client.buildTocUrlWithSigning(productId, {
  apiKey: 'key-id.secret',
  email: 'user@example.com'
});
```

---

## Database Schema

### Main Tables

| Table | Description |
|-------|-------------|
| tenants | Tenants |
| products | Products (with SLA and auto-close settings) |
| teams | Teams |
| product_teams | Product-Team association (many-to-many) |
| users | System users |
| agents | Support agents |
| agent_teams | Agent-Team association (many-to-many) |
| templates | Ticket templates |
| product_keys | API keys |
| tickets | Tickets |
| replies | Ticket replies |
| history | Operation history |
| customers | Customer information |
| category_routes | Category routing rules |
| agent_profiles | Agent profiles (can differ from user info) |
| email_configs | Email configuration (per product) |
| email_templates | Email templates |
| inbound_emails | Inbound email logs |
| outbound_emails | Outbound email logs |
| notification_channels | Notification channel configuration |
| notification_logs | Notification delivery logs |

---

## UI/UX Design Guidelines

### Theme

- **Color System**: zinc (neutral gray tones)
- **Supported Modes**: Light mode + Dark mode

### Color Specifications

**Light Mode**:
- Background: white / zinc-50
- Primary actions: zinc-900
- Success state: emerald-500/600
- Warning state: amber-500/600
- Danger actions: red-500/600
- Info hints: sky-500/600
- Secondary text: zinc-400/500

**Dark Mode**:
- Background: zinc-950 / zinc-900
- Primary actions: zinc-50
- Success state: emerald-400
- Warning state: amber-400
- Danger actions: red-400
- Info hints: sky-400
- Secondary text: zinc-500/600

### Component Library

Using shadcn/ui as the base component library, including:
- Button, Input, Textarea, Select
- Card, Badge, Table
- Dialog, Sheet, Tabs
- DropdownMenu, Tooltip
- Avatar, Progress, Skeleton
- ScrollArea, Separator, Accordion

### Layout Guidelines

**ToB Admin Dashboard**:
- Collapsible left navigation bar
- Fixed top header bar
- Split view for ticket list (list + details)
- Responsive design

**ToC Customer Portal**:
- Clean single-page application
- Top product and user info display
- Form-driven ticket submission
- Card-style ticket list

---

## Technical Requirements

1. **Security**
   - All credentials set via environment variables
   - Strict API permission checks to prevent unauthorized access
   - Turnstile CAPTCHA protection for public endpoints

2. **Code Standards**
   - TypeScript strict mode
   - Well-organized directory structure with multi-level subdirectories
   - Shared type definitions in @onfire/shared

3. **Deployment**
   - Frontend and backend bundled together and uploaded to Cloudflare Worker
   - Deployment managed via Wrangler
   - D1 database migrations managed via Drizzle

---

## Environment Variables

### ToB Worker

```env
AUTH_SECRET=xxx          # Better Auth secret
D1_DATABASE=onfire-d1    # D1 database binding name
```

### ToC Worker

```env
JWT_ISSUER=onfire-toc    # JWT issuer
JWT_AUDIENCE=toc         # JWT audience
JWT_PUBLIC_KEY=xxx       # Public key JWK (optional)
TURNSTILE_SECRET=xxx     # Cloudflare Turnstile secret
D1_DATABASE=onfire-d1    # D1 database binding name
```

### Frontend

```env
VITE_TURNSTILE_SITE_KEY=xxx  # Turnstile site key
```

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build
pnpm build

# Type check
pnpm lint

# Database migrations
pnpm db:generate      # Generate migration
pnpm db:migrate       # Apply migration (local)
pnpm db:migrate:remote # Apply migration (remote)

# Deploy
pnpm deploy:tob       # Deploy ToB Worker
pnpm deploy:toc       # Deploy ToC Worker
pnpm deploy:all       # Deploy all Workers
```
