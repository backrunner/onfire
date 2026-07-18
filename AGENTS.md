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
- **AI**: OpenAI/Anthropic/Google/xAI/DeepSeek language models + OpenAI/Qwen/Jina/Cohere/Google embeddings + Cloudflare Vectorize

Current status and task requirements live in `.agents/STATUS.md` and `.agents/REQUIREMENTS.md`. Development and visual rules live in `.agents/DEVELOPMENT.md` and `.agents/DESIGN.md`.

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

For this deployment, ToC is `support.alkinum.io` and ToB is `onfire.alkinum.com`.
Attach the Worker to both hostnames as Custom Domains and configure the matching
`ADMIN_DOMAINS` and `TOC_DOMAINS` values. Cloudflare Access can protect the admin hostname;
the Worker edge guard independently rejects `/api/tob/*` on ToC/unknown hosts
and `/api/toc/*` on ToB hosts. The application still uses Better Auth/RBAC;
Zero Trust is an additional network boundary, not a replacement for either.
This is one Worker with two hostnames. Two physically independent Workers are
possible but require separate Wrangler/OpenNext environments and an explicit
single owner for the cron trigger and Cloudflare Email handler. The production
config disables the fallback `workers.dev` hostname so the two Custom Domains
are the public entry points.

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
    ├── TicketTypePreset (up to 3 levels; copied into products)
    ├── Product ←→ Team  [Many-to-Many]
    │       │
    │       └── TicketType (up to 3 levels)
    │               ├── InternalState (ToB-only boolean/select)
    │               └── TicketTemplate
    │                       └── TemplateVersion (immutable)
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
| ticket.escalate | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.close | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.reassign | ✓ | ✓ | ✓ | ✓ | - |
| ticket_type.read | ✓ | ✓ | ✓ | ✓ | - |
| ticket_type.write | ✓ | ✓ | ✓ | - | - |
| ticket_type.route | ✓ | ✓ | ✓ | ✓ | - |
| ticket_type.preset.read | ✓ | ✓ | ✓ | - | - |
| ticket_type.preset.write | ✓ | ✓ | - | - | - |
| ticket_template.read | ✓ | ✓ | ✓ | - | - |
| ticket_template.write | ✓ | ✓ | ✓ | - | - |
| team.manage | ✓ | ✓ | ✓ | - | - |
| product.manage | ✓ | ✓ | - | - | - |
| product.settings | ✓ | ✓ | ✓ | - | - |
| tenant.manage | ✓ | - | - | - | - |
| user.manage | ✓ | ✓ | - | - | - |
| role.manage | ✓ | ✓ | - | - | - |
| customer.read | ✓ | ✓ | ✓ | ✓ | - |
| customer.write | ✓ | ✓ | ✓ | - | - |
| agent.profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| email.config | ✓ | ✓ | ✓ | - | - |
| spam.config | ✓ | ✓ | - | - | - |
| notification.manage | ✓ | ✓ | ✓ | - | - |
| ai.config | ✓ | - | - | - | - |
| ai.knowledge | ✓ | ✓ | ✓ | - | - |

### Key Concepts

- **Agent**: The lowest permission user role in the system
- **Support Agent**: The assignment target for tickets, separate from system user accounts
- Administrators can also become support agents; the ability to reply to tickets is independent of RBAC permissions
- `product.manage` controls product lifecycle operations such as creation and deletion. `product.settings` controls scoped product configuration such as SLA, auto-close, and team associations.
- ProductAdmin access is limited by `user_products`; IDs submitted for tenant, product, or team associations must belong to the same tenant even for SuperAdmin requests.

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
Unassigned tickets do not start reply SLA. Assignment, reassignment, and escalation start or reset it; the first public agent reply clears it. A later customer reply does not reactivate that completed first-reply deadline, and read-side overdue queries count only deadlines valid for the current ticket state.

### Auto-Close Configuration

Product administrators can configure automatic ticket closure:

- **Auto-Close Timeout** (autoCloseMinutes): Minutes of customer inactivity before auto-closing a ticket in "replied" status
- When set, tickets in "replied" status will be automatically closed if the customer doesn't respond within the configured time
- Set to `null` to disable auto-close for a product

---

## Ticket Assignment Mechanism

### Auto-Assignment Rules

