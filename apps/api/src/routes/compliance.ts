import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, payments, engagements, purchaseInvoices, tdsRecords, tcsRecords, businessProfile, statutoryRegisters } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const complianceRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

const ADMIN = ['super_admin', 'manager'];

// Helper: epoch -> YYYY-MM (financial period)
function periodOf(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper: GSTIN validation (2-digit state + 10-char PAN + 2 + 1 + 1)
export function validGstin(g: string | null | undefined): boolean {
  if (!g) return false;
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.trim().toUpperCase());
}

// ============================================================
// 1. GET /api/compliance/gstr1?period=YYYY-MM
//    Builds GSTR-1 JSON (schema v1.7 style): b2b, b2cs, hsn, cdnr
//    from D1 payments (outward supplies with GST split stored).
// ============================================================
complianceRouter.get('/gstr1', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const period = c.req.query('period') || periodOf(Math.floor(Date.now() / 1000));

  try {
    const profile = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
    const allPayments = await db.select().from(payments).all();
    const allClients = await db.select().from(clients).all();
    const allEngagements = await db.select().from(engagements).all();

    const clientMap = new Map(allClients.map(cl => [cl.id, cl]));
    const engMap = new Map(allEngagements.map(e => [e.id, e]));

    const b2b: any[] = [];
    const b2cs: Record<string, any> = {}; // aggregate by rate + POS
    const hsn: Record<string, any> = {}; // HSN summary by rate
    const cdnr: any[] = [];
    const docSummary: Record<string, number> = {};

    const hsnJson = profile?.hsnJson ? JSON.parse(profile.hsnJson) : {};
    const rateJson = profile?.gstRateJson ? JSON.parse(profile.gstRateJson) : {};

    for (const p of allPayments) {
      if (periodOf(p.createdAt) !== period) continue;
      if (p.type !== 'invoice' && p.type !== 'charge') continue;
      if (!p.taxableAmount && p.taxableAmount !== 0) continue;

      const client = clientMap.get(p.clientId);
      const eng = engMap.get(p.engagementId);
      const division = eng?.division || 'study-abroad';
      const sac = hsnJson[division] || '9983';
      const ratePct = rateJson[division] || 18;
      const rate = ratePct * 100; // basis points

      const txval = p.taxableAmount;
      const cgst = p.cgst || 0;
      const sgst = p.sgst || 0;
      const igst = p.igst || 0;
      const pos = (client && typeof (client as any).state === 'string' ? (client as any).state : '36') || '36';

      // HSN summary (Table 12)
      const hKey = `${sac}|${rate}`;
      if (!hsn[hKey]) hsn[hKey] = { hsn_sc: sac, desc: '', uqc: 'NOS', qty: 1, val: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      hsn[hKey].val += p.amount;
      hsn[hKey].txval += txval;
      hsn[hKey].iamt += igst;
      hsn[hKey].camt += cgst;
      hsn[hKey].samt += sgst;

      // Document summary (Table 13)
      docSummary['INV'] = (docSummary['INV'] || 0) + 1;

      // B2B if client has valid GSTIN else B2C (Table 4 vs 6A/7)
      const clientGstin = (client as any)?.gstin;
      if (validGstin(clientGstin)) {
        let sellerInv = b2b.find(b => b.ctin === clientGstin.trim());
        if (!sellerInv) {
          sellerInv = { ctin: clientGstin.trim(), cfs: 'N', pos, inv: [] };
          b2b.push(sellerInv);
        }
        sellerInv.inv.push({
          inum: p.id.slice(0, 16),
          idt: new Date(p.createdAt * 1000).toISOString().slice(0, 10),
          val: p.amount,
          pos,
          rchrg: 'N',
          itms: [{ num: 1, itcd: sac, rt: rate, txval, camt: cgst, samt: sgst, iamt: igst }],
        });
      } else {
        const key = `${rate}|${pos}`;
        if (!b2cs[key]) b2cs[key] = { rt: rate, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0, pos };
        b2cs[key].txval += txval;
        b2cs[key].iamt += igst;
        b2cs[key].camt += cgst;
        b2cs[key].samt += sgst;
      }
    }

    // Refunds -> CDNR (credit notes)
    for (const p of allPayments) {
      if (periodOf(p.createdAt) !== period || p.type !== 'refund') continue;
      const client = clientMap.get(p.clientId);
      const clientGstin = (client as any)?.gstin;
      if (validGstin(clientGstin)) {
        let cdn = cdnr.find(x => x.ctin === clientGstin.trim());
        if (!cdn) { cdn = { ctin: clientGstin.trim(), cfs: 'N', nt: [] }; cdnr.push(cdn); }
        cdn.nt.push({
          ntty: 'C', nt_num: p.id.slice(0, 16), nt_dt: new Date(p.createdAt * 1000).toISOString().slice(0, 10),
          rsn: '02', inum: '', idt: '', val: p.amount,
          itms: [{ num: 1, itcd: '9983', rt: 1800, txval: p.taxableAmount || 0, camt: 0, samt: 0, iamt: 0 }],
        });
      }
    }

    const gstr1 = {
      gstin: profile?.gstin || '',
      fp: period,
      version: '1.7',
      etin: '',
      b2b,
      b2cs: Object.values(b2cs),
      hsn: Object.values(hsn),
      cdnr,
      cdnur: [],
      doc_issue: Object.keys(docSummary).map(k => ({ doc_typ: k, num: docSummary[k] })),
      exp: [],
    };

    return c.json({
      success: true,
      period,
      gstin: profile?.gstin || '',
      data: gstr1,
      stats: { b2bInvoices: b2b.reduce((a, b) => a + b.inv.length, 0), b2cLines: Object.keys(b2cs).length, hsnLines: Object.keys(hsn).length, creditNotes: cdnr.length },
    });
  } catch (error: any) {
    return c.json({ error: "GSTR-1 generation failed", details: error.message }, 500);
  }
});

