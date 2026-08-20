const CF_TOKEN = 'cfoat_FT1sZ8hxUeF_EVE80Q3zLwH8G3BsSGqcCaGz_9Aes80.HcdTDxeM5Ot0W-wed_Effvtk7gOWP6m0HcLcNDt731U';
const ZONE_ID = 'b5a528ef0851baea75cb7fbd80909549';
const GD_KEY = 'hkny7iqEoH8Y_St8pFC1hdbT1EaFepX48HJ';
const GD_SECRET = 'TQDp9TrFrY7F4p1vAz7k9m';
const DOMAIN = 'opusoverseas.com';

async function main() {
  console.log('🚀 Step 1: Querying existing DNS records in Cloudflare zone...');
  const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?per_page=100`, {
    headers: { Authorization: `Bearer ${CF_TOKEN}` }
  });
  const cfData = await cfRes.json();
  if (!cfData.success) {
    console.error('Failed to list Cloudflare DNS records:', cfData.errors);
    return;
  }
  console.log(`Found ${cfData.result.length} existing DNS records in Cloudflare.`);

  // 1. Fix 'email' CNAME to proxied: false (DNS only)
  const emailRecord = cfData.result.find(r => r.type === 'CNAME' && r.name === `email.${DOMAIN}`);
  if (emailRecord && emailRecord.proxied) {
    console.log(`Updating 'email' CNAME to DNS only (proxied: false)...`);
    const updateRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${emailRecord.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ proxied: false })
    });
    const updateData = await updateRes.json();
    console.log('email CNAME updated:', updateData.success ? '✅ Success' : updateData.errors);
  }

  // 2. Add missing DKIM & SPF records if not present
  const missingRecords = [
    {
      type: 'CNAME',
      name: `secureserver1._domainkey.${DOMAIN}`,
      content: 's1.dkim.opusoverseas_com.58c.onsecureserver.net',
      proxied: false,
      ttl: 1
    },
    {
      type: 'CNAME',
      name: `secureserver2._domainkey.${DOMAIN}`,
      content: 's2.dkim.opusoverseas_com.58c.onsecureserver.net',
      proxied: false,
      ttl: 1
    },
    {
      type: 'TXT',
      name: `dc-fd741b8612._spfm.send.${DOMAIN}`,
      content: 'v=spf1 include:amazonses.com ~all',
      ttl: 1
    }
  ];

  for (const rec of missingRecords) {
    const exists = cfData.result.find(r => r.type === rec.type && r.name === rec.name);
    if (!exists) {
      console.log(`Adding missing record ${rec.type} ${rec.name} -> ${rec.content}...`);
      const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rec)
      });
      const createData = await createRes.json();
      console.log(`Created ${rec.name}:`, createData.success ? '✅ Success' : createData.errors);
    } else {
      console.log(`Record ${rec.name} already exists in Cloudflare.`);
    }
  }

  // 3. Update GoDaddy nameservers to Cloudflare nameservers
  console.log('\n🚀 Step 2: Updating GoDaddy nameservers to Cloudflare (amit.ns.cloudflare.com, nina.ns.cloudflare.com)...');
  const gdRes = await fetch(`https://api.godaddy.com/v1/domains/${DOMAIN}`, {
    method: 'PATCH',
    headers: {
      Authorization: `sso-key ${GD_KEY}:${GD_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nameServers: ['amit.ns.cloudflare.com', 'nina.ns.cloudflare.com']
    })
  });

  if (gdRes.ok || gdRes.status === 204) {
    console.log('✅ GoDaddy nameservers successfully updated to Cloudflare!');
  } else {
    const gdErr = await gdRes.json().catch(() => ({}));
    console.error('GoDaddy nameserver update response:', gdRes.status, gdErr);
  }

  // 4. Trigger Cloudflare verification
  console.log('\n🚀 Step 3: Triggering Cloudflare zone activation check...');
  const checkRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/activation_check`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${CF_TOKEN}` }
  });
  const checkData = await checkRes.json();
  console.log('Cloudflare activation check initiated:', checkData.success ? '✅ Success' : checkData.errors);

  console.log('\n🎉 ALL CLOUDFLARE & GODADDY DNS SYNC OPERATIONS COMPLETED AUTOMATICALLY!');
}

main().catch(console.error);
