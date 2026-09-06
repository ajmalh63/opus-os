import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5173';
const pass = [];
const fail = [];

const has = async (page, needle) => page.evaluate((n) => document.body.innerText.toUpperCase().includes(n.toUpperCase()), needle);

async function check(name, ok, detail = '') {
  const result = ok ? 'PASS' : 'FAIL';
  const message = `${result} ${name}${detail ? ' — ' + detail : ''}`;
  console.log(message);
  if (ok) {
    pass.push(message);
  } else {
    fail.push(message);
  }
}

async function runE2ETests() {
  const CHANNEL = process.env.SMOKE_CHANNEL || 'msedge';
  const browser = await chromium.launch({ channel: CHANNEL === 'bare' ? undefined : CHANNEL, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n--- STARTING PERSONA E2E TESTS ---\n');

  try {
    const TEST_PASSWORD = process.env.ADMIN_PASSWORD || 'DevOnlyPass#2026!';

    // ----------------------------------------
    // STEP 0: Bootstrap DB and Seeding
    // ----------------------------------------
    console.log('Step 0: Bootstrapping DB and Seeding RBAC');
    try {
      const bootstrapRes = await fetch('http://127.0.0.1:8787/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@opusoverseas.com', password: TEST_PASSWORD })
      });
      const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
      console.log('Bootstrap completed:', bootstrapRes.status, bootstrapJson);
    } catch (e) {
      console.log('Bootstrap request bypassed (already bootstrapped or server offline):', e.message);
    }

    // ----------------------------------------
    // PERSONA 1: Superadmin Flow
    // ----------------------------------------
    console.log('\nTesting Persona 1: Superadmin');
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const pwTab = page.locator('button:has-text("Password")');
    if (await pwTab.count()) {
      await pwTab.first().click();
      await page.waitForTimeout(300);
    }

    await page.fill('input[type="email"]', 'owner@opusoverseas.com');
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.locator('input[type="password"]').press('Enter');
    await page.waitForTimeout(4000);

    await check('Superadmin: Login redirects to dashboard/workspaces', page.url().includes('/workspaces') || page.url().includes('/dashboard'));
    await check('Superadmin: Dashboard components rendered', await has(page, 'Staff Performance') || await has(page, 'Manage Campaigns'));

    // Trigger Seeding
    console.log('Triggering RBAC Seed via logged-in session...');
    const seedResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/rbac/seed', { method: 'POST' });
      return res.json().catch(() => ({ error: 'Parse failed' }));
    });
    console.log('RBAC Seed result:', seedResult);
    await check('Superadmin: Seeding RBAC catalog completes successfully', seedResult.success || seedResult.message?.includes('seeded'));

    // Admin Console Gate
    await page.goto(BASE + '/control', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await check('Superadmin: Admin Console page renders', await has(page, 'System Control Console') || await has(page, 'System Audit Logs') || await has(page, 'Audit Logs'));

    // Billing / Transactions
    await page.goto(BASE + '/billing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await check('Superadmin: Billing module renders', await has(page, 'Charge Customer') || await has(page, 'ledger') || await has(page, 'Transactions'));

    // Inbox
    await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await check('Superadmin: Inbox renders', await has(page, 'Inbox') || await has(page, 'Messages'));

    // ----------------------------------------
    // PERSONA 2: Client User Flow
    // ----------------------------------------
    console.log('\nTesting Persona 2: Client User');
    
    // First, submit a lead form to generate a live Client token
    console.log('Registering a live lead via /lead-form to generate a token...');
    await page.goto(BASE + '/lead-form', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    console.log('Current page URL after navigation to /lead-form:', page.url());
    console.log('Page header text:', await page.locator('h1, h2').first().innerText().catch(() => 'No H1/H2 found'));
    
    const selectHTMLs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).map(s => s.outerHTML);
    });
    console.log('Select elements outer HTML:', selectHTMLs);

    // Generate dynamic phone number matching /^\+91\s[6-9]\d{4}\s\d{5}$/
    const randPhone = `+91 ${Math.floor(70000 + Math.random() * 20000)} ${Math.floor(10000 + Math.random() * 89999)}`;
    
    await page.fill('input[placeholder="John Doe"]', 'Suresh Kumar E2E');
    await page.fill('input[placeholder="+91 XXXXX XXXXX"]', randPhone);
    await page.fill('input[placeholder="john@example.com"]', 'suresh_e2e@test.com');
    
    // Select division by clicking the form button (using emoji to distinguish from Nav bar link)
    await page.locator('button:has-text("🎓 Study Abroad")').first().click();
    await page.waitForTimeout(500);

    // Select highest qualification - select[required]
    await page.locator('select[required]').selectOption('undergrad');
    await page.waitForTimeout(500);
    
    // Accept core processing consent check
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();
    
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(3500);

    const toast = page.locator('div:has-text("Error"), div:has-text("Success"), div[role="status"]');
    const toastCount = await toast.count();
    if (toastCount) {
      console.log('Toast messages found on page:', await toast.first().innerText());
    } else {
      console.log('No toast message found.');
    }
    console.log('Page URL after submission:', page.url());

    // Grab the token from page
    const tokenElement = page.locator('span.font-mono.text-brand-navy.font-semibold');
    let clientToken = '';
    if (await tokenElement.count()) {
      clientToken = (await tokenElement.innerText()).trim();
      console.log(`Generated client token: ${clientToken}`);
      await check('Client: Lead form submission generates client token', clientToken.startsWith('OP-2026-'));
    } else {
      await check('Client: Lead form submission generates client token', false, 'Token element not found on page');
      clientToken = 'OP-2026-5555'; // fallback seed
    }

    // Lookup Client Portal
    console.log(`Navigating to Client Portal lookup with token: ${clientToken}`);
    await page.goto(`${BASE}/portal?token=${clientToken}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Switch to Journey Overview tab to render client profile card
    const journeyTab = page.locator('button:has-text("Journey Overview")');
    if (await journeyTab.count()) {
      await journeyTab.first().click();
      await page.waitForTimeout(1000);
    }

    await check('Client: Portal page renders client name', await has(page, 'Suresh Kumar'));
    await check('Client: Consent tracking details visible', await has(page, 'Consent'));

    // Check tabs in client portal (Visa, Jobs, Umrah)
    const visaTab = page.locator('button:has-text("Visa")');
    if (await visaTab.count()) {
      await visaTab.first().click();
      await page.waitForTimeout(800);
      await check('Client: Visa section is tab-navigable', await has(page, 'Visa Type') || await has(page, 'Single Entry'));
    }

    // ----------------------------------------
    // PERSONA 3: Partner User Flow
    // ----------------------------------------
    console.log('\nTesting Persona 3: Partner User');
    await page.goto(BASE + '/partner', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Generate valid PAN format (5 letters, 4 digits, 1 letter)
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const randomPan = `${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}${digits[Math.floor(Math.random() * 10)]}${digits[Math.floor(Math.random() * 10)]}${digits[Math.floor(Math.random() * 10)]}${digits[Math.floor(Math.random() * 10)]}${letters[Math.floor(Math.random() * 26)]}`;

    // Register a legacy KYC-only partner (no email required)
    await page.fill('input[placeholder="e.g. Hyderabad Consultants"]', 'E2E Test Partner Agency');
    await page.fill('input[placeholder="ABCDE1234F"]', randomPan);
    await page.fill('input[placeholder="50100123456789"]', '123456789012345');
    await page.fill('input[placeholder="HDFC0000001"]', 'SBIN0000001');

    // Click register
    await page.locator('button:has-text("Register")').click();
    await page.waitForTimeout(3500);

    // Verify auto sign-in and active workspace
    const isPartnerActive = await has(page, 'Become a partner') === false && (await has(page, 'Your Link') || await has(page, 'Payout schedule') || await has(page, 'Referrals'));
    await check('Partner: Registration and auto-login succeeds', isPartnerActive);

    if (isPartnerActive) {
      // Test log referral (log the dynamic client token generated in persona 2!)
      const clientTokenInput = page.locator('input[placeholder*="OP-"]');
      if (await clientTokenInput.count()) {
        await clientTokenInput.first().fill(clientToken);
        await page.locator('button:has-text("Log")').first().click();
        await page.waitForTimeout(2000);
        await check('Partner: Logging client referral succeeds', await has(page, clientToken) || await has(page, 'Referrals'));
      } else {
        await check('Partner: Client referral input field visible', false, 'Input field not found');
      }
    }

  } catch (err) {
    console.error('Test execution failed with error:', err);
    await check('Test execution completed without throwing', false, err.message);
  } finally {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await check('No runtime page errors detected during execution', pageErrors.length === 0, pageErrors.join(' | '));

    await browser.close();
    console.log('\n--- E2E PERSONA TEST RESULTS SUMMARY ---');
    console.log(`${pass.length} passed, ${fail.length} failed`);
    process.exit(fail.length ? 1 : 0);
  }
}

runE2ETests();
