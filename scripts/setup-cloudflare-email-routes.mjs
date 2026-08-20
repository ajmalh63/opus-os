#!/usr/bin/env node
/**
 * setup-cloudflare-email-routes.mjs
 * 
 * Automatically provisions all email routes discovered in OpusOS to forward
 * directly into info@opusoverseas.com via Cloudflare Email Routing API.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_TOKEN || 'cfoat_FT1sZ8hxUeF_EVE80Q3zLwH8G3BsSGqcCaGz_9Aes80.HcdTDxeM5Ot0W-wed_Effvtk7gOWP6m0HcLcNDt731U';
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || 'b5a528ef0851baea75cb7fbd80909549';
const DOMAIN = 'opusoverseas.com';
const PRIMARY_DESTINATION = 'info@opusoverseas.com';

const ROUTING_RULES = [
  {
    name: 'Customer Support & Invoices',
    address: `support@${DOMAIN}`,
    description: 'GST Tax Invoices, Shipping Policy, Customer Desk'
  },
  {
    name: 'General Inquiries & Footer Desk',
    address: `hello@${DOMAIN}`,
    description: 'Site Footer, Homepage Header, Public Services Desk'
  },
  {
    name: 'Official Contact & HQ Desk',
    address: `contact@${DOMAIN}`,
    description: 'Contact Page (/contact), Structured Schema, Headquarters Desk'
  },
  {
    name: 'Study Abroad Division',
    address: `admissions@${DOMAIN}`,
    description: 'Study Abroad Application Desk (/study-abroad)'
  },
  {
    name: 'Visa Services Division',
    address: `visas@${DOMAIN}`,
    description: 'Consular & Visa Assistance Desk (/visa-services)'
  },
  {
    name: 'Umrah Travel Division',
    address: `umrah@${DOMAIN}`,
    description: 'Umrah & Hajj Services Desk (/umrah-travel)'
  },
  {
    name: 'Document Attestation Division',
    address: `attestation@${DOMAIN}`,
    description: 'Certificate Attestation & MEA Chain (/attestation)'
  },
  {
    name: 'Billing & Refund Desk',
    address: `billing@${DOMAIN}`,
    description: 'Refund Policy (/refund-policy), Payment Disputes'
  },
  {
    name: 'Privacy & DPDP Officer',
    address: `privacy@${DOMAIN}`,
    description: 'Privacy Policy (/privacy), DPDP Grievance Officer'
  },
  {
    name: 'Legal & Compliance Desk',
    address: `legal@${DOMAIN}`,
    description: 'Terms of Service (/terms), Statutory Legal Notices'
  },
  {
    name: 'Logistics & Courier Desk',
    address: `logistics@${DOMAIN}`,
    description: 'Shipping Policy (/shipping), Courier & AWB Dispatch'
  },
  {
    name: 'Operations & Booking Desk',
    address: `ops@${DOMAIN}`,
    description: 'Operational Desk, Cal.com & ERPNext Notifications'
  },
  {
    name: 'Owner & Executive Alerts',
    address: `owner@${DOMAIN}`,
    description: 'Executive Admin Bootstrap & Owner Alerts'
  },
  {
    name: 'System Admin Notifications',
    address: `admin@${DOMAIN}`,
    description: 'System Administration, Listmonk Transactional'
  },
  {
    name: 'No-Reply Transactional Sender',
    address: `no-reply@${DOMAIN}`,
    description: 'Automated System Notifications & OTP Alerts'
  },
  {
    name: 'DMARC Authentication Reports',
    address: `dmarc@${DOMAIN}`,
    description: 'DMARC SPF/DKIM Authentication Reports (rua)'
  }
];

async function cfFetch(path, options = {}) {
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res.json();
}

async function main() {
  console.log('====================================================');
  console.log(`🚀 OpusOS Cloudflare Email Routing Provisioner`);
  console.log(`🌐 Zone: ${DOMAIN} (${ZONE_ID})`);
  console.log(`📬 Primary Inbox Target: ${PRIMARY_DESTINATION}`);
  console.log('====================================================\n');

  // Save JSON configuration export for reference
  const exportPath = resolve(__dirname, 'cloudflare-email-routes.json');
  writeFileSync(exportPath, JSON.stringify({
    domain: DOMAIN,
    zoneId: ZONE_ID,
    destination: PRIMARY_DESTINATION,
    rules: ROUTING_RULES,
    catchAll: {
      enabled: true,
      forwardTo: PRIMARY_DESTINATION
    },
    updatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`📄 Saved route specification to ${exportPath}`);

  // Step 1: Check Email Routing Status for Zone
  console.log(`\n🔍 Step 1: Checking Email Routing status for ${DOMAIN}...`);
  try {
    const statusData = await cfFetch(`/zones/${ZONE_ID}/email/routing`);
    if (statusData.success) {
      console.log(`✅ Email Routing status: ${statusData.result?.status || 'Active'}`);
    } else {
      console.log(`⚠️ Email Routing query note:`, statusData.errors);
    }
  } catch (err) {
    console.log(`⚠️ Note checking status: ${err.message}`);
  }

  // Step 2: Query Existing Rules
  console.log(`\n🔍 Step 2: Querying existing Email Routing rules...`);
  let existingRules = [];
  try {
    const rulesData = await cfFetch(`/zones/${ZONE_ID}/email/routing/rules?per_page=100`);
    if (rulesData.success && Array.isArray(rulesData.result)) {
      existingRules = rulesData.result;
      console.log(`Found ${existingRules.length} existing routing rules.`);
    } else {
      console.log(`Could not list rules or no rules exist yet:`, rulesData.errors || []);
    }
  } catch (err) {
    console.log(`Error listing rules: ${err.message}`);
  }

  // Step 3: Provision Custom Email Routes
  console.log(`\n🚀 Step 3: Provisioning ${ROUTING_RULES.length} custom email routes pointing to ${PRIMARY_DESTINATION}...`);
  let createdCount = 0;
  let existingCount = 0;

  for (const rule of ROUTING_RULES) {
    const alreadyExists = existingRules.find(r => {
      const match = r.matchers?.find(m => m.type === 'literal' && m.field === 'to' && m.value.toLowerCase() === rule.address.toLowerCase());
      return !!match;
    });

    if (alreadyExists) {
      console.log(`  ✓ Route already configured: ${rule.address} ➡️ ${PRIMARY_DESTINATION}`);
      existingCount++;
      continue;
    }

    console.log(`  ➕ Creating route: ${rule.address} ➡️ ${PRIMARY_DESTINATION} (${rule.name})...`);
    try {
      const createRes = await cfFetch(`/zones/${ZONE_ID}/email/routing/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: rule.name,
          enabled: true,
          matchers: [
            {
              type: 'literal',
              field: 'to',
              value: rule.address
            }
          ],
          actions: [
            {
              type: 'forward',
              value: [PRIMARY_DESTINATION]
            }
          ]
        })
      });

      if (createRes.success) {
        console.log(`    ✅ Success creating ${rule.address}`);
        createdCount++;
      } else {
        console.log(`    ⚠️ Cloudflare response for ${rule.address}:`, createRes.errors?.[0]?.message || createRes.errors);
      }
    } catch (err) {
      console.log(`    ❌ Error creating ${rule.address}: ${err.message}`);
    }
  }

  // Step 4: Catch-All Rule Status
  console.log(`\n🛡️ Step 4: Checking Catch-All Fallback (*@${DOMAIN} ➡️ ${PRIMARY_DESTINATION})...`);
  try {
    const catchAllRes = await cfFetch(`/zones/${ZONE_ID}/email/routing/rules/catch_all`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Catch-All to Info Mailbox',
        enabled: true,
        matchers: [
          {
            type: 'all'
          }
        ],
        actions: [
          {
            type: 'forward',
            value: [PRIMARY_DESTINATION]
          }
        ]
      })
    });
    if (catchAllRes.success) {
      console.log(`✅ Catch-All Rule enabled: All unrouted emails forward to ${PRIMARY_DESTINATION}`);
    } else {
      console.log(`⚠️ Catch-All response:`, catchAllRes.errors?.[0]?.message || catchAllRes.errors);
    }
  } catch (err) {
    console.log(`⚠️ Catch-All check note: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`🎉 Cloudflare Email Routing Configuration Complete!`);
  console.log(`   - Existing configured routes: ${existingCount}`);
  console.log(`   - Newly provisioned routes:   ${createdCount}`);
  console.log(`   - Target Destination:         ${PRIMARY_DESTINATION}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal error setting up Cloudflare email routes:', err);
  process.exit(1);
});
