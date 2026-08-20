/**
 * Backfill portal_token for legacy client rows (pre-0075).
 *
 * The OP-YYYY-XXXX id was historically the portal credential with a 9,000-value
 * Math.random() space. This script assigns every client a 128-bit CSPRNG
 * portal token so id-lookup fails closed (see lib/clientToken.ts).
 *
 * Usage:
 *   npx wrangler d1 execute opusos-db --local --file migrations/0075_grey_jigsaw.sql
 *   node scripts/backfill-portal-tokens.mjs <d1-name> [--local]
 */
import { execSync } from 'node:child_process';

const d1Name = process.argv[2] || 'opusos-db';
const local = process.argv.includes('--local');

// SQLite can't generate UUIDs in SQL — generate tokens in JS and run batched updates.
const tokens = new Map(); // id -> token
function token() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const args = ['d1', 'execute', d1Name];
if (local) args.push('--local');

console.log('Fetching clients without portal_token…');
const listSql = "SELECT id FROM clients WHERE portal_token IS NULL;";
const out = execSync(`npx wrangler ${args.join(' ')} --command "${listSql}" --json`, { encoding: 'utf8' });
const rows = JSON.parse(out)?.[0]?.results || [];
console.log(`Found ${rows.length} clients to backfill.`);

let done = 0;
for (const row of rows) {
  const t = token();
  const sql = `UPDATE clients SET portal_token = '${t}' WHERE id = '${String(row.id).replace(/'/g, "''")}';`;
  execSync(`npx wrangler ${args.join(' ')} --command "${sql}" --json`, { encoding: 'utf8', stdio: 'pipe' });
  done++;
  if (done % 50 === 0) console.log(`${done}/${rows.length}…`);
}
console.log(`Done. Backfilled ${done} clients.`);
