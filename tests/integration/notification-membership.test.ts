import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  agents,
  agentTeams,
  notificationLogs,
  notificationRules,
  products,
  productTeams,
  teams,
  tenants,
  tickets,
  users,
} from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import { sendRecipientNotifications } from "@/services/notification/service";
import { createTestDb, NOW, uid } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("notification recipient membership", () => {
  it("stops a user policy from delivering after the agent leaves the product", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const teamId = uid("team");
    const userId = uid("agent");
    const ruleId = uid("rule");
    const firstTicketId = uid("ticket");
    const secondTicketId = uid("ticket");

    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
    await db.insert(productTeams).values({ productId, teamId });
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
      displayName: userId,
      tenantId,
      role: Role.Agent,
    });
    await db.insert(agents).values({ userId, level: 1, active: true });
    await db.insert(agentTeams).values({ userId, teamId });
    await db.insert(notificationRules).values({
      id: ruleId,
      productId,
      name: "Direct agent",
      enabled: true,
      triggerEvents: JSON.stringify(["ticket_created"]),
      channelTypes: JSON.stringify(["email"]),
      recipientType: "user",
      recipientUserId: userId,
      createdAt: NOW(),
      updatedAt: NOW(),
    });

    for (const id of [firstTicketId, secondTicketId]) {
      await db.insert(tickets).values({
        id,
        tenantId,
        productId,
        teamId,
        status: TicketStatus.New,
        priority: TicketPriority.Medium,
        subject: "Membership check",
        content: "Membership check",
        customerEmail: "customer@example.com",
        createdAt: NOW(),
        updatedAt: NOW(),
      });
    }

    await sendRecipientNotifications(db, {
      ticketId: firstTicketId,
      triggerEvent: "ticket_created",
    });
    expect(
      await db
        .select()
        .from(notificationLogs)
        .where(eq(notificationLogs.ruleId, ruleId))
    ).toHaveLength(1);

    await db
      .delete(agentTeams)
      .where(eq(agentTeams.userId, userId));
    await sendRecipientNotifications(db, {
      ticketId: secondTicketId,
      triggerEvent: "ticket_created",
    });

    expect(
      await db
        .select()
        .from(notificationLogs)
        .where(eq(notificationLogs.ruleId, ruleId))
    ).toHaveLength(1);
  });
});