// ============================================================
// 2. GET /api/compliance/gstr3b?period=YYYY-MM
// ============================================================
complianceRouter.get('/gstr3b', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const period = c.req.query('period') || periodOf(Math.floor(Date.now() / 1000));

  try {
    const profile = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
    const allPayments = await db.select().from(payments).all();
    const allPurchases = await db.select().from(purchaseInvoices).all();

    let txval = 0, iamt = 0, camt = 0, samt = 0;
    for (const p of allPayments) {
      if (periodOf(p.createdAt) !== period) continue;
      if (p.type !== 'invoice' && p.type !== 'charge') continue;
      txval += p.taxableAmount || 0;
      iamt += p.igst || 0;
      camt += p.cgst || 0;
      samt += p.sgst || 0;
    }

    // ITC from purchases (input)
    let itcIgst = 0, itcCgst = 0, itcSgst = 0;
    let eligibleItc = 0;
    for (const p of allPurchases) {
      if (periodOf(p.invoiceDate) !== period) continue;
      if (!p.itcClaimable) continue;
      itcIgst += p.igst || 0;
      itcCgst += p.cgst || 0;
      itcSgst += p.sgst || 0;
      eligibleItc += 1;
    }

    const totalTax = iamt + camt + samt;
    const totalItc = itcIgst + itcCgst + itcSgst;
    const netPayable = Math.max(0, totalTax - totalItc);

    const gstr3b = {
      gstin: profile?.gstin || '',
      fp: period,
      version: '1.0',
      gsup_det: { osup_det: { txval, iamt, camt, samt, csamt: 0 }, osup_zero: { txval: 0 }, osup_nil_exmp: { txval: 0 } },
      csup_det: { isup_details: { txval: 0, iamt: 0, csamt: 0 } },
      inter_sup: { unreg_details: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 } },
      itc_elg: {
        itc_avl: { iamt: itcIgst, camt: itcCgst, samt: itcSgst, csamt: 0, txval: 0 },
        itc_rev: { iamt: 0, camt: 0, samt: 0, csamt: 0, txval: 0 },
        itc_net: { iamt: itcIgst, camt: itcCgst, samt: itcSgst, csamt: 0, txval: 0 },
      },
      sup_details: {
        osup_zero: { txval: 0 },
        osup_nil_exmp: { txval: 0 },
        isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
        osup_det: { txval, iamt, camt, samt, csamt: 0 },
        osup_nongst: { txval: 0 },
      },
    };

    return c.json({
      success: true,
      period,
      gstin: profile?.gstin || '',
      data: gstr3b,
      computed: { outputTax: totalTax, inputItc: totalItc, netPayable, eligiblePurchases: eligibleItc },
    });
  } catch (error: any) {
    return c.json({ error: "GSTR-3B generation failed", details: error.message }, 500);
  }
});

