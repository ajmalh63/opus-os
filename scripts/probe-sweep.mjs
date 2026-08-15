import { chromium } from 'playwright-core';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const out = [];
for (const path of ['/', '/lead-form', '/study-abroad', '/umrah-travel', '/attestation', '/recruitment', '/login', '/signup', '/portal', '/partner', '/payment-confirmed', '/workspaces']) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({ rootLen: (document.getElementById('root')?.innerHTML || '').length }));
  out.push(path + '=' + (info.rootLen > 0 ? 'OK(' + info.rootLen + ')' : 'EMPTY'));
}
console.log(out.join(' | '));
await browser.close();
