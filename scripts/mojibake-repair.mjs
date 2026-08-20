// Mojibake repair — guarded inverse-decode (CP1252-cascade) for flagged files.
// Safety: backups first; only accept a decode pass while the suspicious-token
// count strictly DECREASES and '?' artifacts don't increase (protects clean
// multibyte like a legit — in an otherwise-clean line). Fixed-point loop.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOTS = ['apps/api/src', 'apps/app/src', 'ops', 'automation'];
const EXTS = ['.ts', '.tsx', '.js', '.json', '.toml', '.ps1', '.md'];
const SUS = /(Â.|Ã.|â€.|ï¿½|A·|�)/g;
const BACKUP = process.env.MOJIBACKUP || join(process.env.TEMP || 'C:\\Users\\asimh\\AppData\\Local\\Temp', 'opencode', 'mojibake-backup');

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (['node_modules', '.git', '.wrangler', 'dist', 'build'].includes(e)) continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTS.includes(extname(p))) acc.push(p);
  }
  return acc;
}

const flagged = [];
for (const r of ROOTS) {
  for (const f of walk('C:\\Opus OS\\' + r)) {
    const src = readFileSync(f, 'utf8');
    if (SUS.test(src)) flagged.push(f);
  }
}

function susCount(s) { SUS.lastIndex = 0; let n = 0; while (SUS.exec(s)) n++; return n; }
function qCount(s) { return (s.match(/\?/g) || []).length; }
function ffdCount(s) { return (s.match(/\uFFFD/g) || []).length; }

let fixed = 0, skipped = 0;
for (const f of flagged) {
  let s = readFileSync(f, 'utf8');
  const base = susCount(s); const baseQ = qCount(s); const baseF = ffdCount(s);
  let cur = s, passes = 0;
  for (let i = 0; i < 10; i++) {
    const next = Buffer.from(cur, 'latin1').toString('utf8');
    if (next === cur) break;                  // fixpoint
    cur = next; passes++;
  }
  // Accept the fixpoint chain ONLY if it introduced no damage: no new FFFD,
  // no meaningful '?' inflation (guards clean-multibyte files from truncation).
  if (passes > 0 && ffdCount(cur) <= baseF && qCount(cur) <= baseQ + 2 && susCount(cur) < base) {
    const rel = relative('C:\\Opus OS', f);
    const bak = join(BACKUP, rel);
    mkdirSync(join(bak, '..'), { recursive: true });
    copyFileSync(f, bak);
    writeFileSync(f, cur, 'utf8');
    fixed++;
    console.log(`FIXED ${rel}  ${base}→${susCount(cur)} suspicious (${passes} passes)`);
  } else {
    skipped++;
    console.log(`SKIP  ${relative('C:\\Opus OS', f)} (${base} suspicious, ${passes} passes)`);
  }
}
console.log(`\nREPAIR: ${fixed} fixed, ${skipped} skipped (backups in ${BACKUP})`);