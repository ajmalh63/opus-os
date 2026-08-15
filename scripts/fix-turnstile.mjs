import { readFileSync, writeFileSync } from 'fs';
const p = 'C:\\Opus OS\\apps\\api\\tests\\turnstile.test.ts';
let s = readFileSync(p, 'utf8');

s = s.replace('const leadBody = {', 'const leadBody = () => ({');
s = s.replace("email: 'test@example.com',", "email: `test${Math.floor(Math.random()*99999)}@example.com`,");
s = s.replace("phone: '+91 98765 43210',", "phone: `+91 98765 ${43000 + Math.floor(Math.random()*9000)}`,");
// close the factory: the FIRST "});" after the header is the object close
const idx = s.indexOf('});', s.indexOf('const leadBody'));
if (idx !== -1) s = s.slice(0, idx) + '}));' + s.slice(idx + 3);
// usage conversions
s = s.replace(/body: leadBody(?!\()/g, 'body: leadBody(),');
s = s.replace(/\.\.\.leadBody(?!\()/g, '...leadBody()');

writeFileSync(p, s, 'utf8');
console.log('patched; leadBody() refs:', (s.match(/leadBody\(\)/g) || []).length, '| header factory:', s.includes('const leadBody = () =>'));