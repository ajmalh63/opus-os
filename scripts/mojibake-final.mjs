// Mojibake final pass — mechanical token fixes + cascade-run strip in strings.
// Runs on the six deep files; reports what remains for manual edits.
import { readFileSync, writeFileSync } from 'fs';

const FILES = [
  'apps/api/src/routes/transactions.ts',
  'apps/app/src/components/GrowthTab.tsx',
  'apps/app/src/pages/AdminConsole.tsx',
  'apps/app/src/pages/Client360.tsx',
  'apps/app/src/pages/ClientPortal.tsx',
  'apps/app/src/components/ComplianceTab.tsx',
];

const MAP2 = [
  ['\u00C2\u00B7', '\u00B7'],                 // Â· → ·
  ['\u00C3\u0082\u00C2\u00B7', '\u00B7'],
  ['50\u20AC\u20AC\u2013', '50\u2013'],        // 50€â‚¬– → 50–
  ['\u20AC \u2019', '\u2014 '],                // € ’ → —
  ['\u20AC ', '\u2014 '],                      // € → — (spaced)
  ['\u00C3\u0082\u00C2\u00A9', '\u00A9'],     // ©
  ['\u00C2\u00A9', '\u00A9'],
  ['\u00C3\u00A2\u20AC\u201A\u00C2\u00A9', '\u20B9'], // ₹ deep
  ['\u00C3\u00A2\u20AC\u0153\u00C2\u00A9', '\u20B9'],
  ['\u00E2\u20AC\u2019', '\u2019'],           // â€™ → ’
  ['\u00E2\u20AC\u201C', '\u201C'],           // â€œ → “
  ['\u00E2\u20AC\u009D', '\u201D'],           // â€ → ”
  ['\u00E2\u20AC\u2013', '\u2013'],           // â€“ → –
  ['\u00E2\u20AC\u2014', '\u2014'],           // â€” → —
  ['\u00E2\u20AC\u00A6', '\u2026'],           // â€¦ → …
  ['\u00C3\u2014', '\u00D7'],                 // Ã— → ×
  ['3\u00C3\u2014', '3\u00D7'],
];

const SUS = /(\u00C2.|\u00C3.|\u00E2\u20AC.|\u00EF\u00BF\u00BD|dY.|\uFFFD)/g;
const isComment = (l) => { const t = l.trimStart(); return t.startsWith('//') || t.startsWith('*'); };

let remaining = [];
for (const rel of FILES) {
  const p = 'C:\\Opus OS\\' + rel;
  let s = readFileSync(p, 'utf8');
  let changed = false;
  for (const [t, r] of MAP2) { if (s.includes(t)) { s = s.split(t).join(r); changed = true; } }
  let lines = s.split('\n');
  let striped = false;
  lines = lines.map((l) => {
    if (isComment(l)) return l;
    if (!SUS.test(l)) { SUS.lastIndex = 0; return l; } SUS.lastIndex = 0;
    // strip the first cascade run (≥2 chars) inside the string line
    const idx = l.search(SUS); SUS.lastIndex = 0;
    if (idx < 0) return l;
    let end = idx;
    while (end < l.length && SUS.test(l[end])) end++; // extend run
    SUS.lastIndex = 0;
    const runLen = end - idx;
    if (runLen >= 2) { striped = true; return l.slice(0, idx) + l.slice(end); }
    return l;
  });
  if (changed || striped) { writeFileSync(p, lines.join('\n'), 'utf8'); console.log('PASS2', rel); }
  for (const l of lines) { if (!isComment(l) && SUS.test(l)) { SUS.lastIndex = 0; remaining.push(rel + ' | ' + l.trim().slice(0, 100)); } }
}
console.log('\nREMAINING STRING MOJIBAKE:', remaining.length);
remaining.slice(0, 12).forEach((r) => console.log(' ', r));