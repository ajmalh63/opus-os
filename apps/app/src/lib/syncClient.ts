// syncClient.ts — Resilient WebSocket client for SyncHub (gold-standard: exp backoff + heartbeat + Last-Event-ID replay)
// Works for staff (session cookie), client (portalToken), partner (api_token). One WS per page, multiplex channels.

type SyncEvent = {
  v: number;
  id: string;
  channel: string;
  type: string;
  payload: any;
  ts: number;
  auditId?: string;
};

type Opts = {
  wsBase?: string; // e.g. wss://api.opusoverseas.com or ws://127.0.0.1:8787
  plane: 'staff'|'client'|'partner';
  token?: string; // portalToken for client
  apiToken?: string; // Bearer for partner
  channels: string[]; // validated server-side via allowlist
  enabled?: boolean; // feature flag VITE_SYNC_ENABLED
  onEvent?: (e: SyncEvent) => void;
  onStatus?: (s: 'connecting'|'open'|'closed'|'error') => void;
};

export function createSyncClient(opts: Opts) {
  if (opts.enabled === false) return { connect: ()=>{}, disconnect: ()=>{}, subscribe: ()=>{}, unsubscribe: ()=>{} } as const;

  let ws: WebSocket | null = null;
  let delay = 1000;
  let lastTs = Number(localStorage.getItem('opus_sync_lastTs') || '0');
  let shouldReconnect = true;
  let heartbeat: any = null;

  const wsBase = opts.wsBase || (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.host}`);

  function buildUrl(extra: string[] = []) {
    const all = [...new Set([...opts.channels, ...extra])];
    const params = new URLSearchParams();
    params.set('channels', all.join(','));
    params.set('plane', opts.plane);
    if (opts.token) params.set('token', opts.token);
    if (lastTs) params.set('since', String(lastTs));
    // tenantId derived server-side, not sent here for staff (cookie), but for client/partner we send token
    return `${wsBase}/api/sync/ws?${params.toString()}`;
  }

  function connect() {
    if (!opts.channels.length) return;
    const url = buildUrl();
    // Partner: need Authorization header — but browser WS cannot set headers, so pass via query for now with Bearer (Worker checks both)
    // For partner, append apiToken as query param fallback
    const finalUrl = opts.apiToken ? `${url}&api_token=${encodeURIComponent(opts.apiToken)}` : url;

    try { ws?.close(); } catch {}
    ws = new WebSocket(finalUrl);
    opts.onStatus?.('connecting');

    ws.onopen = () => {
      delay = 1000;
      opts.onStatus?.('open');
      // heartbeat ping every 25s (CF auto pong does not wake DO, this does)
      heartbeat = setInterval(() => { try{ ws?.send(JSON.stringify({ route:'PING' })); }catch{} }, 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // envelope or control
        if (data.type === 'PONG' || data.type === 'SUBSCRIBED' || data.type === 'ERROR') return;
        // assume SyncEvent
        const e = data as SyncEvent;
        if (e.ts) {
          lastTs = Math.max(lastTs, e.ts);
          localStorage.setItem('opus_sync_lastTs', String(lastTs));
        }
        if (e.id) {
          localStorage.setItem('opus_sync_lastId', e.id);
        }
        opts.onEvent?.(e);
        // Example TanStack invalidations — caller decides:
        // if (e.channel.startsWith('departure:')) queryClient.invalidateQueries({queryKey:['departures']})
        // if (e.channel.startsWith('client:')) queryClient.invalidateQueries({queryKey:['portal']})
      } catch {}
    };

    ws.onclose = () => {
      opts.onStatus?.('closed');
      clearInterval(heartbeat);
      if (!shouldReconnect) return;
      setTimeout(() => {
        delay = Math.min(delay * 2, 30000);
        connect();
      }, delay + Math.floor(Math.random()*500)); // jitter
    };

    ws.onerror = () => {
      opts.onStatus?.('error');
      try{ ws?.close(); }catch{}
    };
  }

  function disconnect() { shouldReconnect = false; clearInterval(heartbeat); try{ ws?.close(1000,'client disconnect'); }catch{}; ws=null; }
  function subscribe(channels: string[]) {
    const newOnes = channels.filter(c=> !opts.channels.includes(c)).slice(0,20-opts.channels.length);
    if (!newOnes.length) return;
    opts.channels.push(...newOnes);
    try{ ws?.send(JSON.stringify({ route:'SUBSCRIBE', channels: newOnes })); }catch{}
    // if not connected, reconnect will include them via buildUrl
  }
  function unsubscribe(channels: string[]) {
    opts.channels = opts.channels.filter(c=> !channels.includes(c));
    try{ ws?.send(JSON.stringify({ route:'UNSUBSCRIBE', channels })); }catch{}
  }

  return { connect, disconnect, subscribe, unsubscribe };
}

// Example wiring in React:
// const qc = useQueryClient();
// const sync = useMemo(()=> createSyncClient({
//   plane: user ? 'staff' : portalToken ? 'client' : 'partner',
//   token: portalToken,
//   channels: ['departure:dep_123:inventory', `client:${clientId}:bookings`],
//   enabled: import.meta.env.VITE_SYNC_ENABLED !== 'false',
//   onEvent: (e)=>{
//     if (e.channel.startsWith('departure:')) qc.invalidateQueries({queryKey:['departures']});
//     if (e.channel.startsWith('client:')) qc.invalidateQueries({queryKey:['portal']});
//     if (e.channel.startsWith('partner:')) qc.invalidateQueries({queryKey:['partner']});
//   }
// }), []);
// useEffect(()=>{ sync.connect(); return ()=> sync.disconnect(); }, []);
