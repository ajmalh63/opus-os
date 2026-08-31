import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { documents, ocrRuns, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { validateMrz, extractMrzPairFromOcrText, icaoCheckDigit } from '../lib/ocr/mrzValidator.js';
import { sha256Hex } from '../lib/auditChain.js';

export const staffOcrRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string } }>();

// POST /api/staff/ocr/run — Staff-only MRZ validation (ICAO 9303) + signals
// Body: { documentId: string, mrzLine1?: string, mrzLine2?: string, ocrText?: string, vizFields?: { surname?, givenNames?, dob?, passportNumber?, expiry? } }
const runSchema = z.object({
  documentId: z.string().min(1),
  mrzLine1: z.string().optional(),
  mrzLine2: z.string().optional(),
  ocrText: z.string().optional(),
  vizFields: z.object({
    surname: z.string().optional(),
    givenNames: z.string().optional(),
    dob: z.string().optional(), // YYYY-MM-DD or YYMMDD
    passportNumber: z.string().optional(),
    expiry: z.string().optional(),
  }).optional(),
});

staffOcrRouter.post('/run', zValidator('json', runSchema), async (c) => {
  const db = getDb((c.env as any).DB);
  const body = c.req.valid('json');

  // Resolve authenticated staff from Hono context (set by rbacMiddleware)
  const user = (c as any).get?.('user') || (c as any).user;
  const actorId = user?.id || (c.get as any)?.('user')?.id;
  if (!actorId) return c.json({ error: 'Unauthorized' }, 401);

  const [doc] = await db.select().from(documents).where(eq(documents.id, body.documentId)).limit(1) as any[];
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Resolve MRZ lines: explicit > extract from ocrText
  let line1 = body.mrzLine1?.trim().toUpperCase();
  let line2 = body.mrzLine2?.trim().toUpperCase();
  if ((!line1 || !line2) && body.ocrText) {
    const pair = extractMrzPairFromOcrText(body.ocrText);
    if (pair) { line1 = pair.line1; line2 = pair.line2; }
  }
  if (!line1 || !line2) {
    return c.json({ error: 'MRZ lines required: provide mrzLine1+mrzLine2 (2×44) or ocrText containing MRZ', code: 'MRZ_REQUIRED' }, 400);
  }
  // Normalize: ensure 44 chars, OCR-B allowed chars
  line1 = line1.replace(/[^A-Z0-9<]/g, '').padEnd(44, '<').slice(0,44);
  line2 = line2.replace(/[^A-Z0-9<]/g, '').padEnd(44, '<').slice(0,44);

  const validation = validateMrz(line1, line2);

  // VIZ-MRZ cross-check if vizFields provided (staff has VIZ from form)
  const viz = body.vizFields || {};
  if (viz && validation.parsed) {
    const vizSurname = (viz.surname || '').toUpperCase().replace(/[^A-Z ]/g,'').trim();
    const mrzSurname = (validation.parsed.surname || '').toUpperCase().trim();
    const surnameMatch = !vizSurname || mrzSurname === vizSurname;
    const vizIdx = validation.signals.findIndex(s=>s.name==='viz_cross');
    if (vizIdx>=0) {
      validation.signals[vizIdx].pass = surnameMatch;
      validation.signals[vizIdx].note = surnameMatch ? 'VIZ surname matches MRZ' : `VIZ-MRZ surname mismatch: VIZ "${vizSurname}" vs MRZ "${mrzSurname}" — possible tamper or OCR error`;
      validation.signals[vizIdx].confidence = surnameMatch ? 0.92 : 0.95;
    }
  }

  // Compute rawHash for chain of custody (SHA-256 of MRZ lines + doc R2 key)
  const rawHash = await sha256Hex(`${line1}\n${line2}\n${doc.r2Key}`);

  const extractedJson = JSON.stringify({
    mrz: validation.parsed,
    checks: validation.checks,
    vizCross: viz,
    valid: validation.valid,
    linePair: validation.linePair,
  });
  const signalsJson = JSON.stringify(validation.signals);

  // Persist ocr_runs (staff audit trail, never client-visible)
  const runId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await db.insert(ocrRuns).values({
    id: runId,
    documentId: doc.id,
    actorId,
    modelVersion: 'mrz-v1-icao9303',
    signalsJson,
    extractedJson,
    rawHash,
    createdAt: Math.floor(Date.now()/1000),
  } as any);

  // Update documents with staff-only OCR payload (never exposed to portal)
  await db.update(documents).set({
    ocrJson: extractedJson,
    ocrSignals: signalsJson,
  } as any).where(eq(documents.id, doc.id));

  await auditEvent(c as any, {
    action: 'OCR_RAN',
    entityName: 'documents',
    entityId: doc.id,
    category: 'document',
    afterState: { valid: validation.valid, compositePass: validation.compositePass, signals: validation.signals, rawHash },
  } as any).catch(()=>{});

  // 2/4 must pass guard: mrz_layout + checksum_per_field are mandatory; composite is warning; viz_cross is advisory
  const mustPass = validation.signals.filter(s=> ['mrz_layout','checksum_per_field'].includes(s.name)).every(s=>s.pass);
  const status = mustPass ? (validation.valid ? 'pass' : 'manual_review') : 'manual_review';

  return c.json({
    success: true,
    documentId: doc.id,
    status, // pass | manual_review
    valid: validation.valid,
    compositePass: validation.compositePass,
    parsed: validation.parsed,
    checks: validation.checks,
    signals: validation.signals,
    rawHash,
    runId,
  });
});

// POST /api/staff/ocr/confirm — HITL confirm (staff edits + writes verified)
const confirmSchema = z.object({
  documentId: z.string().min(1),
  patchedFields: z.record(z.any()).optional(), // staff-edited extracted fields (e.g., surname correction)
  markVerified: z.boolean().default(false),
});

staffOcrRouter.post('/confirm', zValidator('json', confirmSchema), async (c) => {
  const db = getDb((c.env as any).DB);
  const body = c.req.valid('json');
  const user = (c as any).get?.('user') || (c as any).user;
  const actorId = user?.id || (c.get as any)?.('user')?.id;
  if (!actorId) return c.json({ error: 'Unauthorized' }, 401);

  const [doc] = await db.select().from(documents).where(eq(documents.id, body.documentId)).limit(1) as any[];
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Merge patched fields into existing ocrJson (staff is source of truth)
  let existing: any = {};
  try { existing = doc.ocrJson ? JSON.parse(doc.ocrJson) : {}; } catch {}
  const merged = { ...existing, patchedFields: body.patchedFields || {}, confirmedBy: actorId, confirmedAt: Math.floor(Date.now()/1000) };

  const updates: any = { ocrJson: JSON.stringify(merged) };
  if (body.markVerified) {
    updates.status = 'verified';
    updates.verifiedAt = Math.floor(Date.now()/1000);
  }

  await db.update(documents).set(updates).where(eq(documents.id, doc.id));

  await auditEvent(c as any, {
    action: 'OCR_CONFIRMED',
    entityName: 'documents',
    entityId: doc.id,
    category: 'document',
    afterState: { patchedFields: body.patchedFields, markVerified: body.markVerified, actorId },
  } as any).catch(()=>{});

  return c.json({ success: true, documentId: doc.id, status: updates.status || doc.status, ocrJson: merged });
});