// ============================================================
// 3. POST /api/compliance/reconcile-2b  { period, gstr2b }
//    Import GSTR-2B JSON from the GST portal; match against D1 purchase invoices.
// ============================================================
const reconcileSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  gstr2b: z.any(), // portal JSON (docdata.b2b[].doclist)
});

complianceRouter.post('/reconcile-2b', zValidator('json', reconcileSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const purchases = await db.select().from(purchaseInvoices).all();
    const booksMap = new Map(purchases.map(p => [`${(p.vendorGstin || '').trim()}|${p.invoiceNumber.trim()}`, p]));

    const matched: any[] = [];
    const mismatched: any[] = [];
    const booksOnly: any[] = [];
    const twoBOnly: any[] = [];

    const portalDocs = data.gstr2b?.docdata?.b2b || data.gstr2b?.docdata?.b2ba || [];
    const portalSet = new Set<string>();

    for (const b2b of portalDocs) {
      const supplierGstin = (b2b.ctin || '').trim();
      for (const inv of (b2b.doclist || [])) {
        const key = `${supplierGstin}|${(inv.inum || '').trim()}`;
        portalSet.add(key);
        const book = booksMap.get(key);
        if (!book) {
          twoBOnly.push({ gstin: supplierGstin, invoice: inv.inum, portalTaxable: inv.txval, portalGst: (inv.iamt || 0) + (inv.camt || 0) + (inv.samt || 0) });
        } else {
          const bookTaxable = book.taxableAmount;
          const match = bookTaxable === (inv.txval || 0);
          if (match) matched.push({ gstin: supplierGstin, invoice: inv.inum, taxable: inv.txval });
          else mismatched.push({ gstin: supplierGstin, invoice: inv.inum, booksTaxable: bookTaxable, portalTaxable: inv.txval, diff: bookTaxable - (inv.txval || 0) });
        }
      }
    }

    for (const p of purchases) {
      const key = `${(p.vendorGstin || '').trim()}|${p.invoiceNumber.trim()}`;
      if (!portalSet.has(key)) {
        booksOnly.push({ gstin: p.vendorGstin, invoice: p.invoiceNumber, booksTaxable: p.taxableAmount });
      }
    }

    return c.json({
      success: true,
      period: data.period,
      summary: { matched: matched.length, mismatched: mismatched.length, booksOnly: booksOnly.length, twoBOnly: twoBOnly.length },
      matched, mismatched, booksOnly, twoBOnly,
    });
  } catch (error: any) {
    return c.json({ error: "2B reconciliation failed", details: error.message }, 500);
  }
});

// ============================================================
// 4. GET /api/compliance/tds-tcs?period=YYYY-MM
//    TDS register (1026/1027/1028 codes) + TCS register.
// ============================================================
complianceRouter.get('/tds-tcs', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const period = c.req.query('period');

  try {
    let tds = await db.select().from(tdsRecords).all();
    let tcs = await db.select().from(tcsRecords).all();
    if (period) {
      tds = tds.filter(r => r.period === period);
      tcs = tcs.filter(r => r.period === period);
    }
    return c.json({ success: true, tds, tcs });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch TDS/TCS registers", details: error.message }, 500);
  }
});

// ============================================================
// 5. POST /api/compliance/business-profile (set GSTIN, HSN map, rates)
// ============================================================
const profileSchema = z.object({
  legalName: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  tan: z.string().optional(),
  stateCode: z.string().optional(),
  stateName: z.string().optional(),
  address: z.string().optional(),
  hsn: z.record(z.string()).optional(), // { division: sac }
  rates: z.record(z.number()).optional(), // { division: pct }
  autoConfirmEnabled: z.boolean().optional(),
  autoConfirmThresholdPaise: z.number().int().min(0).optional(),
});

