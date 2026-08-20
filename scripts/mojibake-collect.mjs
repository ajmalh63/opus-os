// Mojibake collector (dry-run): list distinct mangled tokens + contexts across
// the repo's source files so the repair mapping is grounded in what's actually
// on disk. Pass 2 (fix) applies a token→char map and re-verifies.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOTS = ['apps/api/src', 'apps/app/src', 'ops', 'automation'];
const EXTS = ['.ts', '.tsx', '.js', '.json', '.toml', '.ps1', '.md'];
const SUS = /(Â.|Ã.|â€.|ï¿½|A·|�)/g;

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (['node_modules', '.git', '.wrangler', 'dist', 'build'].includes(e)) continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTS.includes(extname(p))) acc.push(p);
  }
  return acc;
}

const counts = new Map();
const samples = new Map();
for (const f of walk('C:\\Opus OS\\' + ROOTS[0]).concat(ROOTS.slice(1).flatMap((r) => walk('C:\\Opus OS\\' + r)))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(SUS)) {
    const t = m[0];
    counts.set(t, (counts.get(t) || 0) + 1);
    if (!samples.has(t)) {
      const start = Math.max(0, m.index - 30);
      samples.set(t, f.replace('C:\\Opus OS\\', '') + ' :: …' + src.slice(start, m.index + t.length + 30).replace(/\n/g, ' ') + '…');
    }
  }
}
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log('DISTINCT TOKENS:', sorted.length);
for (const [t, n] of sorted) console.log(JSON.stringify(t), '×' + n, '|', samples.get(t));