import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { esignInitSchema, esignCallbackSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { agreements, consents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Aadhaar eSign — provider-agnostic adapter (Section 11, gov CCA eSign API).
//
// Works with any CCA-licensed Aadhaar eSign Service Provider (ESP):
//   surepass | protean (ex-NSDL) | emudhra | veri5
// All implement the same MeitY eSign flow behind the scenes:
//   hash-signed token request -> redirect signer to ESP -> ESP POSTs signed
//   result to our callback URL -> we verify the returned sha256 hash -> finalize.
//
// Hash scheme (mirrors Veri5/CCA): sha256(agreementId|requestId|status|ESIGN_SALT)
// We fail CLOSED: if ESIGN_SALT is missing we refuse to verify anything.

type EsignBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  ESIGN_PROVIDER?: string;
  ESIGN_BASE_URL?: string;
  ESIGN_API_KEY?: string;
  ESIGN_SALT?: string;
  ESIGN_CALLBACK_URL?: string;
};

export const esignRouter = new Hono<{ Bindings: EsignBindings } & { Variables: Record<string, unknown> }>();
export const esignWebhookRouter = new Hono<{ Bindings: EsignBindings }>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/agreements/:id/esign/init — { esignMethod, signerDocFingerprint? }
// Creates a provider token and marks the agreement 'pending'. Returns the
// redirect URL the frontend should send the signer to.
esignRouter.post('/:id/esign/init', zValidator('json', esignInitSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  if (!c.env.ESIGN_PROVIDER || !c.env.ESIGN_SALT) {
    return c.json({ error: "eSign provider not configured. Set ESIGN_PROVIDER + ESIGN_SALT." }, 503);
  }

  const db = getDb(c.env.DB);
  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: "Agreement not found" }, 404);
    if (agreement.status === 'signed') return c.json({ error: "Agreement already signed" }, 400);

    // Hash-signed requestId (provider-agnostic, mirrors CCA/Veri5 token scheme)
    const requestId = `op-${agreementId}-${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
    const hash = await sha256Hex(`${agreementId}|${requestId}|pending|${c.env.ESIGN_SALT}`);

    // Persist pending esign state
    await db.update(agreements).set({
      esignMethod: data.esignMethod,
      esignProvider: c.env.ESIGN_PROVIDER,
      esignToken: requestId,
      esignStatus: 'pending'
    }).where(eq(agreements.id, agreementId));

    // Build the provider's signer URL. Any CCA ESP accepts an unsigned token it
    // will validate for the duration of the signing session.
    const base = c.env.ESIGN_BASE_URL || `https://esign-client.surepass.io/`;
    const esignUrl = `${base}?token=${encodeURIComponent(hash)}&requestId=${encodeURIComponent(requestId)}`;

    return c.json({
      success: true,
      requestId,
      esignUrl,
      provider: c.env.ESIGN_PROVIDER,
      message: "Redirect the signer to esignUrl to authenticate + sign."
    });
  } catch (error: any) {
    return c.json({ error: "Failed to initiate eSign", details: error.message }, 500);
  }
});

// GET /api/agreements/:id/esign/status
esignRouter.get('/:id/esign/status', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, c.req.param('id'))).get();
    if (!agreement) return c.json({ error: "Agreement not found" }, 404);
    return c.json({
      success: true,
      id: agreement.id,
      esignStatus: agreement.esignStatus || 'none',
      esignMethod: agreement.esignMethod || null,
      esignProvider: agreement.esignProvider || null,
      signedAt: agreement.signedAt || null
    });
  } catch (error: any) {
    return c.json({ error: "Failed to read eSign status", details: error.message }, 500);
  }
});

// POST /api/public/esign/callback — provider POSTs signed result here (no session).
// We verify `signature = sha256(agreementId|requestId|status|ESIGN_SALT)` then finalize.
esignWebhookRouter.post('/', zValidator('json', esignCallbackSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  if (!c.env.ESIGN_SALT) return c.json({ error: "ESIGN_SALT not configured — cannot verify" }, 503);

  const db = getDb(c.env.DB);
  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, data.agreementId)).get();
    if (!agreement) return c.json({ error: "Agreement not found" }, 404);
    if (agreement.status === 'signed') return c.json({ success: true, message: "Already signed" });

    // Fail closed: requestId must match the token we issued, hash must verify.
    if (agreement.esignToken !== data.requestId) {
      return c.json({ error: "requestId mismatch — possible replay/forgery" }, 401);
    }
    const expected = await sha256Hex(`${data.agreementId}|${data.requestId}|${data.status}|${c.env.ESIGN_SALT}`);
    if (expected !== data.signature) {
      return c.json({ error: "signature verification failed" }, 400);
    }

    if (data.status === 'signed') {
      const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'eSign Provider';

      // Reuse the DPDP evidentiary hash of the agreement content.
      const hash = await sha256Hex(agreement.content);

      await db.update(agreements).set({
        status: 'signed',
        esignStatus: 'signed',
        esignSignedDocKey: data.signedDocKey || agreement.esignSignedDocKey,
        ipAddress,
        userAgent,
        sha256Hash: hash,
        signedAt: Math.floor(Date.now() / 1000)
      }).where(eq(agreements.id, data.agreementId));

      // Consent notice (matches agreements.ts route behavior)
      const notice = `OpusOS Agreement ${data.agreementId} e-signed via Aadhaar (provider: ${agreement.esignProvider || 'unknown'}) with hash ${hash}.`;
      const noticeHash = await sha256Hex(notice);
      await db.insert(consents).values({
        id: crypto.randomUUID(),
        clientId: agreement.clientId,
        consentType: 'core-processing',
        status: 'granted',
        ipAddress,
        sha256Hash: noticeHash,
        grantedAt: Math.floor(Date.now() / 1000)
      });

      return c.json({ success: true, status: 'signed', sha256Hash: hash });
    }

    // failed / refused — record state, leave agreement unsent
    await db.update(agreements).set({ esignStatus: data.status }).where(eq(agreements.id, data.agreementId));
    return c.json({ success: true, status: data.status, message: "eSign not completed" });
  } catch (error: any) {
    return c.json({ error: "Failed to process eSign callback", details: error.message }, 500);
  }
});