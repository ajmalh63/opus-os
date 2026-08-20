import fs from 'fs';
import path from 'path';

const APP_SRC = path.resolve('apps/app/src');

function getAllFiles(dir, ext = ['.ts', '.tsx']) {
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

// 1. Extract registered frontend routes from App.tsx
const appContent = fs.readFileSync(path.join(APP_SRC, 'App.tsx'), 'utf-8');
const registeredRoutes = new Set();
const routeRegex = /<Route\s+path=["']([^"']+)["']/g;
let m;
while ((m = routeRegex.exec(appContent)) !== null) {
  registeredRoutes.add(m[1]);
}
console.log(`✅ Registered routes in App.tsx: ${registeredRoutes.size}`);
console.log([...registeredRoutes]);

// 2. Scan all tsx files for navigation targets
const appFiles = getAllFiles(APP_SRC);
const links = [];

for (const file of appFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  // Match setLocation('/...')
  const setLocRegex = /setLocation\(\s*[`'"](\/[a-zA-Z0-9_\-\/:]*)[`'"]/g;
  let locMatch;
  while ((locMatch = setLocRegex.exec(content)) !== null) {
    links.push({ file: path.relative(process.cwd(), file), target: locMatch[1] });
  }

  // Match <Link href="/..." or to="/..."
  const linkRegex = /(?:href|to)=["'](\/[a-zA-Z0-9_\-\/:]*)["']/g;
  let lMatch;
  while ((lMatch = linkRegex.exec(content)) !== null) {
    // Ignore external, hash, api, or assets
    if (!lMatch[1].startsWith('/api') && !lMatch[1].startsWith('/#') && !lMatch[1].includes('.')) {
      links.push({ file: path.relative(process.cwd(), file), target: lMatch[1] });
    }
  }
}

console.log(`\n🔍 Found ${links.length} internal navigation links.`);

function matchesRoute(target) {
  if (target === '/') return true;
  for (const r of registeredRoutes) {
    if (r === target) return true;
    // Parameterized routes like /clients/:id or /workspaces/:slug
    if (r.includes(':')) {
      const reg = new RegExp('^' + r.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$');
      if (reg.test(target)) return true;
    }
  }
  return false;
}

const broken = [];
for (const link of links) {
  if (!matchesRoute(link.target)) {
    broken.push(link);
  }
}

console.log(`\n=== UNRESOLVED FRONTEND ROUTE TARGETS (${broken.length}) ===`);
for (const b of broken) {
  console.log(`❌ Target: "${b.target}" in ${b.file}`);
}

if (broken.length === 0) {
  console.log('🎉 ALL internal navigation links resolve to valid routes in App.tsx!');
}