1. The customer selects a product-owned ticket type; the form version is hidden from the customer
2. The system resolves the nearest team route from the selected type through its ancestors
3. If no type route matches, it uses the tenant's default team
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
| Slack | Slack incoming webhook notifications |
| Microsoft Teams | Teams Adaptive Card webhook notifications |
| Feishu | Feishu custom bot notifications with optional signing |
| DingTalk | DingTalk robot notifications with optional signing |
| WeCom | WeCom robot notifications |

### Notification Events

Product notification rules and requirements can match these events:

| Event | Description |
|-------|-------------|
| ticket_created | New ticket has been created |
| ticket_assigned | Ticket assigned to an agent |
| ticket_reassigned | Ticket reassigned to a different agent |
| ticket_escalated | Ticket escalated to higher-level agent |
| ticket_expiring | Ticket SLA is about to breach (fired once, 30 min before the deadline; tickets that breach without a prior warning are notified at breach time) |
| customer_replied | Customer has replied to a ticket |
| ticket_closed | Ticket has been closed |

### Delivery Model

- Every system user owns their receiving endpoints. Endpoint credentials and destinations are configured from the user's account and are not stored on products.
- A product delivery rule selects trigger events, channel types, and recipients: current assignee, current ticket team, all product agents, a specific team, or a specific agent.
- A product requirement declares mandatory channel types for all product agents, a team, or a specific agent on selected events. Requirements participate directly in delivery and also expose compliance gaps.
- Rules and requirements resolve to active support agents, then send through each matching enabled personal endpoint. Overlapping policies deduplicate the same endpoint.
- Missing required or selected endpoints are recorded as failed notification logs instead of being silently skipped.
- Email endpoints use the event product's configured outbound email provider. Other endpoint types use their provider-specific APIs or webhooks.

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
| Cloudflare Email | Worker binding | Native Cloudflare Email Sending, no API key |

Outbound replies preserve email threading with `In-Reply-To` and `References` headers. Maileroo sending uses its v2 structured email endpoint (`/api/v2/emails`).

### Email Configuration

Each product can be independently configured:
- **Inbound Address**: Address for receiving support emails
- **Outbound Provider**: Choose email sending service
- **Sender Info**: Sender name and email
- **Email Templates**: Customize notification email content
- **AI Filtering**: Enable/disable smart filtering and strictness level

### Customer Portal Return URLs

Each product may configure:
- **Product Homepage URL** (`homepageUrl`): fallback destination when a customer session expires
- **Expired-session Return URL** (`portalReturnUrl`): optional deep link used before the homepage

Customer JWTs are valid for 24 hours (`expiresIn: 86400`). After a 401, the ToC portal clears the token, retains only the product ID, loads the safe public return configuration, and guides the customer back to the product. Only `http://` and `https://` URLs are accepted; if neither URL is configured, the portal falls back to its own root.

### Customer Portal Reverse Proxy And Identity

- A product may proxy `/support` and all descendants to this Worker without stripping the prefix. Next assets remain isolated under `/support/_next`; ToB routes below `/support` are denied.
- Reverse-proxied browser requests are same-origin. CORS is intentionally not enabled for unrelated origins.
- Product Identity Resolver v1 accepts a short-lived opaque credential from `#credential=...`, calls the configured product HTTPS endpoint from the server, and then signs an internal customer JWT.
- Internal customer JWTs contain only `sub`, `productId`, and `tenantId`; email, external ID, and level are hydrated from D1 for every request.
- The complete proxy contract, nginx/Worker examples, and identity protocol are documented in `.agents/TOC_INTEGRATION.md`.

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

### Cloudflare Email Routing

Cloudflare Email Routing delivers inbound mail directly to the Worker's
`email()` handler. The handler parses MIME once, trusts the SMTP envelope for
sender identity, and forwards normalized content through the same inbound
pipeline as webhooks. Cloudflare-routed inbound mail does not use a webhook
secret.

A blank plain-text MIME alternative falls back to usable HTML-derived text; it never overwrites valid content with an empty body.

Custom product templates use the same escaped variable renderer for preview and delivery. Template authoring uses a locally bundled Monaco HTML editor that lazy-loads when a template opens, formats HTML by default, provides format/minify actions and shortcuts, and supports cursor-aware quick-variable insertion with highlighted `{{variable}}` tokens. Email settings discard restores the persisted product snapshot when the settings tab is revisited, and secret drafts clear after a successful save. Preview runs in a sandboxed iframe with scripts and external requests disabled. User-correctable validation and HTTP 4xx feedback use warning toasts; authorization, network, and server failures use error toasts.

