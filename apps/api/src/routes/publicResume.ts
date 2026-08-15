import { Hono } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';
import { guardUpload } from '../infra/uploadGuard.js';
import { createStaffAlert } from '../infra/staffAlerts.js';

// Public resume intake for the Manpower division (§4 / §14.6).
//  - Turnstile-guarded (mount-level, index.ts) + rate-limited 10/hr/IP
//  - OWASP upload hardening: resume extension allowlist, 5 MB cap, magic-byte
//    sniffing (Content-Type header is never trusted)
//  - Owner-binding: an optional `token` field stores the object under the
//    client's prefix; the pre-login lead form omits it (unbound until the
//    application carries the resumeKey into the CRM record).
//  - Returns the object key ONLY (files are never exposed without auth).

export const publicResumeRouter = new Hono<{
  Bindings: { DB: D1Database; BUCKET?: R2Bucket; TURNSTILE_SECRET_KEY?: string };
}>();

publicResumeRouter.use('/', rateLimit({ bucket: 'resume-upload', windowSeconds: 3600, limit: 10 }));

publicResumeRouter.post('/', async (c) => {
  if (!c.env?.BUCKET) return c.json({ error: 'Document vault not configured' }, 503);

  try {
    const body = await c.req.parseBody();
    const file = body.resume as File | undefined;
    if (!file) return c.json({ error: 'Missing resume file (field name: resume)' }, 400);

    const token = String(body.token || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const guard = guardUpload('resume', file.name, bytes.byteLength, bytes);
    if (!guard.ok) return c.json({ error: guard.error }, (guard.status || 400) as any);

    const ext = guard.ext!;
    const mimeType = guard.mimeType!;
    const key = `resumes/${token || 'anon'}/${crypto.randomUUID()}${ext}`;
    await c.env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType: mimeType, contentDisposition: 'inline' },
      customMetadata: { uploaded: String(Math.floor(Date.now() / 1000)), source: 'manpower-public', clientToken: token || '' },
    });

    await createStaffAlert(c.env as any, { division: 'manpower', type: 'resume_upload', title: 'Resume uploaded', body: token ? `Client ${token} uploaded a resume` : 'Public resume uploaded', clientId: token || null, payload: { resumeKey: key } });
    return c.json({ success: true, resumeKey: key, mimeType, size: bytes.byteLength, message: 'Resume uploaded. Include this key in your application.' });
  } catch (error: any) {
    return c.json({ error: 'Resume upload failed', details: error.message }, 500);
  }
});
