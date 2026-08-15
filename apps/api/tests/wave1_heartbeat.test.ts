import { describe, it, expect, vi } from 'vitest';
import { runHeartbeat } from '../src/cron/heartbeat.js';

// Wave 1 — Uptime Kuma push heartbeat producer (cron). Fail-open by design.
describe('Wave 1 heartbeat cron', () => {
  it('pings the push URL with status=up when D1 answers', async () => {
    const seen: string[] = [];
    global.fetch = vi.fn(async (url: any) => { seen.push(String(url)); return new Response('ok'); }) as any;
    const res = await runHeartbeat({ DB: { prepare: () => ({ first: async () => ({ n: 1 }) }) }, KUMA_PUSH_URL: 'https://kuma.local/api/push/tok' });
    expect(res.pinged).toBe(true);
    expect(res.status).toBe('up');
    expect(seen[0]).toContain('status=up');
    expect(seen[0]).toContain('msg=worker-cron-ok');
    expect(seen[0]).toContain('ping=');
  });

  it('reports status=down when D1 is unreachable', async () => {
    global.fetch = vi.fn(async () => new Response('ok')) as any;
    const res = await runHeartbeat({
      DB: { prepare: () => ({ first: async () => { throw new Error('d1 down'); } }) },
      KUMA_PUSH_URL: 'https://kuma.local/api/push/tok',
    });
    expect(res.status).toBe('down');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('status=down'), expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('msg=d1-unreachable'), expect.anything());
  });

  it('no-ops (fail-open) when the push URL is not configured', async () => {
    global.fetch = vi.fn(async () => new Response('ok')) as any;
    const res = await runHeartbeat({ DB: { prepare: () => ({ first: async () => ({ n: 1 }) }) } });
    expect(res.pinged).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never throws on a bad push URL (fail-open)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as any;
    const res = await runHeartbeat({ DB: { prepare: () => ({ first: async () => ({ n: 1 }) }) }, KUMA_PUSH_URL: 'https://bad' });
    expect(res.pinged).toBe(true);
    expect(res.status).toBe('up');
  });
});