---

## AI System

- Language tasks (`agent`, `prescreening`, `prereply`) support OpenAI, Anthropic, Google, xAI, and DeepSeek.
- OpenAI explicitly selects `responses` or `chat`; new configurations default to Responses API.
- Embedding is separate and supports OpenAI, Qwen/DashScope, Jina AI, Cohere, and Google.
- Provider credentials are stored once in an encrypted credential pool and can be reused by multiple AI tasks.
- Each task has an ordered credential route and a model per route entry. Provider failures fall through to the next available credential; failed credentials enter their configured cooldown only when another route entry is available.
- All adapters request 1024 dimensions. Vectorize uses a 1024-dimension cosine index with product namespaces.
- Knowledge mutations synchronize Vectorize. AI assistant and pre-reply use semantic retrieval with scoped D1 fallback.
- AI credentials require `ai.config`; product knowledge requires `ai.knowledge` plus product scope.
- Successful HTTP responses with empty provider completions are treated as protocol failures across all language adapters.

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
GET  /dashboard           - Get dashboard statistics
GET  /search              - Advanced scoped ticket search
GET  /search/suggest      - Scoped ticket suggestions for quick navigation

# Ticket Management
GET    /tickets           - Ticket list (filters + pagination)
GET    /tickets/:id       - Ticket details (with timeline)
POST   /tickets/:id       - Reply to ticket (content, internal)
POST   /tickets/:id/status    - Update status
PATCH  /tickets/:id/internal-states - Update a ToB-only internal state value
POST   /tickets/:id/assign    - Assign/reassign
POST   /tickets/:id/priority  - Change priority
POST   /tickets/:id/close     - Close ticket
POST   /tickets/:id/escalate  - Escalate ticket
POST   /tickets/bulk/status   - Bulk update status
POST   /tickets/bulk/assign   - Bulk assign
POST   /tickets/bulk/close    - Bulk close

# Admin
GET/POST/PATCH/DELETE /admin/tenants      - Tenant management
GET/POST/PATCH/DELETE /admin/products     - Product management
GET/POST/PATCH/DELETE /admin/teams        - Team management
GET/POST/PATCH/DELETE /admin/ticket-types - Ticket type tree management
GET/POST/DELETE       /admin/ticket-types/:id/template - Versioned form management
GET/PATCH/DELETE      /admin/ticket-types/:id/team-route - Type routing
GET/POST/PATCH/DELETE /admin/ticket-type-presets - Tenant preset-tree management
POST                  /admin/ticket-type-presets/apply - Copy preset subtree into a product
GET/POST/PATCH/DELETE /admin/ticket-types/:id/internal-states - ToB-only state definitions
GET/PATCH             /admin/users        - User management
GET/PATCH             /admin/agents       - Agent management
GET                   /admin/customers    - Customer query
GET/POST              /admin/product-keys     - API key management
POST                  /admin/product-keys/:id/rotate - Rotate key

# AI Configuration (Admin)
GET/POST/PATCH/DELETE /admin/ai/config       - Per-task model configuration
GET/POST/PATCH/DELETE /admin/ai/knowledge    - Product knowledge entries
GET/POST/DELETE       /admin/ai/documents    - Product knowledge documents

# Email Configuration (Admin)
GET/POST/PATCH        /admin/email-config     - Email config management
GET/POST/PATCH/DELETE /admin/email-templates  - Email template management
GET                   /admin/email-logs/inbound  - Inbound email logs
POST                  /admin/email-logs/inbound/:id/release - Release quarantined email
GET                   /admin/email-logs/outbound - Outbound email logs
GET/PATCH             /admin/spam-filter - Global or tenant external spam service
POST                  /admin/email-config/:productId/test - Test outbound config
POST                  /admin/email-config/:productId/webhook-secret - Generate webhook secret

# Personal Notification Endpoints
GET/POST              /notification-endpoints           - Current user's receiving methods
GET/PATCH/DELETE      /notification-endpoints/:id       - Current user's receiving method detail
POST                  /notification-endpoints/:id/test  - Test the current user's saved endpoint

