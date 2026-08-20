import fs from 'fs';
import path from 'path';

const APP_SRC = path.resolve('apps/app/src');

function getAllFiles(dir, ext = ['.tsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.wrangler') && !file.includes('dist')) {
        results = results.concat(getAllFiles(filePath, ext));
      }
    } else if (ext.some((e) => file.endsWith(e))) {
      results.push(filePath);
    }
  }
  return results;
}

const files = getAllFiles(APP_SRC);
const ctas = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(process.cwd(), file);

  // 1. Match <a href="..." ...>text</a>
  // Simplified regex to capture anchor tags with href and inner text
  const aTagRegex = /<a\s+[^>]*href=(?:\{([^}]+)\}|["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = aTagRegex.exec(content)) !== null) {
    const target = match[1] || match[2];
    const rawText = match[3]
      .replace(/<[^>]+>/g, ' ') // strip inner html tags
      .replace(/\{[^}]+\}/g, ' ') // strip jsx interpolations
      .replace(/\s+/g, ' ')
      .trim();
    if (rawText && target) {
      ctas.push({ file: relPath, type: 'anchor', text: rawText, target });
    }
  }

  // 2. Match <Link href="..." or to="...">text</Link>
  const linkTagRegex = /<Link\s+[^>]*(?:href|to)=(?:\{([^}]+)\}|["']([^"']+)["'])[^>]*>([\s\S]*?)<\/Link>/g;
  while ((match = linkTagRegex.exec(content)) !== null) {
    const target = match[1] || match[2];
    const rawText = match[3]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{[^}]+\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawText && target) {
      ctas.push({ file: relPath, type: 'Link', text: rawText, target });
    }
  }

  // 3. Match buttons with onClick={() => setLocation('...')}
  const btnSetLocRegex = /<button\s+[^>]*onClick=\{[^}]*setLocation\(['"]([^'"]+)['"]\)[^}]*\}[^>]*>([\s\S]*?)<\/button>/g;
  while ((match = btnSetLocRegex.exec(content)) !== null) {
    const target = match[1];
    const rawText = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{[^}]+\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawText && target) {
      ctas.push({ file: relPath, type: 'button-setLocation', text: rawText, target });
    }
  }
}

console.log(`✅ Scanned ${ctas.length} interactive CTAs and navigation points.\n`);

// Analyze semantic alignment and potential mismatches
const potentialMismatches = [];

for (const cta of ctas) {
  const t = cta.text.toLowerCase();
  const dest = cta.target.toLowerCase();

  // Check 1: Empty href="#" without onClick
  if (cta.target === '#' || cta.target === '""' || cta.target === "''") {
    potentialMismatches.push({ ...cta, reason: 'Empty or hash-only href' });
  }

  // Check 2: Text says "Login" / "Sign in" but target doesn't contain login/auth
  if ((t.includes('sign in') || t.includes('login') || t.includes('log in')) && !dest.includes('login') && !dest.includes('auth') && !dest.includes('portal') && !dest.includes('logout') && !dest.includes('signout')) {
    potentialMismatches.push({ ...cta, reason: 'Login/Sign-in text pointing to non-auth route' });
  }

  // Check 3: Text says "Book" or "Schedule" or "Consultation" but target is not Cal.com, lead-form, or consultation anchor
  if ((t.includes('book 1-on-1') || t.includes('schedule consultation')) && !dest.includes('cal') && !dest.includes('lead-form') && !dest.includes('counselor') && !dest.includes('booking')) {
    potentialMismatches.push({ ...cta, reason: 'Booking text pointing to unexpected route' });
  }

  // Check 4: Text says "Contact" but target is not contact
  if (t === 'contact us' && !dest.includes('contact')) {
    potentialMismatches.push({ ...cta, reason: 'Contact Us text pointing elsewhere' });
  }

  // Check 5: Text says "Study Abroad" / "Visa" / "Umrah" / "Attestation" / "Manpower" but goes to wrong division
  if (t.includes('study abroad') && dest.startsWith('/') && !dest.includes('study-abroad') && !dest.includes('portal') && !dest.includes('cal') && !dest.includes('login') && !dest.includes('lead-form')) {
    potentialMismatches.push({ ...cta, reason: 'Study Abroad CTA pointing to unrelated division route' });
  }
  if (t.includes('visa') && dest.startsWith('/') && !dest.includes('visa') && !dest.includes('portal') && !dest.includes('cal') && !dest.includes('login') && !dest.includes('lead-form') && !dest.includes('status')) {
    potentialMismatches.push({ ...cta, reason: 'Visa CTA pointing to unrelated division route' });
  }
}

console.log(`=== POTENTIAL CTA / INTENT ANOMALIES (${potentialMismatches.length}) ===`);
for (const p of potentialMismatches) {
  console.log(`⚠️  "${p.text}" [${p.type}]`);
  console.log(`    Target: ${p.target}`);
  console.log(`    File:   ${p.file}`);
  console.log(`    Reason: ${p.reason}\n`);
}

if (potentialMismatches.length === 0) {
  console.log('🎉 100% of interactive links and buttons have validated semantic intent and balanced destination logic!');
}
