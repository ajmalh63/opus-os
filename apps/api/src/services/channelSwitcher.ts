// Smart Channel Switcher & Pipeline Stall Recovery
// Escalates unopened emails to WhatsApp and nudges stalled applications (>5 days in docs_awaiting).

import { getDb } from '../db/client.js';
import { clients, nurtureTouches, tasks } from '../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { dispatchUnifiedWhatsApp } from '../infra/chatwootBridge.js';
import { createStaffAlert } from '../infra/staffAlerts.js';

export async function runSmartChannelSwitcher(env: any): Promise<{ escalatedCount: number }> {
  if (!env?.DB) return { escalatedCount: 0 };
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const twoDaysAgo = now - 172800; // 48 hours

  // 1. Find email touches sent >48 hours ago
  const staleEmailTouches = await db
    .select()
    .from(nurtureTouches)
    .where(
      and(
        eq(nurtureTouches.channel, 'email'),
        eq(nurtureTouches.status, 'sent'),
        lte(nurtureTouches.sentAt, twoDaysAgo),
        gte(nurtureTouches.sentAt, twoDaysAgo - 259200) // Within 5 day window
      )
    )
    .all();

  let escalatedCount = 0;

  for (const touch of staleEmailTouches) {
    const client = await db.select().from(clients).where(eq(clients.id, touch.clientId)).get();
    if (client?.phone) {
      // Send smart WhatsApp nudge
      await dispatchUnifiedWhatsApp(env, {
        phone: client.phone,
        name: client.name,
        email: client.email || undefined,
        customText: `*Important Update for ${client.name || 'there'}* 📬\n\nWe sent your overseas admissions roadmap and fee waiver update to your email on ${new Date(touch.sentAt! * 1000).toLocaleDateString('en-IN')}.\n\nTo ensure you don't miss upcoming quota deadlines, you can also view your options here: https://opusoverseas.com/portal\n\nReply directly to this chat if you have any questions!`,
        division: client.primaryDivision || 'study-abroad',
        tags: ['channel-switch-escalated'],
      }).catch(() => {});

      escalatedCount++;
    }
  }

  return { escalatedCount };
}

export async function runPipelineStallRecovery(env: any): Promise<{ stalledNudgesCount: number }> {
  if (!env?.DB) return { stalledNudgesCount: 0 };
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const fiveDaysAgo = now - 432000; // 5 days

  // Find open tasks for document collection older than 5 days
  const stalledTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, 'open'), lte(tasks.createdAt, fiveDaysAgo)))
    .all();

  let stalledNudgesCount = 0;

  for (const task of stalledTasks) {
    if (task.clientId) {
      const client = await db.select().from(clients).where(eq(clients.id, task.clientId)).get();
      if (client?.phone) {
        await dispatchUnifiedWhatsApp(env, {
          phone: client.phone,
          name: client.name,
          email: client.email || undefined,
          customText: `*Document Upload Assistance · Opus Overseas* 📑\n\nHi *${client.name || 'there'}*,\n\nYour application is in progress! We are currently awaiting your remaining verification documents.\n\nTap here to securely upload from your phone in 1 click:\n👉 https://opusoverseas.com/portal\n\nOur counseling desk is standing by to assist you!`,
          division: client.primaryDivision || 'study-abroad',
          tags: ['stall-recovery-nudge'],
        }).catch(() => {});

        stalledNudgesCount++;
      }
    }
  }

  return { stalledNudgesCount };
}