# Notification Policies (Admin)
GET/POST              /admin/notification-rules             - Product delivery rules
GET/PATCH/DELETE      /admin/notification-rules/:id          - Product delivery rule detail
GET/POST              /admin/notification-requirements      - Mandatory receiving requirements
GET/PATCH/DELETE      /admin/notification-requirements/:id  - Requirement detail
GET                   /admin/notification-compliance         - Product endpoint compliance

# Metadata
GET  /meta/teams          - Get accessible teams
GET  /meta/products       - Get accessible products
GET  /meta/agents         - Agents of a team (assignment pickers; ticket.assign)
```

### ToC API (`/api/toc`)

Authentication: JWT (Bearer Token) or API Key

```
# System
GET  /health              - Health check
GET  /whoami              - Verify current identity
GET  /portal-config       - Get safe product return URLs for expired-session guidance

# Token
POST /tokens              - Issue customer JWT using a product API key (server-to-server)
POST /identity/exchange   - Exchange a product-issued opaque credential server-side

# Ticket Types
GET  /ticket-types             - Get the active product ticket type tree
GET  /ticket-types/:id/form    - Get the current hidden form version

# Tickets
POST   /tickets           - Submit ticket
GET    /tickets           - Get user ticket list
GET    /tickets/:id       - Get ticket details
POST   /tickets/:id/reply     - Reply to ticket
POST   /tickets/:id/escalate  - Escalate ticket

# Background Tasks
POST /tasks/sla-scan      - SLA breach scan + auto-close (cron-invoked; Bearer AUTH_SECRET)

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
  baseUrl: 'https://support.alkinum.io/api/toc',
  token: 'jwt-token',  // Optional, for logged-in users
  tocBaseUrl: 'https://support.alkinum.io'  // ToC frontend URL
});
```

### Main Methods

```typescript
// Get the product ticket type tree and selected type form
const types = await client.listTicketTypes();
const form = await client.getTicketTypeForm(ticketTypeId);