complianceRouter.post('/business-profile', zValidator('json', profileSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const existing = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
    const now = Math.floor(Date.now() / 1000);
    const hsn = existing?.hsnJson ? JSON.parse(existing.hsnJson) : {};
    const rates = existing?.gstRateJson ? JSON.parse(existing.gstRateJson) : {};
    if (data.hsn) Object.assign(hsn, data.hsn);
    if (data.rates) Object.assign(rates, data.rates);

    if (existing) {
      await db.update(businessProfile).set({
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.gstin !== undefined ? { gstin: data.gstin } : {}),
        ...(data.pan !== undefined ? { pan: data.pan } : {}),
        ...(data.tan !== undefined ? { tan: data.tan } : {}),
        ...(data.stateCode !== undefined ? { stateCode: data.stateCode } : {}),
        ...(data.stateName !== undefined ? { stateName: data.stateName } : {}),
...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.autoConfirmEnabled !== undefined ? { autoConfirmEnabled: data.autoConfirmEnabled } : {}),
        ...(data.autoConfirmThresholdPaise !== undefined ? { autoConfirmThresholdPaise: data.autoConfirmThresholdPaise } : {}),
        hsnJson: JSON.stringify(hsn),
        gstRateJson: JSON.stringify(rates),
        updatedAt: now,
      }).where(eq(businessProfile.id, 'main'));
    } else {
      await db.insert(businessProfile).values({
        id: 'main',
        legalName: data.legalName || null,
        gstin: data.gstin || null,
        pan: data.pan || null,
        tan: data.tan || null,
        stateCode: data.stateCode || null,
        stateName: data.stateName || null,
address: data.address || null,
        autoConfirmEnabled: data.autoConfirmEnabled ?? false,
        autoConfirmThresholdPaise: data.autoConfirmThresholdPaise ?? 0,
        hsnJson: JSON.stringify(hsn),
        gstRateJson: JSON.stringify(rates),
        updatedAt: now,
      });
    }
    return c.json({ success: true, message: "Business profile saved." });
  } catch (error: any) {
    return c.json({ error: "Failed to save business profile", details: error.message }, 500);
  }
});

// ============================================================
// 6. GET /api/compliance/business-profile
// ============================================================
complianceRouter.get('/business-profile', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const profile = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
    return c.json({ success: true, profile });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch business profile", details: error.message }, 500);
  }
});

// ============================================================
// 7. POST /api/compliance/tds + POST /api/compliance/tcs (record)
// ============================================================
const tdsSchema = z.object({
  vendorName: z.string().min(1),
  payeePan: z.string().optional(),
  section: z.enum(['194J', '194C', '194H']),
  code: z.enum(['1026', '1027', '1028']),
  invoiceNumber: z.string().optional(),
  grossAmount: z.number().int().positive(),
  tdsAmount: z.number().int().positive(),
  challanRef: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});
