/**
 * Opus OS — AI Governance, Aggressive Caching & Edge Features Test Suite
 */

const API_BASE = 'http://127.0.0.1:8787';

const pass = [];
const fail = [];

function record(name, ok, detail = '') {
  const symbol = ok ? '✅ PASS' : '❌ FAIL';
  const msg = `${symbol}: ${name}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  if (ok) pass.push(msg);
  else fail.push(msg);
}

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🚀 OPUS OS: RUNNING AI & EDGE INTEGRATION TEST SUITE');
  console.log('===========================================================\n');

  let sessionCookie = '';

  // ---------------------------------------------------------
  // 1. PUBLIC EDGE CACHING & SEO VERIFICATION
  // ---------------------------------------------------------
  console.log('--- TEST GROUP 1: Edge Caching & SEO Endpoints ---');

  // Test 1.1: Sitemap XML & Cache Header
  try {
    const res = await fetch(`${API_BASE}/sitemap.xml`);
    const text = await res.text();
    const cacheHeader = res.headers.get('cache-control') || '';
    const hasDomain = text.includes('https://opusoverseas.com');
    const hasSWR = cacheHeader.includes('stale-while-revalidate');

    record('Sitemap XML Domain & Delivery', res.status === 200 && hasDomain, `Status: ${res.status}, Domain verified`);
    record('Sitemap Cache-Control Header', hasSWR, `Cache-Control: ${cacheHeader}`);
  } catch (err) {
    record('Sitemap XML Delivery', false, err.message);
  }

  // Test 1.2: Robots.txt & RFC 9309 Compliance
  try {
    const res = await fetch(`${API_BASE}/robots.txt`);
    const text = await res.text();
    const cacheHeader = res.headers.get('cache-control') || '';
    const hasGPTBot = text.includes('User-agent: GPTBot');
    const hasSitemap = text.includes('Sitemap: https://opusoverseas.com/sitemap.xml');

    record('Robots.txt AI Crawlers & RFC 9309', res.status === 200 && hasGPTBot && hasSitemap, `Status: ${res.status}`);
    record('Robots.txt 24h Edge Cache Header', cacheHeader.includes('max-age=86400'), `Cache-Control: ${cacheHeader}`);
  } catch (err) {
    record('Robots.txt Delivery', false, err.message);
  }

  // Test 1.3: Public Catalog Edge Caching Header
  try {
    const res = await fetch(`${API_BASE}/api/public/courses`);
    const cacheHeader = res.headers.get('cache-control') || '';
    const hasSWR = cacheHeader.includes('stale-while-revalidate=600');

    record('Public API Edge Micro-caching (stale-while-revalidate)', res.status === 200 && hasSWR, `Header: ${cacheHeader}`);
  } catch (err) {
    record('Public API Edge Caching', false, err.message);
  }

  // ---------------------------------------------------------
  // 2. AUTHENTICATION & SUPERADMIN SESSION
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Authentication & RBAC Session ---');
  try {
    const testPassword = process.env.ADMIN_PASSWORD || 'DevOnlyPass#2026!';
    const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@opusoverseas.com', password: testPassword }),
    });

    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
    }

    record('Superadmin Authentication', loginRes.status === 200 || loginRes.status === 302, `Session cookie obtained`);
  } catch (err) {
    record('Superadmin Authentication', false, err.message);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
  };

  // ---------------------------------------------------------
  // 3. SUPERADMIN AI GOVERNANCE & MODEL CATALOG API
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Superadmin AI Governance & Model Catalog ---');

  // Test 3.1: Fetch AI Config & Full Model Matrix
  let aiConfig = null;
  try {
    const res = await fetch(`${API_BASE}/api/admin/ai/config`, { headers: authHeaders });
    const json = await res.json();
    aiConfig = json;

    const hasModels = json.models && json.models.text && json.models.text.length >= 4;
    const hasSettings = json.settings && json.settings.features && json.settings.features.visaRiskCopilot;

    record('AI Governance Config & Model Matrix API', res.status === 200 && hasModels && hasSettings, `${json.models?.text?.length} text models, ${json.models?.vision?.length} vision models available`);
  } catch (err) {
    record('AI Governance Config API', false, err.message);
  }

  // Test 3.2: Update AI Governance & Toggle Aggressive Caching
  try {
    const updateRes = await fetch(`${API_BASE}/api/admin/ai/config`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        ...aiConfig.settings,
        aggressiveCacheEnabled: true,
        cacheTtlSeconds: 604800,
        features: {
          ...aiConfig.settings.features,
          visaRiskCopilot: {
            ...aiConfig.settings.features.visaRiskCopilot,
            model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          },
        },
      }),
    });
    const updateJson = await updateRes.json();

    record('Superadmin AI Config Update & Cache Activation', updateRes.status === 200 && updateJson.settings.aggressiveCacheEnabled === true, `Model: ${updateJson.settings.features.visaRiskCopilot.model}`);
  } catch (err) {
    record('Superadmin AI Config Update', false, err.message);
  }

  // Test 3.3: Batch Prompts Execution Test Bench
  try {
    const batchRes = await fetch(`${API_BASE}/api/admin/ai/batch-test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model: '@cf/meta/llama-3.1-8b-instruct',
        prompts: [
          'Evaluate student with 75% in B.Tech for UK MS Data Science.',
          'Evaluate student with 82% in B.Tech for Germany MS Informatics.',
        ],
      }),
    });
    const batchJson = await batchRes.json();

    record('Batch Prompts Parallel Edge Execution', batchRes.status === 200 && batchJson.success && batchJson.total === 2, `Latency: ${batchJson.latencyMs}ms (Avg ${batchJson.avgLatencyPerPromptMs}ms/req)`);
  } catch (err) {
    record('Batch Prompts Benchmark', false, err.message);
  }

  // ---------------------------------------------------------
  // 4. STAFF AI COPILOT & AGGRESSIVE KV CACHING
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Staff AI Copilot & Aggressive KV Caching ---');

  const testProfile = {
    targetCountry: 'United Kingdom',
    degreeLevel: 'Masters',
    academicGpaOrPercent: '74%',
    gapYears: 1,
    workExperienceYears: 1,
    ieltsOverall: '6.5',
    budgetInrLakhs: 28,
    priorVisaRefusals: false,
    notes: 'B.Tech in Computer Science, looking for Sept 2026 intake.',
  };

  // Test 4.1: Initial Visa Risk Evaluation (Inference run)
  try {
    const riskRes1 = await fetch(`${API_BASE}/api/staff/ai/visa-risk`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(testProfile),
    });
    const riskJson1 = await riskRes1.json();

    const hasScore = riskJson1.assessment && typeof riskJson1.assessment.score === 'number';
    const hasRisk = riskJson1.assessment && riskJson1.assessment.riskLevel;

    record('Staff AI Visa Risk Evaluation (First Run)', riskRes1.status === 200 && hasScore, `Score: ${riskJson1.assessment?.score}%, Risk: ${hasRisk}, Cached: ${riskJson1.cached}`);
  } catch (err) {
    record('Staff AI Visa Risk Evaluation (First Run)', false, err.message);
  }

  // Test 4.2: Repeat Visa Risk Evaluation (Aggressive KV Cache Hit!)
  try {
    const riskRes2 = await fetch(`${API_BASE}/api/staff/ai/visa-risk`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(testProfile),
    });
    const riskJson2 = await riskRes2.json();

    const isCached = riskJson2.cached === true;
    record('Aggressive KV Edge Cache Hit (Zero Neurons Burned)', riskRes2.status === 200 && isCached, `Cached: ${isCached}, Neurons Consumed: ${riskJson2.neuronsConsumed || 0}`);
  } catch (err) {
    record('Aggressive KV Edge Cache Hit', false, err.message);
  }

  // Test 4.3: Batch Visa Risk Evaluation (Parallel Applicants)
  try {
    const batchRiskRes = await fetch(`${API_BASE}/api/staff/ai/batch-visa-risk`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        applicants: [
          { ...testProfile, clientId: 'CLI-001', targetCountry: 'United Kingdom' },
          { ...testProfile, clientId: 'CLI-002', targetCountry: 'Germany', gapYears: 3 },
          { ...testProfile, clientId: 'CLI-003', targetCountry: 'United States', ieltsOverall: '7.5' },
        ],
      }),
    });
    const batchRiskJson = await batchRiskRes.json();

    record('Staff Batch Visa Risk Evaluator (3 Parallel Candidates)', batchRiskRes.status === 200 && batchRiskJson.totalProcessed === 3, `Processed ${batchRiskJson.totalProcessed} candidate files`);
  } catch (err) {
    record('Staff Batch Visa Risk Evaluator', false, err.message);
  }

  // Test 4.4: Statement of Purpose (SOP) Studio Generator
  try {
    const sopRes = await fetch(`${API_BASE}/api/staff/ai/generate-sop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        studentName: 'Ananya Roy',
        targetUniversity: 'University of Edinburgh',
        targetCourse: 'MSc Artificial Intelligence',
        targetCountry: 'United Kingdom',
        educationalBackground: 'B.Tech in Information Technology (78%)',
        careerGoals: 'Lead Machine Learning Infrastructure teams in Healthcare AI',
      }),
    });
    const sopJson = await sopRes.json();
    const hasSop = typeof sopJson.sop === 'string' && sopJson.sop.length > 50;

    record('Staff AI SOP Studio Generator', sopRes.status === 200 && hasSop, `Generated ${sopJson.sop?.length || 0} character academic SOP`);
  } catch (err) {
    record('Staff AI SOP Studio Generator', false, err.message);
  }

  // ---------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------
  console.log('\n===========================================================');
  console.log(`🏁 TEST EXECUTION COMPLETE: ${pass.length} PASSED, ${fail.length} FAILED`);
  console.log('===========================================================');

  if (fail.length > 0) {
    process.exit(1);
  }
}

runTestSuite();