// Create ticket
await client.createTicket({
  productId: 'prod-xxx',
  ticketTypeId: 'type-xxx',
  templateVersionId: form.templateVersionId,
  subject: 'Issue title',
  content: 'Issue description',
  priority: 'medium',
  metadata: { environment: 'production' },
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

// Remote identity mode: credential stays in the URL fragment
const portalUrl =
  `https://product.example.com/support?productId=${encodeURIComponent(productId)}` +
  `#credential=${encodeURIComponent(opaqueCredential)}`;
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
| user_products | ProductAdmin-Product scope association (many-to-many) |
| ticket_types | Product-owned ticket type hierarchy and archive state |
| ticket_type_presets | Tenant-owned reusable ticket type trees |
| ticket_type_routes | Optional direct team mappings with ancestor fallback |
| ticket_type_internal_states | Product type-owned ToB-only state definitions |
| ticket_internal_state_values | Current per-ticket internal state values |
| ticket_templates | One soft-deletable form series per ticket type |
| ticket_template_versions | Immutable form versions and invalidation audit |
| templates | Read-only legacy ticket templates |
| product_keys | API keys |
| product_identity_configs | Encrypted per-product remote identity resolver configuration |
| tickets | Tickets |
| replies | Ticket replies |
| history | Operation history |
| customers | Customer information |
| category_routes | Read-only legacy category routing rules |
| agent_profiles | Agent profiles (can differ from user info) |
| email_configs | Email configuration (per product) |
| email_templates | Email templates |
| inbound_emails | Inbound email logs |
| spam_filter_configs | Global and tenant external spam-filter configuration |
| outbound_emails | Outbound email logs |
| notification_endpoints | User-owned notification destinations and sealed credentials |
| notification_rules | Product event, recipient, and channel routing rules |
| notification_requirements | Mandatory product/team/agent receiving-channel requirements |
| notification_logs | Notification delivery logs |
| rate_limits | Fixed-window rate-limit counters for public endpoints |

Customers may be email-backed or `externalId`-only. Ticket lists, search, labels, and notification actions must handle nullable email explicitly.

---

## UI/UX Design Guidelines

### Theme

- **Color System**: zinc (neutral gray tones)
- **Supported Modes**: Light mode + Dark mode
- **SSR Theme Contract**: `onfire-theme=light|dark` is read by the server and emitted on `<html>` before hydration. First visits use a pre-paint system-preference fallback; client toggles persist cookie and localStorage together to prevent theme flashing.

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
   - `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` configured together; a secret without a site key fails closed
   - D1-backed fixed-window rate limiting on public ToC endpoints (token issuance, ticket create/reply/escalate, inbound webhooks)

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

The app runs as a single Cloudflare Worker. Secrets are set via
`wrangler secret put` (production) or `.dev.vars` (local); plain vars live in
`wrangler.jsonc`.

### Secrets

```env
AUTH_SECRET=xxx          # Better Auth secret; also signs customer JWTs and the cron task endpoint
TURNSTILE_SECRET=xxx     # Cloudflare Turnstile secret (unset = CAPTCHA disabled)
```

### Vars (wrangler.jsonc)

```env
JWT_ISSUER=onfire        # Customer JWT issuer
JWT_AUDIENCE=onfire-toc  # Customer JWT audience
```

### Frontend (build-time)

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=xxx  # Pair with TURNSTILE_SECRET; leave both unset to disable
```

### Bindings (wrangler.jsonc)

- `DB` — D1 database
- `R2` — R2 bucket (AI document storage)
- `VECTORIZE` — `onfire-knowledge` index, 1024 dimensions, cosine metric
- `SEND_EMAIL` — Cloudflare Email Sending binding for the native outbound provider
- `WORKER_SELF_REFERENCE` — service binding used by the cron trigger to invoke `/api/toc/tasks/sla-scan`

On 2026-07-13, the APAC `onfire-d1` D1 database, APAC Standard
`onfire-storage` R2 bucket, and 1024-dimension cosine `onfire-knowledge`
Vectorize index were provisioned in the Alkinum account. The D1 ID is recorded
in `wrangler.jsonc`, and migrations through `0013_big_psynapse.sql` have
been applied remotely. Worker version `67bfbd90-50fa-4040-b16e-05c2ea50c81e`
is deployed on both Custom Domains with the SLA cron and runtime secrets configured. Remaining
external rollout steps are Cloudflare Email Sending/routing onboarding and the
first `/admin/install` SuperAdmin setup. Cloudflare Access is enforced on ToB.

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Development mode (ToC on :3000, ToB on :3001)
pnpm dev

# Build (Next.js) / build worker bundle (OpenNext)
pnpm build
pnpm build:worker

# Type check / tests
pnpm cf-typegen --check
pnpm lint
pnpm test

# Database migrations
pnpm db:generate        # Generate migration from schema
pnpm db:migrate:local   # Apply migrations (local)
pnpm db:migrate:remote  # Apply migrations (remote)

# First-deploy local validation (no remote mutation)
pnpm exec drizzle-kit check
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler check startup
pnpm audit --prod

# Deploy (single Worker serving ToB + ToC)
pnpm deploy
```

## Current Predeployment Verification

As of 2026-07-18, generated binding checks, TypeScript, 45 test files / 193 tests, Drizzle consistency, fresh local application of migrations `0000`-`0014`, non-empty legacy-data migration regression, Worker dry-run, production dependency audit, startup profiling, and desktop/mobile light/dark Playwright checks pass. Production D1 is currently migrated through `0013_big_psynapse.sql`, and Worker version `67bfbd90-50fa-4040-b16e-05c2ea50c81e` remains live on both Custom Domains until the authorized `0014` rollout completes. The public ToC health probe returns 200, the ToC-to-ToB surface guard returns 404, the ticket-type API returns JSON 401 without customer credentials, and Cloudflare Access returns its expected 302 login redirect for unauthenticated ToB probes. The remaining build warnings are expected: Vectorize has no local simulator, and OpenNext 1.20.1 still requires `src/middleware.ts` instead of Next 16 `proxy.ts`.

## Contribution Convention

- Use `xxx(comp): desc`, for example `feat(ai): add qwen embeddings` or `fix(rbac): scope assistant tickets`.
- Do not commit, deploy, apply remote migrations, or create remote Cloudflare resources unless explicitly requested.
- OpenNext Cloudflare 1.20.1 supports Next 16.2 but not Next 16 Node `proxy.ts`. Keep `src/middleware.ts` Web API-only until upstream support lands; its domain routing is covered by `src/middleware.test.ts`.
- Track `pnpm-lock.yaml`, `wrangler.types.env`, and generated `worker-configuration.d.ts`; regenerate types after Wrangler config changes. pnpm 11 overrides belong in `pnpm-workspace.yaml`.
