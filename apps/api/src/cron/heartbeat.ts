// Wave 1 — Uptime Kuma push heartbeat (cron producer).
// The Worker's `scheduled` cron pings the Kuma push monitor every 6h with the
// real state: status=up when D1 answers SELECT 1, status=down otherwise.
// Without this producer the "D1 backup heartbeat" push monitor can only show
// false alarms — with it, silent failures are visible within one interval.
// Fail-open: a misconfigured URL or D1 hiccup must never crash the Worker.

export interface HeartbeatEnv {
  DB?: { prepare(sql: string): { first(): Promise<unknown> } };
  KUMA_PUSH_URL?: string; // full push URL incl. token: https://<kuma>/api/push/<token>
}

export async function runHeartbeat(env: HeartbeatEnv): Promise<{ pinged: boolean; status: string; d1Ok: boolean }> {
  let d1Ok = true;
  try {
    await env.DB?.prepare('SELECT 1').first();
  } catch {
    d1Ok = false;
  }

  const url = env.KUMA_PUSH_URL;
  if (!url) return { pinged: false, status: d1Ok ? 'up' : 'down', d1Ok };

  try {
    const ping = Math.floor(Date.now() / 1000);
    const q = new URLSearchParams({
      status: d1Ok ? 'up' : 'down',
      msg: d1Ok ? 'worker-cron-ok' : 'd1-unreachable',
      ping: String(ping),
    });
    await fetch(`${url}${url.includes('?') ? '&' : '?'}${q.toString()}`, { method: 'GET' });
  } catch {
    /* fail-open */
  }
  return { pinged: true, status: d1Ok ? 'up' : 'down', d1Ok };
}