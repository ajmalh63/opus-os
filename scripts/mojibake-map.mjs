// Mojibake final map — curated literal replacements for residual recoverable
// tokens (longest-first ordering). U+FFFD runs are irrecoverable (data was
// destroyed in an early lossy write; comments only) and are left untouched.
import { readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { join, extname, relative } from 'path';

const ROOTS = ['apps/api/src', 'apps/app/src', 'ops', 'automation'];
const EXTS = ['.ts', '.tsx', '.js', '.json', '.toml', '.ps1', '.md'];
const MAP = [
  ['Ãƒâ€šÃ‚Â·', '·'],
  ['Ã¢â‚¬â€œ', '—'],
  ['Ã¢â‚¬â€', '—'],
  ['Ã¢â‚¬Å¡Ã‚Â/…', '…'],
  ['₹-šÂ¬', '—'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€¦', '…'],
  ['â€™', '’'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['Â·', '·'],
  ['Â¢', '¢'],
  ['Â¬', '—'],
  ['Ã—', '×'],
  ['Â§', '§'],
  ['Ã¢', '€'],
  ['Ã‚Â©', '©'],
  ['Ã¢“Â¹', '₹'],
  ['Ã¢Å¡Â', '⚠️'],
  ['Ã°Å¸', '📊'],
  ['3Ã—', '3×'],
].sort((a, b) => b[0].length - a[0].length);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (['node_modules', '.git', '.wrangler', 'dist', 'build'].includes(e)) continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTS.includes(extname(p))) acc.push(p);
  }
  return acc;
}

const BACKUP = join(process.env.TEMP || 'C:\\Users\\asimh\\AppData\\Local\\Temp', 'opencode', 'mojibake-final-backup');
let touched = 0;
for (const r of ROOTS) {
  for (const f of walk('C:\\Opus OS\\' + r)) {
    let s = readFileSync(f, 'utf8');
    let changed = false;
    for (const [tok, rep] of MAP) {
      if (s.includes(tok)) { s = s.split(tok).join(rep); changed = true; }
    }
    if (changed) {
      const rel = relative('C:\\Opus OS', f);
      const bak = join(BACKUP, rel);
      mkdirSync(join(bak, '..'), { recursive: true });
      copyFileSync(f, bak);
      writeFileSync(f, s, 'utf8');
      touched++;
      console.log('MAP-APPLIED', rel);
    }
  }
}
console.log('MAP PASS: touched', touched);