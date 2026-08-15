// Mojibake final-sweep (heuristic): replace cascade runs inside string lines.
// Currency context → ₹ · completion context → ✓ · otherwise strip the run.
import { readFileSync, writeFileSync } from 'fs';

const FILES = [
  'apps/api/src/routes/transactions.ts',
  'apps/app/src/components/GrowthTab.tsx',
  'apps/app/src/pages/AdminConsole.tsx',
  'apps/app/src/pages/Client360.tsx',
  'apps/app/src/pages/ClientPortal.tsx',
  'apps/app/src/components/ComplianceTab.tsx',
];
function isSusp(c) { const u = c.charCodeAt(0); return u === 0xFFFD || (u >= 0x80 && u <= 0x2FF) || (u >= 0x2000 && u <= 0x206F); }
const isComment = (l) => { const t = l.trimStart(); return t.startsWith('//') || t.startsWith('*'); };
const ctxSeparator = (s) => /cold|warm|hot|trigger|period|Overdue|Due |&lt;|&gt;/i.test(s);

function findRun(line) {
  let best = null;
  for (let i = 0; i < line.length; i++) {
    if (!isSusp(line[i])) continue;
    let j = i;
    while (j < line.length && isSusp(line[j])) j++;
    if (j - i >= 2) { best = [i, j]; break; }
    i = j - 1;
  }
  return best;
}

let fixedLines = 0;
for (const rel of FILES) {
  const p = 'C:\\Opus OS\\' + rel;
  let s = readFileSync(p, 'utf8');
  let changed = false;
  s = s.split('\n').map((l) => {
    if (isComment(l)) return l;
    for (let k = 0; k < 12; k++) {
      const run = findRun(l);
      if (!run) break;
      const [start, end] = run;
      const ctx = l.slice(0, start) + l.slice(end, end + 40);
      let rep = '';
      if (/Amount|Price|IGST|CGST|SGST|UPI|balance|toFixed|\(\/ 100\)|booki|dep\.|ledger\.|₹|Rs\.|receive/i.test(ctx)) rep = '\u20B9'; // ₹
      else if (/isCompleted|status === 'done'|step\.seq/i.test(ctx)) rep = '\u2713'; // ✓
      else if (ctxSeparator(ctx)) rep = '\u00B7'; // ·
      changed = true; fixedLines++;
      l = l.slice(0, start) + rep + l.slice(end);
    }
    return l;
  }).join('\n');
  if (changed) { writeFileSync(p, s, 'utf8'); console.log('SWEPT', rel); }
}
console.log('lines touched:', fixedLines);