import { getDb } from '../db/client.js';
import { tasks, users } from '../db/schema.js';

export type DbClient = ReturnType<typeof getDb>;

// Least-loaded round-robin: fewest open tasks among counselors allowed for the division.
// Empty user_divisions JSON = all divisions. Ties resolved by id for stable ordering.
export async function pickCounselorForDivision(db: DbClient, division: string): Promise<string | null> {
  const allUsers = await db.select().from(users).all();
  const candidates = allUsers
    .filter((u: any) => u.role === 'counselor')
    .filter((u: any) => {
      const divs = JSON.parse(u.userDivisions || '[]');
      return divs.length === 0 || divs.includes(division);
    });
  if (candidates.length === 0) return null;

  const openTasks = await db.select().from(tasks).all();
  const load = new Map<string, number>();
  for (const t of openTasks) {
    if (t.status === 'open' && t.assigneeId) {
      load.set(t.assigneeId, (load.get(t.assigneeId) || 0) + 1);
    }
  }
  candidates.sort((a: any, b: any) => (load.get(a.id) || 0) - (load.get(b.id) || 0) || a.id.localeCompare(b.id));
  return candidates[0].id;
}

// Insert an assignment task with a dueDate relative to now (epoch seconds).
export async function createAssignmentTask(
  db: DbClient,
  opts: {
    taskId: string;
    clientId: string | null;
    engagementId: string | null;
    assigneeId: string | null;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueInSeconds: number;
    now?: number;
  }
): Promise<void> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  await db.insert(tasks).values({
    id: opts.taskId,
    clientId: opts.clientId,
    engagementId: opts.engagementId,
    assigneeId: opts.assigneeId,
    title: opts.title,
    description: opts.description,
    priority: opts.priority,
    status: 'open',
    dueDate: now + opts.dueInSeconds,
    recurrence: 'none',
    createdAt: now,
    updatedAt: now
  });
}