complianceRouter.post('/tds', zValidator('json', tdsSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.insert(tdsRecords).values({
      id: crypto.randomUUID(),
      vendorName: data.vendorName,
      payeePan: data.payeePan || null,
      section: data.section,
      code: data.code,
      invoiceNumber: data.invoiceNumber || null,
      paymentDate: Math.floor(Date.now() / 1000),
      grossAmount: data.grossAmount,
      tdsAmount: data.tdsAmount,
      challanRef: data.challanRef || null,
      period: data.period,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return c.json({ success: true, message: "TDS recorded." });
  } catch (error: any) {
    return c.json({ error: "Failed to record TDS", details: error.message }, 500);
  }
});

const tcsSchema = z.object({
  clientName: z.string().min(1),
  pan: z.string().optional(),
  taxableAmount: z.number().int().positive(),
  tcsAmount: z.number().int().positive(),
  fyAmount: z.number().int().default(0),
  section: z.string().default('206C(1H)'),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});
complianceRouter.post('/tcs', zValidator('json', tcsSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.insert(tcsRecords).values({
      id: crypto.randomUUID(),
      clientName: data.clientName,
      pan: data.pan || null,
      taxableAmount: data.taxableAmount,
      tcsAmount: data.tcsAmount,
      fyAmount: data.fyAmount,
      section: data.section,
      period: data.period,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return c.json({ success: true, message: "TCS recorded." });
  } catch (error: any) {
    return c.json({ error: "Failed to record TCS", details: error.message }, 500);
  }
});

// ============================================================
// 8. EMPLOYER COMPLIANCE REGISTERS (Â§14.5.4) â€” PT / LWF / PF / ESI
// ============================================================

const statutorySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  type: z.enum(['pt', 'lwf', 'pf', 'esi']),
  employeeName: z.string().min(1),
  employeeId: z.string().optional(),
  wageAmount: z.number().int().min(0),        // paise
  deductionPaise: z.number().int().min(0),     // paise
  employerShare: z.number().int().min(0).optional(),
  dueDate: z.string().optional(),
  status: z.enum(['pending', 'paid', 'overdue']).default('pending'),
  notes: z.string().optional(),
});

// GET /api/compliance/statutory?month=YYYY-MM&type=pt â€” statutory register
complianceRouter.get('/statutory', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const month = c.req.query('month');
  const type = c.req.query('type') as any;

  try {
    let rows = await db.select().from(statutoryRegisters).all();
    if (month) rows = rows.filter(r => r.month === month);
    if (type) rows = rows.filter(r => r.type === type);
    rows.sort((a: any, b: any) => b.createdAt - a.createdAt);

    const byType: Record<string, { rows: any[]; totalWage: number; totalDeduction: number; paid: number; pending: number }> = {};
    for (const r of rows) {
      const key = r.type;
      byType[key] = byType[key] || { rows: [], totalWage: 0, totalDeduction: 0, paid: 0, pending: 0 };
      byType[key].rows.push(r);
      byType[key].totalWage += r.wageAmount;
      byType[key].totalDeduction += r.deductionPaise + (r.employerShare ?? 0);
      if (r.status === 'paid') byType[key].paid++; else byType[key].pending++;
    }
    return c.json({ registers: rows, summary: byType, month, type: type || null });
  } catch (error: any) {
    return c.json({ error: "Statutory register lookup failed", details: error.message }, 500);
  }
});

// POST /api/compliance/statutory â€” record an employee statutory entry
complianceRouter.post('/statutory', zValidator('json', z.object({ entries: z.array(statutorySchema).min(1).max(200) })), async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  try {
    for (const e of data.entries) {
      await db.insert(statutoryRegisters).values({
        id: crypto.randomUUID(),
        month: e.month,
        type: e.type,
        employeeName: e.employeeName,
        employeeId: e.employeeId || null,
        wageAmount: e.wageAmount,
        deductionPaise: e.deductionPaise,
        employerShare: e.employerShare ?? 0,
        dueDate: e.dueDate || null,
        status: e.status,
        notes: e.notes || null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return c.json({ success: true, count: data.entries.length, message: `Statutory register updated (${data.entries.length} entry/entries).` });
  } catch (error: any) {
    return c.json({ error: "Statutory register write failed", details: error.message }, 500);
  }
});

// PATCH /api/compliance/statutory/:id â€” mark paid/overdue, edit note
complianceRouter.patch('/statutory/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status?: 'pending' | 'paid' | 'overdue'; notes?: string };
  const now = Math.floor(Date.now() / 1000);

  try {
    const patch: any = { updatedAt: now };
    if (body.status) {
      patch.status = body.status;
      if (body.status === 'paid') patch.paidAt = now;
    }
    if (typeof body.notes === 'string') patch.notes = body.notes;
    await db.update(statutoryRegisters).set(patch).where(eq(statutoryRegisters.id, id)).run();
    return c.json({ success: true, message: "Statutory entry updated." });
  } catch (error: any) {
    return c.json({ error: "Statutory entry update failed", details: error.message }, 500);
  }
});
