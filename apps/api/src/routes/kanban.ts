import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { moveCardSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { engagements, pipelineStages, clients, auditLog } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditBegin } from '../middleware/audit.js';

export const kanbanRouter = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { user?: { role?: string; userDivisions?: string } | null };
}>();

// GET /api/kanban/board
// Division-scoped: counselors/coordinators see only their permitted divisions
// (userDivisions on the session). Money fields (outstandingBalance) are only
// exposed to roles with finance access (super_admin/manager).
kanbanRouter.get('/board', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) ?? null;
  const role = user?.role as string | undefined;
  const canSeeMoney = role === 'super_admin' || role === 'manager';
  let scopedDivisions: string[] | null = null;
  if (role === 'counselor' || role === 'coordinator') {
    try { scopedDivisions = JSON.parse((user?.userDivisions as string) || '[]'); } catch { scopedDivisions = []; }
  }

  try {
    const stages = await db.select().from(pipelineStages).all();
    const activeEngagements = await db
      .select({
        id: engagements.id,
        clientId: engagements.clientId,
        division: engagements.division,
        title: engagements.title,
        stageKey: engagements.stageKey,
        outstandingBalance: engagements.outstandingBalance,
        status: engagements.status,
        counselorId: engagements.counselorId,
        clientName: clients.name
      })
      .from(engagements)
      .innerJoin(clients, eq(engagements.clientId, clients.id))
      .where(eq(engagements.status, 'active'))
      .all();

    const visible = scopedDivisions
      ? activeEngagements.filter((card) => scopedDivisions!.includes(card.division))
      : activeEngagements;

    // Money is finance-tooling: strip for roles without it.
    const cards = visible.map((card) =>
      canSeeMoney ? card : { ...card, outstandingBalance: 0 }
    );

    // Group cards by stageKey
    const columns = stages.map(stage => {
      const stageCards = cards.filter(card => card.stageKey === stage.key);
      return {
        ...stage,
        cards: stageCards
      };
    });

    return c.json({ columns });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch board data", details: error.message }, 500);
  }
});

// POST /api/kanban/board/move
kanbanRouter.post('/board/move', zValidator('json', moveCardSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch target stage WIP config
    const targetStage = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.key, data.targetStage))
      .get();

    if (!targetStage) {
      return c.json({ error: "Target stage not found" }, 404);
    }

    // 2. Query current card count in target stage
    const activeCardsInTarget = await db
      .select()
      .from(engagements)
      .where(and(eq(engagements.stageKey, data.targetStage), eq(engagements.status, 'active')))
      .all();

    const currentCount = activeCardsInTarget.length;
    const isWipBreached = targetStage.wipLimit !== null && (currentCount + 1) > targetStage.wipLimit;

    // 3. Get current engagement for audit log beforeState
    const currentEngagement = await db
      .select()
      .from(engagements)
      .where(eq(engagements.id, data.cardId))
      .get();

    if (!currentEngagement) {
      return c.json({ error: "Engagement card not found" }, 404);
    }

    // 4. Update the card stage
    await db
      .update(engagements)
      .set({
        stageKey: data.targetStage,
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(eq(engagements.id, data.cardId));

    // 5. Record change in audit log (actorId from live session)
    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const { actorId } = await auditBegin(c);
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      actorId,
      action: 'STAGE_CHANGE',
      entityName: 'engagements',
      entityId: data.cardId,
      beforeState: JSON.stringify(currentEngagement),
      afterState: JSON.stringify({ ...currentEngagement, stageKey: data.targetStage }),
      ipAddress,
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      wipLimitBreached: isWipBreached,
      currentCount: currentCount + 1,
      limit: targetStage.wipLimit,
      message: isWipBreached 
        ? "WIP limit warning: column capacity exceeded." 
        : "Card moved successfully."
    });

  } catch (error: any) {
    return c.json({ error: "Move transaction failed", details: error.message }, 500);
  }
});
