import fs from 'fs';
import path from 'path';

const API_SRC = path.resolve('apps/api/src');
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

// 1. Collect all API endpoints from apps/api/src
const apiFiles = getAllFiles(API_SRC);
const registeredEndpoints = new Set();

// Parse index.ts for route mounts
const indexContent = fs.readFileSync(path.join(API_SRC, 'index.ts'), 'utf-8');
const routeMounts = [];
const mountRegex = /app\.route\(['"]([^'"]+)['"],\s*([a-zA-Z0-9_]+)\)/g;
let m;
while ((m = mountRegex.exec(indexContent)) !== null) {
  routeMounts.push({ mount: m[1], routerName: m[2] });
}

// Map router files to router variable names
const routerDefinitions = new Map();
for (const file of apiFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const routerInstRegex = /(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*new\s+Hono/g;
  let rMatch;
  while ((rMatch = routerInstRegex.exec(content)) !== null) {
    const rName = rMatch[1];
    const subRouteRegex = new RegExp(`${rName}\\.(get|post|put|patch|delete)\\(\\s*['"]([^'"]+)['"]`, 'g');
    const subRoutes = [];
    let sMatch;
    while ((sMatch = subRouteRegex.exec(content)) !== null) {
      subRoutes.push({ method: sMatch[1].toUpperCase(), path: sMatch[2] });
    }
    routerDefinitions.set(rName, { file, subRoutes });
  }
  if (file.endsWith('index.ts')) {
    const directRegex = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    let dMatch;
    while ((dMatch = directRegex.exec(content)) !== null) {
      registeredEndpoints.add(`${dMatch[1].toUpperCase()} ${dMatch[2]}`);
    }
  }
}

for (const { mount, routerName } of routeMounts) {
  const def = routerDefinitions.get(routerName);
  if (def) {
    for (const sub of def.subRoutes) {
      const fullPath = (mount === '/' ? '' : mount) + (sub.path === '/' ? '' : sub.path);
      registeredEndpoints.add(`${sub.method} ${fullPath || '/'}`);
    }
  }
}

console.log(`✅ Total detected backend endpoints: ${registeredEndpoints.size}`);

// 2. Collect all fetch calls in apps/app/src
const appFiles = getAllFiles(APP_SRC);
const frontendFetchCalls = [];

for (const file of appFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const fetchRegex = /fetch\(\s*[`'"](\/api\/[^`'"?]+)(?:\?[^`'"]*)?[`'"]/g;
  let fMatch;
  while ((fMatch = fetchRegex.exec(content)) !== null) {
    frontendFetchCalls.push({
      file: path.relative(process.cwd(), file),
      endpoint: fMatch[1],
    });
  }
  const tplFetchRegex = /fetch\(\s*`(\/api\/[^`$?]+)/g;
  let tMatch;
  while ((tMatch = tplFetchRegex.exec(content)) !== null) {
    frontendFetchCalls.push({
      file: path.relative(process.cwd(), file),
      endpoint: tMatch[1],
    });
  }
}

console.log(`✅ Total detected frontend API calls: ${frontendFetchCalls.length}`);

const uniqueCalls = [...new Set(frontendFetchCalls.map((c) => c.endpoint))];
console.log(`\n🔍 Checking ${uniqueCalls.length} unique frontend API base endpoints against backend...`);

const allEndpointsArray = Array.from(registeredEndpoints);

function matchesBackend(endpoint) {
  if (endpoint === '/api/auth' || endpoint.startsWith('/api/auth')) return true; // Handled by BetterAuth wildcard router
  for (const backend of allEndpointsArray) {
    const [, bPath] = backend.split(' ');
    const regexStr = '^' + bPath
      .replace(/\/:[a-zA-Z0-9_]+/g, '/[^/]+')
      .replace(/\/\*/g, '/.*') + '$';
    const reg = new RegExp(regexStr);
    if (reg.test(endpoint)) return true;
    if (bPath.endsWith('/*') && endpoint.startsWith(bPath.slice(0, -2))) return true;
    if (bPath.includes(':') && endpoint.startsWith(bPath.split('/:')[0])) return true;
  }
  return false;
}

const unmatched = [];
for (const endpoint of uniqueCalls) {
  if (!matchesBackend(endpoint)) {
    unmatched.push(endpoint);
  }
}

console.log(`\n=== UNMATCHED FRONTEND ENDPOINTS (${unmatched.length}) ===`);
for (const u of unmatched) {
  const callers = frontendFetchCalls.filter((c) => c.endpoint === u).map((c) => c.file);
  console.log(`❌ ${u}`);
  console.log(`   Used in: ${[...new Set(callers)].join(', ')}`);
}

if (unmatched.length === 0) {
  console.log('🎉 ALL frontend API endpoints have matching backend route handlers!');
}
