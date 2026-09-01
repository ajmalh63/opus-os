#!/usr/bin/env node
/**
 * Post-build prerender — injects SEO head into static copies for every sitemap route
 * so crawlers / AI bots see <title> + og:tags without executing JS.
 * Gold standard: Google JS SEO Dec 2025 — critical SEO in initial HTML.
 *
 * Usage: node scripts/prerender.mjs  (run after `vite build`)
 * Reads dist/index.html (the SPA shell), injects per-route <title>/meta/canonical/OG
 * via renderSEOHeadString-equivalent, and writes dist/<route>/index.html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const SHELL = join(DIST, 'index.html');

const DOMAIN = 'https://opusoverseas.com';

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Route → SEO mapping must match sitemap.xml + each page's <SEOHead> props
const ROUTES = [
  { path: '/', title: 'Opus Overseas | Study Abroad, Overseas Jobs & Travel', desc: 'Opus Overseas is a premier global consultancy for university admissions in UK, USA, Germany, Canada, worldwide visa processing, MEA apostille attestation, world tour packages & Gulf manpower.' },
  { path: '/study-abroad', title: 'Study Abroad Consultants | USA, UK, Canada, Germany & Australia | Opus Overseas', desc: 'Top overseas education consultancy for university shortlisting, Ivy League admissions, I-20/CAS processing, scholarship grants, and 1-on-1 student visa mock interviews.' },
  { path: '/visa-services', title: 'Global Visa Services & Express Processing | 60+ Countries | Opus Overseas', desc: 'Expert tourist, business, student, and work visa assistance with verified embassy document preparation, 24-48h express e-visas, and real-time biometric tracking.' },
  { path: '/tours-travels', title: 'Tours & Travels | 5-Star Umrah, World Holidays & Custom Getaways | Opus Overseas', desc: 'Explore luxury 5-Star Umrah packages from Hyderabad, Dubai & Europe international holiday tours, and domestic getaways with 100% visa assistance and direct flights.' },
  { path: '/umrah-travel', title: 'Umrah Packages 2026 from Hyderabad | All-Inclusive Tours | Opus Overseas', desc: 'Premium & economy all-inclusive Umrah tour packages from Hyderabad. 5-Star Haram proximity hotels in Makkah and Madinah, direct e-visas, scholar guidance & Ziyarat.' },
  { path: '/attestation', title: 'Document Attestation & MEA Apostille Services | India | Opus Overseas', desc: 'Fast-track MEA Apostille, State HRD, SDM, and Embassy Legalization for educational, personal, and commercial certificates with insured courier custody.' },
  { path: '/recruitment', title: 'Overseas Manpower & Recruitment | Opus Overseas', desc: 'Structured screening for verified jobs in UAE, Saudi Arabia, Qatar, Kuwait & Germany — healthcare, engineering, construction & tech. Employer-verified, transparent.' },
  // sitemap uses /manpower/hire but app canonical is /manpower/hire — keep both
  { path: '/manpower', title: 'Overseas Manpower & Recruitment | Opus Overseas', desc: 'Structured screening for verified jobs in UAE, Saudi Arabia, Qatar, Kuwait & Germany — healthcare, engineering, construction & tech. Employer-verified, transparent.' },
  { path: '/manpower/hire', title: 'Hire Verified Talent — For Employers | Opus Overseas', desc: 'Hire vetted Indian talent — structured JD-matched screening, document & credential checks, employer-paid ethical sourcing. Submit demand, get a sector-aligned shortlist.' },
  { path: '/contact', title: 'Contact Opus Overseas | Nizamabad, Telangana Office & Global Advisory Desk', desc: 'Contact Opus Overseas in Nizamabad, Telangana. Reach our certified study abroad counselors, visa specialists, and attestation team via phone, WhatsApp, or in-person visit.' },
  { path: '/about', title: 'About Opus Overseas | Leadership, Certifications & Institutional Mission', desc: 'Learn about Opus Overseas — building ethical global education guidance, transparent visa support, and responsible manpower partnerships as we launch.' },
  { path: '/privacy', title: 'Privacy Policy & DPDP Compliance | Opus Overseas', desc: 'Read the official Opus Overseas Privacy Policy. Learn how applicant data, academic transcripts, passport scans, and payment telemetry are protected under the DPDP Act 2023.' },
  { path: '/terms', title: 'Terms of Service | Opus Overseas', desc: 'Official Terms of Service governing the use of Opus Overseas advisory, visa, attestation, and recruitment services.' },
  { path: '/blog', title: 'Opus Overseas Blog | Study Abroad, Visa & Career Insights', desc: 'Expert insights on global university admissions, visa policy updates, attestation guides, and overseas career pathways from Opus Overseas.' },
];

function seoHead(route) {
  const canonical = `${DOMAIN}${route.path}`;
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.desc)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    `<meta property="og:title" content="${esc(route.title)}">`,
    `<meta property="og:description" content="${esc(route.desc)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Opus Overseas">`,
    `<meta property="og:locale" content="en_IN">`,
    `<meta property="og:image" content="${DOMAIN}/og-image.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(route.title)}">`,
    `<meta name="twitter:description" content="${esc(route.desc)}">`,
    `<meta name="twitter:image" content="${DOMAIN}/og-image.png">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
  ];
  return tags.join('\n  ');
}

function main() {
  if (!existsSync(SHELL)) {
    console.error(`[prerender] Shell not found: ${SHELL} — run vite build first`);
    process.exit(1);
  }
  let shell = readFileSync(SHELL, 'utf8');
  // Extract the SPA's existing head prefix up to </title> to avoid duplication; we replace title+meta block
  let count = 0;
  for (const route of ROUTES) {
    if (route.path === '/') {
      // For /, inject into the root index.html itself (replace existing title/desc)
      let out = shell;
      // Replace <title>...</title>
      out = out.replace(/<title>.*?<\/title>/s, `<title>${esc(route.title)}</title>`);
      // Ensure og:tags exist (insert before </head>)
      const head = seoHead(route);
      // If shell already has og:title etc., replace; else inject
      if (out.includes('property="og:title"')) {
        // Remove old SEO block and inject fresh — simple: replace the entire title line with full head
        // We do a minimal replace: swap the <title> and ensure canonical
        out = out.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(route.desc)}">`);
        // Inject remaining tags if missing
        const missing = head.split('\n').filter(t => !out.includes(t.trim().slice(0,30)));
        if (missing.length) {
          out = out.replace('</head>', `  ${missing.join('\n  ')}\n</head>`);
        }
      } else {
        out = out.replace('</head>', `  ${head}\n</head>`);
      }
      writeFileSync(SHELL, out);
      count++;
      continue;
    }
    // For other routes: copy shell to dist/<route>/index.html with route-specific head
    const dir = join(DIST, route.path.replace(/^\//, ''));
    mkdirSync(dir, { recursive: true });
    let html = shell;
    const head = seoHead(route);
    // Replace title
    html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(route.title)}</title>`);
    // Replace meta description if exists, else inject
    if (html.includes('name="description"')) {
      html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(route.desc)}">`);
    }
    // Inject full SEO head before </head> (dedupe by removing old og tags first)
    html = html.replace(/<meta property="og:[^>]*>\n?/g, '');
    html = html.replace(/<meta name="twitter:[^>]*>\n?/g, '');
    html = html.replace(/<link rel="canonical"[^>]*>\n?/g, '');
    html = html.replace('</head>', `  ${head}\n</head>`);
    // Ensure SPA fallback still works: add <meta name="prerender" content="true">
    writeFileSync(join(dir, 'index.html'), html);
    count++;
  }
  console.log(`[prerender] ✓ Injected SEO head for ${count} routes (${ROUTES.map(r=>r.path).join(', ')})`);
  console.log(`[prerender]   Crawlers now see <title> + og:tags on every sitemap URL without JS.`);
}

main();
