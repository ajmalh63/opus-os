import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runSecretRotation } from '../src/cron/secretRotation.js';
import { MockD1Database } from './mockDb.js';

// Dual-key secret rotation: webhooks must keep verifying during the overlap
// window (current OR previous secret), and the monthly cron must rotate with
// a dual-key overlap + audit + owner alert.
describe('Secret rotation — dual-key webhook rotation (monthly cron)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push(
      { key: 'cal_webhook_secret', value: 'whsec_current', updated_at: 1 },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rotates cal_webhook_secret with dual-key overlap: current → prev, new CSPRNG → current', async () => {
    const res = await runSecretRotation({ DB: mockD1 });
    expect(res.rotated).toContain('cal_webhook_secret');

    const get = (k: string) => mockD1.tables.app_settings.find((r: any) => r.key === k)?.value;
    expect(get('cal_webhook_secret_prev')).toBe('whsec_current'); // old stays valid
    expect(get('cal_webhook_secret')).toMatch(/^[0-9a-f]{64}$/);  // fresh CSPRNG
    expect(get('cal_webhook_secret')).not.toBe('whsec_current');
    expect(get('cal_secret_rotated_at')).toBeTruthy();
  });

  it('second rotation drops the older prev (only one overlap window kept)', async () => {
    await runSecretRotation({ DB: mockD1 });
    const first = mockD1.tables.app_settings.find((r: any) => r.key === 'cal_webhook_secret')?.value;
    await runSecretRotation({ DB: mockD1 });
    const get = (k: string) => mockD1.tables.app_settings.find((r: any) => r.key === k)?.value;
    expect(get('cal_webhook_secret_prev')).toBe(first); // previous rotation's current
    expect(get('cal_webhook_secret')).not.toBe(first);
  });

  it('records an audit event for the rotation', async () => {
    await runSecretRotation({ DB: mockD1 });
    const audits = mockD1.tables.audit_log as any[];
    expect(audits.some((a) => a.action === 'SECRET_ROTATED' && a.entity_id === 'cal_webhook_secret')).toBe(true);
  });

  it('raises a staff alert so the owner syncs the cal.com side', async () => {
    await runSecretRotation({ DB: mockD1 });
    const alerts = mockD1.tables.staff_alerts as any[];
    expect(alerts.some((a) => a.type === 'secret_rotation' && String(a.title).includes('cal.com webhook secret rotated'))).toBe(true);
  });

  it('flags env-managed secrets older than 90 days (baseline on first run)', async () => {
    // Baseline recorded on first run
    const r1 = await runSecretRotation({ DB: mockD1 });
    const get = (k: string) => mockD1.tables.app_settings.find((x: any) => x.key === k)?.value;
    expect(get('RAZORPAY_WEBHOOK_SECRET_rotated_at')).toBeTruthy();
    expect(r1.alerts.some((a) => a.includes('RAZORPAY'))).toBe(false);

    // Simulate 91 days ago → alert
    const row = mockD1.tables.app_settings.find((x: any) => x.key === 'RAZORPAY_WEBHOOK_SECRET_rotated_at');
    row.value = String(Math.floor(Date.now() / 1000) - 91 * 86400);
    const r2 = await runSecretRotation({ DB: mockD1 });
    expect(r2.alerts.some((a) => a.startsWith('RAZORPAY_WEBHOOK_SECRET'))).toBe(true);
    const alerts = mockD1.tables.staff_alerts as any[];
    expect(alerts.some((a) => String(a.title).includes('RAZORPAY_WEBHOOK_SECRET'))).toBe(true);
  });
});
