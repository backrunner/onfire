import { describe, it, expect, beforeAll } from "vitest";
import { users, agents, agentTeams, teams, tickets } from "@/drizzle/schema";
import { Role, TicketStatus, TicketPriority } from "@/lib/types";
import type { Database } from "@/lib/db";
import {
  pickAssignee,
  chooseEscalationAssignee,
} from "@/services/allocation";
import { createTestDb, uid, NOW } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

interface AgentSpec {
  id: string;
  level: number;
  active?: boolean;
  openTickets?: number;
}

/** Seed a team with agents and their current open-ticket load. */
async function seedTeam(specs: AgentSpec[]): Promise<string> {
  const teamId = uid("team");
  const tenantId = uid("tenant");
  await db.insert(teams).values({ id: teamId, tenantId, name: teamId });

  for (const spec of specs) {
    await db.insert(users).values({
      id: spec.id,
      email: `${spec.id}@example.com`,
      displayName: spec.id,
      tenantId,
      role: Role.Agent,
    });
    await db.insert(agents).values({
      userId: spec.id,
      level: spec.level,
      active: spec.active ?? true,
    });
    await db.insert(agentTeams).values({ userId: spec.id, teamId });

    for (let i = 0; i < (spec.openTickets ?? 0); i++) {
      await db.insert(tickets).values({
        id: uid("ticket"),
        tenantId,
        productId: uid("prod"),
        teamId,
        assigneeId: spec.id,
        status: TicketStatus.Processing,
        priority: TicketPriority.Medium,
        subject: "load",
        content: "load",
        customerEmail: "c@example.com",
        createdAt: NOW(),
        updatedAt: NOW(),
      });
    }
  }
  return teamId;
}

describe("load-balanced assignment", () => {
  it("picks the agent with the fewest open tickets", async () => {
    const low = uid("agent");
    const high = uid("agent");
    const teamId = await seedTeam([
      { id: low, level: 1, openTickets: 1 },
      { id: high, level: 3, openTickets: 4 },
    ]);

    const picked = await pickAssignee(db, teamId);
    expect(picked?.id).toBe(low);
  });

  it("breaks load ties by higher agent level", async () => {
    const junior = uid("agent");
    const senior = uid("agent");
    const teamId = await seedTeam([
      { id: junior, level: 1, openTickets: 2 },
      { id: senior, level: 5, openTickets: 2 },
    ]);

    const picked = await pickAssignee(db, teamId);
    expect(picked?.id).toBe(senior);
  });

  it("ignores inactive agents", async () => {
    const inactive = uid("agent");
    const active = uid("agent");
    const teamId = await seedTeam([
      { id: inactive, level: 5, active: false },
      { id: active, level: 1, openTickets: 3 },
    ]);

    const picked = await pickAssignee(db, teamId);
    expect(picked?.id).toBe(active);
  });

  it("returns null for an empty team", async () => {
    const teamId = await seedTeam([]);
    expect(await pickAssignee(db, teamId)).toBeNull();
  });
});

describe("escalation assignment", () => {
  it("requires a strictly higher-level agent than the current assignee", async () => {
    const current = uid("agent");
    const peer = uid("agent");
    const senior = uid("agent");
    const teamId = await seedTeam([
      { id: current, level: 2 },
      { id: peer, level: 2 },
      { id: senior, level: 3, openTickets: 5 },
    ]);

    const picked = await chooseEscalationAssignee(db, teamId, current);
    expect(picked?.id).toBe(senior);
  });

  it("returns null when no higher level exists", async () => {
    const current = uid("agent");
    const teamId = await seedTeam([
      { id: current, level: 5 },
      { id: uid("agent"), level: 5 },
    ]);

    expect(await chooseEscalationAssignee(db, teamId, current)).toBeNull();
  });
});
