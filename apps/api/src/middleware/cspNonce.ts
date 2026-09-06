import type { MiddlewareHandler } from 'hono';

/**
 * Strict CSP nonce middleware — OWASP Cheat Sheet + MDN + web.dev gold standard.
 * Generates a cryptographically strong 128-bit nonce per HTTP response,
 * injects it into the Content-Security-Policy header, and stamps it onto
 * any <style>/<link rel=stylesheet>/<script> tags in HTML responses.
 *
 * Why per-request? MDN: "A nonce must be different for every HTTP response
 * and must not be predictable." Reusing a nonce lets an attacker replay it.
 * Why WebCrypto? workers-best-practices: use crypto.getRandomValues, never Math.random.
 */
export const cspNonce: MiddlewareHandler = async (c, next) => {
  let nonce = '';
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    try { nonce = btoa(binary); } catch { nonce = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24); }
    c.set('cspNonce' as any, nonce);
  } catch (e:any) {
    console.error('[cspNonce] nonce gen failed', e?.message);
    // Fail-open: continue without nonce (better than 500)
    return next();
  }

  try {
    await next();
  } catch (e:any) {
    console.error('[cspNonce] next() threw', e?.message);
    throw e;
  }

  try {
    const scriptSrc = `'self'${nonce ? ` 'nonce-${nonce}'` : ''} 'strict-dynamic' https: https://challenges.cloudflare.com https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com`;
    const styleSrc = `'self'${nonce ? ` 'nonce-${nonce}'` : ''} https://fonts.googleapis.com`;
    const policy = [
      `default-src 'self'`,
      `script-src ${scriptSrc}`,
      `style-src ${styleSrc}`,
      `font-src 'self' https://fonts.gstatic.com`,
      `img-src 'self' data: https:`,
      `connect-src 'self' https://api.cal.com https://api.razorpay.com https://challenges.cloudflare.com https://cloudflareinsights.com https://www.googletagmanager.com https://www.google-analytics.com`,
      `frame-src 'self' https://challenges.cloudflare.com https://checkout.razorpay.com https://chat.opusoverseas.com https://*.opusoverseas.com`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `frame-ancestors 'none'`,
    ].join('; ');
    try { c.header('Content-Security-Policy', policy); } catch {}
    if (c.env && (c.env as any).ENVIRONMENT !== 'production') {
      try { c.header('Content-Security-Policy-Report-Only', policy); } catch {}
    }
    // Only mutate HTML responses (skip JSON for OTP etc.)
    try {
      const ct = c.res?.headers?.get('content-type') || '';
      if (ct.includes('text/html') && c.res) {
        const html = await c.res.text();
        const stamped = html
          .replace(/<style(?![^>]*\bnonce=)/g, `<style nonce="${nonce}"`)
          .replace(/<link(?=[^>]*rel="stylesheet")(?![^>]*\bnonce=)/g, `<link nonce="${nonce}"`)
          .replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`);
        c.res = new Response(stamped, { status: c.res.status, headers: c.res.headers });
        try { c.header('Content-Security-Policy', policy); } catch {}
      }
    } catch (e:any) {
      console.error('[cspNonce] html stamp failed', e?.message);
    }
  } catch (e:any) {
    console.error('[cspNonce] header failed', e?.message);
  }
};
