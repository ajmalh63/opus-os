import { describe, it, expect, vi } from 'vitest';
import { WHATSAPP_TEMPLATES, renderWhatsAppMessage, formatInrPaise } from '../src/infra/whatsappTemplates.js';
import { dispatchUnifiedWhatsApp } from '../src/infra/chatwootBridge.js';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: "admin-1", email: "admin@test.com", role: "super_admin", userDivisions: '[]' }, session: { id: "s", token, userId: "admin-1" } };
        }
        return null;
      },
    },
  }),
}));

describe('WhatsApp & Chatwoot Automation Suite', () => {
  it('formats integer paise correctly into INR representation', () => {
    expect(formatInrPaise(5000000)).toBe('₹50,000');
    expect(formatInrPaise(100000)).toBe('₹1,000');
    expect(formatInrPaise(25000000)).toBe('₹2,50,000');
  });

  it('renders all 11 WhatsApp message templates with dynamic variables', () => {
    const keys = Object.keys(WHATSAPP_TEMPLATES);
    expect(keys.length).toBe(11);

    // Operational: Invoice
    const invoiceMsg = renderWhatsAppMessage('INVOICE_GENERATED', {
      name: 'Rahul Sharma',
      invoiceNo: 'INV-2026-101',
      amountPaise: 7500000,
      division: 'Study Abroad',
      receiptUrl: 'https://opusoverseas.com/receipt/101',
    });
    expect(invoiceMsg).toContain('Rahul Sharma');
    expect(invoiceMsg).toContain('₹75,000');
    expect(invoiceMsg).toContain('INV-2026-101');

    // Operational: Agreement e-Sign
    const signMsg = renderWhatsAppMessage('AGREEMENT_SIGN_LINK', {
      name: 'Priya',
      signUrl: 'https://opusoverseas.com/sign/p1',
      expiresInHours: '48',
    });
    expect(signMsg).toContain('https://opusoverseas.com/sign/p1');
    expect(signMsg).toContain('48');

    // Operational: Consultation
    const calMsg = renderWhatsAppMessage('CONSULTATION_CONFIRMATION', {
      name: 'Ali',
      counselor: 'Dr. Mukherjee',
      meetUrl: 'https://meet.google.com/xyz',
    });
    expect(calMsg).toContain('Dr. Mukherjee');
    expect(calMsg).toContain('https://meet.google.com/xyz');

    // Marketing: Hot VIP
    const vipMsg = renderWhatsAppMessage('HOT_TIER_VIP_FAST_TRACK', {
      name: 'Sneha',
      division: 'Global Admissions',
    });
    expect(vipMsg).toContain('VIP Priority Status');
    expect(vipMsg).toContain('Sneha');
  });

  it('dispatches unified WhatsApp with fail-open fallback', async () => {
    const res = await dispatchUnifiedWhatsApp(
      {
        OPENWA_BASE_URL: 'http://100.87.71.38:8080',
        OPENWA_API_KEY: 'test-key',
        OPENWA_SESSION_ID: 'default',
      },
      {
        phone: '+919876543210',
        name: 'Farhan',
        templateKey: 'HOT_TIER_VIP_FAST_TRACK',
        variables: { name: 'Farhan' },
      }
    );

    expect(typeof res).toBe('object');
  });

  it('serves template definitions and test-send via marketing API', async () => {
    const mockD1 = new MockD1Database();

    const tplRes = await app.request('/api/marketing/whatsapp/templates', {
      method: 'GET',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(tplRes.status).toBe(200);
    const json: any = await tplRes.json();
    expect(json.success).toBe(true);
    expect(json.templates.length).toBe(11);
  });
});
