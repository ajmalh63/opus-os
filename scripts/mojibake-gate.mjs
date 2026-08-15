// CI gate: fail the build if any mojibake tokens are detected in source.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOTS = ['apps/api/src', 'apps/app/src', 'ops', 'automation'];
const SUS = /\uFFFD|[\u00C2-\u00C3]\S|A\u00B7|dY\S|[\u00E2]\u20AC.{0,2}/g;

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (['node_modules', '.git', '.wrangler', 'dist', 'build'].includes(e)) continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|json|toml|ps1|md)$/.test(e)) acc.push(p);
  }
  return acc;
}

let count = 0;
const files = ROOTS.flatMap((r) => walk('C:\\Opus OS\\' + r));
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const fileCount = (src.match(SUS) || []).length;
  if (fileCount) { count += fileCount; console.log('MOJIBAKE', f.replace('C:\\Opus OS\\', ''), fileCount); }
}
console.log(count === 0 ? 'MOJIBAKE GATE: clean' : `MOJIBAKE GATE: ${count} tokens — fail`);
process.exit(count === 0 ? 0 : 1);