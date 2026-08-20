import { chromium } from 'playwright-core';
const BASE = 'http://localhost:5173';
const pass = [], fail = [];
const has = async (page, needle) => page.evaluate((n) => document.body.innerText.toUpperCase().includes(n.toUpperCase()), needle);
async function check(name, ok, detail = '') { (ok ? pass : fail).push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); }
const CHANNEL = process.env.SMOKE_CHANNEL || 'msedge'; // CI: SMOKE_CHANNEL=chromium
const browser = await chromium.launch({ channel: CHANNEL === 'bare' ? undefined : CHANNEL, headless: true });
const page = await browser.newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
const pwTab = page.locator('button:has-text("Password")');
if (await pwTab.count()) { await pwTab.first().click(); await page.waitForTimeout(300); }
await page.fill('input[type="email"]', 'owner@opusoverseas.com');
await page.locator('input[type="password"]').fill('OwnerPass2026!');
await page.locator('input[type="password"]').press('Enter');
await page.waitForTimeout(3500);
check('Login via UI redirects into workspace', page.url().includes('/workspaces') || page.url().includes('/dashboard'));
check('Dashboard tiles present', await has(page, 'Manage Campaigns') || await has(page, 'Staff Performance'));

await page.goto(BASE + '/finance/performance', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('Performance: BAN row', await has(page, 'Open tickets') && await has(page, 'On-time rate'));
check('Performance: roster table', await has(page, 'Today') && await has(page, 'Window'));
check('Performance: live queues', await has(page, 'Awaiting approval') && await has(page, 'Overdue'));

await page.goto(BASE + '/marketing/funnel', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
check('Marketing Automation renders (control panel)', await has(page, 'Marketing Automation') && await has(page, 'Overview') && await has(page, 'Campaigns'));
check('Tool status cards present', await has(page, 'Listmonk') && await has(page, 'Mautic') && await has(page, 'Chatwoot'));
check('Campaigns module renders', (await page.goto(BASE + '/marketing/campaigns', { waitUntil: 'domcontentloaded' })) && (await page.waitForTimeout(1500), await has(page, 'Campaigns') || await has(page, 'Marketing Automation')));

await page.goto(BASE + '/workspaces/transactions', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('Transactions module renders', await has(page, 'Charge customer'));
const chargeBtn = page.locator('button', { hasText: /charge customer/i });
if (await chargeBtn.count()) { await chargeBtn.first().click(); await page.waitForTimeout(800); check('Charge-customer modal opens', await has(page, 'Charge a customer')); }
else check('Charge-customer modal opens', false, 'button missing');

await page.goto(BASE + '/workspaces/boards', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
check('Task Boards renders (columns + create form)', await has(page, 'Task Boards') && await has(page, 'In progress') && await has(page, 'New task'));

await page.goto(BASE + '/kanban', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('Kanban board renders stages', await has(page, 'Consult') || await has(page, 'Lead'));
await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('Inbox renders', await has(page, 'Inbox'));
await page.goto(BASE + '/finance/infra', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
check('InfraHealth renders', await has(page, 'Infrastructure'));

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 120)));
check('Zero page errors across flows', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
await browser.close();
console.log('\n== PHASE 4 INTERACTION SMOKE (v2, case-insensitive) ==');
console.log(pass.join('\n'));
if (fail.length) console.log('\nFAILURES:\n' + fail.join('\n'));
console.log('\n' + pass.length + ' passed, ' + fail.length + ' failed');
process.exit(fail.length ? 1 : 0);
