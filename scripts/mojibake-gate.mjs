// CI gate: fail the build if any mojibake tokens are detected in source.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

// Repo root: optional argv[2] (e.g. from CI with a different cwd), else the
// script's own location (scripts/..). Never assume a Windows drive path.
const REPO_ROOT = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const ROOTS = ['apps/api/src', 'apps/app/src', 'ops', 'automation'];
// NOTE: `dY\S` was removed from SUS — it matched legitimate identifiers like
// `midY,` (false positive) and no real `dY` mojibake token exists in the map.
const SUS = /\uFFFD|[\u00C2-\u00C3]\S|A\u00B7|[\u00E2]\u20AC.{0,2}/g;

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
const files = ROOTS.flatMap((r) => walk(join(REPO_ROOT, r)));
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const fileCount = (src.match(SUS) || []).length;
  if (fileCount) { count += fileCount; console.log('MOJIBAKE', relative(REPO_ROOT, f), fileCount); }
}
console.log(count === 0 ? 'MOJIBAKE GATE: clean' : `MOJIBAKE GATE: ${count} tokens — fail`);
process.exit(count === 0 ? 0 : 1);