import { Hono } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';

// Public resume intake for the Manpower division (§4 / §14.6).
//  - Turnstile-guarded (mount-level, index.ts)
//  - Rate-limited 10/hr/IP
//  - Stores the PDF into R2 (BUCKET) under resumes/{clientToken}/resume.pdf
//    with application-layer versioning (no R2 object versioning, §3.2/18.3.1)
//  - Returns the object key ONLY (files are never exposed without auth).
// The intake call itself is the `.lead` flow: lead form uploads here first,
// gets a resumeKey, then includes it in dynamicContext.resumeFileKey.

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

    // Safety cap — resumes are text PDF/DOCX, never multi-MB blobs (§18.2.2)
    if (file.size > 5 * 1024 * 1024) return c.json({ error: 'Resume exceeds 5 MB limit' }, 413);

    const bytes = await file.arrayBuffer();
    const key = `resumes/${crypto.randomUUID()}.pdf`;
    await c.env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType: file.type || 'application/pdf', contentDisposition: 'inline' },
      customMetadata: { uploaded: String(Math.floor(Date.now() / 1000)), source: 'manpower-public' },
    });

    return c.json({ success: true, resumeKey: key, message: 'Resume uploaded. Include this key in your application.' });
  } catch (error: any) {
    return c.json({ error: 'Resume upload failed', details: error.message }, 500);
  }
});