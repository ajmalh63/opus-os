import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { integrationsStatus } from '../src/infra/integrations.js';
import { MockD1Database } from './mockDb.js';

// Infra Health — Cal.com cloud integration status.
// The tile must reflect the REAL config (D1 app_settings: cal_api_key /
// cal_webhook_secret / cal_event_types) — NOT the legacy self-hosted
// Cal.diy VPS URL probe.
describe('Integrations registry — Cal.com cloud status', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('no API key → stub with actionable detail (Consultations panel pointer)', async () => {
    const out = await integrationsStatus({}, mockD1);
    const cal = out.find((s) => s.key === 'calcom');
    expect(cal).toBeTruthy();
    expect(cal?.state).toBe('stub');
    expect(cal?.name).toBe('Cal.com (Bookings)');
    expect(cal?.detail).toContain('API key not set');
  });

  it('API key set + cal.com reachable → live, with event map + webhook secret detail', async () => {
    mockD1.tables.app_settings.push(
      { key: 'cal_api_key', value: 'cal_live_123', updated_at: 1 },
      { key: 'cal_webhook_secret', value: 'whsec_x', updated_at: 1 },
      { key: 'cal_event_types', value: JSON.stringify({ 'study-abroad': '111', visa: '222' }), updated_at: 1 },
    );
    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: [] }), { status: 200 }));
    const out = await integrationsStatus({}, mockD1);
    const cal = out.find((s) => s.key === 'calcom');
    expect(cal?.state).toBe('live');
    expect(cal?.detail).toContain('2 event type(s) mapped');
    expect(cal?.detail).toContain('webhook secret set');
    // Probed the cal.com cloud API, NOT a VPS URL
    const called = (fetch as any).mock.calls[0][0] as string;
    expect(called).toContain('api.cal.com/v2/event-types');
  });

  it('API key set + webhook secret missing → live but flagged dev mode', async () => {
    mockD1.tables.app_settings.push(
      { key: 'cal_api_key', value: 'cal_live_123', updated_at: 1 },
      { key: 'cal_event_types', value: JSON.stringify({ visa: '222' }), updated_at: 1 },
    );
    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: [] }), { status: 200 }));
    const out = await integrationsStatus({}, mockD1);
    const cal = out.find((s) => s.key === 'calcom');
    expect(cal?.state).toBe('live');
    expect(cal?.detail).toContain('MISSING (dev mode)');
  });

  it('API key rejected by cal.com (401) → down, not live', async () => {
    mockD1.tables.app_settings.push({ key: 'cal_api_key', value: 'cal_bad_key', updated_at: 1 });
    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 }));
    const out = await integrationsStatus({}, mockD1);
    const cal = out.find((s) => s.key === 'calcom');
    expect(cal?.state).toBe('down');
    expect(cal?.detail).toContain('API key rejected');
  });

  it('legacy self-hosted CAL_BASE_URL only used as fallback when no API key', async () => {
    (fetch as any).mockResolvedValue(new Response('ok', { status: 200 }));
    const out = await integrationsStatus({ CAL_BASE_URL: 'https://cal.opusoverseas.com' }, mockD1);
    const cal = out.find((s) => s.key === 'calcom');
    expect(cal?.state).toBe('live');
    expect(cal?.detail).toContain('legacy self-hosted');
  });
});
