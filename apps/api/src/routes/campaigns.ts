// Campaign catalog & Score-Driven Journeys (Wave 3 Tool-First + Marketing Intelligence)
// Provides score-tiered campaign matrices (Hot 75+, Warm 40-74, Cold <40, Stale >30d)
// and multi-touch execution plans across Listmonk, Mautic, Chatwoot, and OpenWA.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { campaigns, campaignTouches, clients, scoringEvents, engagements, consents } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

type CampaignBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };
type D1 = ReturnType<typeof getDb>;

export const campaignsRouter = new Hono<{ Bindings: CampaignBindings }>();

const HOT_THRESHOLD = 75;
const WARM_THRESHOLD = 40;
const THIRTY_DAYS_SEC = 30 * 86400;

// Curated score-driven journeys for OpusOS business divisions
const SCORE_JOURNEYS = [
  {
    id: 'journey-study-abroad-hot',
    key: 'study_abroad_vip_hot',
    name: '🎓 Study Abroad — Fast-Track VIP Fall Intake',
    division: 'study-abroad',
    scoreTier: 'hot',
    scoreRange: '75 – 100',
    goal: 'Immediate Conversion: Application Shortlist & Signed Agreement within 48 hours',
    description: 'High-intent students with verified test scores/budgets ready for direct university submission.',
    channelStack: ['WhatsApp (OpenWA)', 'Listmonk HTML Email', 'Direct Agreement e-Sign', 'Phone Call'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'VIP Welcome & Fast-Track Intro',
        subject: 'Welcome to Opus VIP Admissions 🎓',
        body: 'Hi {name}! Your profile matches high-acceptance universities for the upcoming intake. Our Senior Admissions Director is holding a 1-on-1 spot for your consultation. Book direct slot: {booking_url}',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 1,
        channel: 'email',
        stage: 'Curated Shortlist & Scholarship Alert',
        subject: 'Exclusive University Shortlist & ₹50,000 Early Bird Grant Alert',
        body: 'Here is your personalized university match report with tuition fee waiver options. Review admission deadlines and apply before slots fill up.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 2,
        channel: 'phone_task',
        stage: 'Senior Counselor Verification Call',
        subject: '1-on-1 Document Review & Eligibility Confirmation',
        body: 'Counselor task: Review transcripts, verify SOP draft, and prepare university application payload.',
        tool: 'OpusOS CRM',
      },
      {
        seq: 4,
        day: 4,
        channel: 'agreement',
        stage: 'Service Agreement & Intake Dispatch',
        subject: 'Official Opus Overseas Service Agreement Ready for e-Sign',
        body: 'Your official admissions consulting contract is prepared. Review and e-sign directly via secure link: {sign_url}',
        tool: 'OpusOS e-Sign Vault',
      },
    ],
  },
  {
    id: 'journey-study-abroad-warm',
    key: 'study_abroad_nurture_warm',
    name: '🎓 Study Abroad — Admissions Nurture & Match Journey',
    division: 'study-abroad',
    scoreTier: 'warm',
    scoreRange: '40 – 74',
    goal: 'Build Trust: Overcome doubts, provide university comparison, book 1st consultation',
    description: 'Active students researching countries, eligibility requirements, and post-study work visas.',
    channelStack: ['Listmonk Email', 'WhatsApp Nurture', 'Mautic Drip'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'Intake Guide & Country Overview',
        subject: '2026 Global Study Abroad Guide (UK, US, Germany, Ireland)',
        body: 'Hi {name}! Thank you for exploring study options with Opus Overseas. Here is our 2026 comprehensive country & visa guide: {guide_url}',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 3,
        channel: 'email',
        stage: 'Alumni Case Study & Visa Success Story',
        subject: 'How Rahul secured his German Public University admit with 0 tuition',
        body: 'Read how a Hyderabad graduate navigated German block accounts and APS certification with Opus Overseas.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 7,
        channel: 'email',
        stage: 'Interactive Eligibility & Cost Calculator',
        subject: 'Calculate your exact tuition & living expenses for 2026',
        body: 'Use our real-time budget calculator to estimate total financial proof required for your student visa.',
        tool: 'Listmonk',
      },
      {
        seq: 4,
        day: 12,
        channel: 'whatsapp',
        stage: 'Free 1-on-1 Profile Assessment Offer',
        subject: 'Claim your free profile evaluation this week',
        body: 'Hi {name}, our counselors have 3 free slots remaining this week for university eligibility reviews. Reply YES to reserve.',
        tool: 'OpenWA',
      },
    ],
  },
  {
    id: 'journey-umrah-hot',
    key: 'umrah_vip_hot',
    name: '🕋 Umrah Pilgrimage — VIP Departure Countdown',
    division: 'umrah',
    scoreTier: 'hot',
    scoreRange: '75 – 100',
    goal: 'Advance Booking: Confirm group flight seats and hotel room allocation',
    description: 'Pilgrims with target dates, family passenger counts, and budget ready for booking.',
    channelStack: ['WhatsApp (OpenWA)', 'Listmonk Email', 'Direct Booking Portal'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'VIP Package Details & Clock Tower Hotels',
        subject: 'Upcoming Umrah Group Departure: 5-Star Makkah & Madinah Itinerary 🕋',
        body: 'Assalamu Alaikum {name}! We have 6 remaining seats on our upcoming direct Hyderabad departure. Direct flight + 5-star Clock Tower hotel itinerary: {package_url}',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 1,
        channel: 'email',
        stage: 'Family Pricing & Flight Schedule',
        subject: 'Complete Day-by-Day Itinerary & Family Pricing Schedule',
        body: 'Detailed breakdown of adult, child-with-bed, and infant pricing in INR paise with zero hidden fees.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 3,
        channel: 'agreement',
        stage: 'Advance Booking & Seat Reservation',
        subject: 'Reserve Your Group Departure Seats (₹500 Advance)',
        body: 'Secure your family seats online with instant Razorpay confirmation: {booking_url}',
        tool: 'OpusOS Portal',
      },
    ],
  },
  {
    id: 'journey-umrah-warm',
    key: 'umrah_nurture_warm',
    name: '🕋 Umrah Pilgrimage — Spiritual Nurture & Group Comparison',
    division: 'umrah',
    scoreTier: 'warm',
    scoreRange: '40 – 74',
    goal: 'Education & Trust: Guide on visa rules, hotel proximity, and best travel seasons',
    description: 'Pilgrims planning trips for upcoming months (Ramadan, Shaban, winter holidays).',
    channelStack: ['Listmonk Email', 'WhatsApp Updates'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'Umrah Preparation & Checklist PDF',
        subject: 'Complete Umrah Spiritual & Packing Guide',
        body: 'Assalamu Alaikum {name}! Download our complimentary Umrah pilgrim preparation handbook and checklist: {checklist_url}',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 4,
        channel: 'email',
        stage: 'Group vs Solo Package Transparency',
        subject: 'Choosing between Fixed Group Departures and Custom Solo Packages',
        body: 'Everything you need to know about catering, guided Ziyarat tours in AC luxury buses, and Saudi Tourist/Umrah visa validity.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 9,
        channel: 'whatsapp',
        stage: 'Early Bird Group Departure Alert',
        subject: 'New Hyderabad Departure Dates Announced',
        body: 'Assalamu Alaikum {name}, new direct departure dates from Rajiv Gandhi International Airport are now open for booking.',
        tool: 'OpenWA',
      },
    ],
  },
  {
    id: 'journey-attestation-hot',
    key: 'attestation_express_hot',
    name: '📜 Attestation & Apostille — Express Processing Chain',
    division: 'attestation',
    scoreTier: 'hot',
    scoreRange: '40 – 100',
    goal: 'Pickup Booking: Schedule doorstep document pickup and issue AWB tracking',
    description: 'Clients urgently requiring HRD, MEA, Apostille, or Embassy legalization for visa/job deadlines.',
    channelStack: ['WhatsApp (OpenWA)', 'Listmonk Email', 'Courier Tracking'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'Document Checklist & Rate Card',
        subject: 'Attestation Requirements for {country} Legalization',
        body: 'Hi {name}! For {country} attestation, please ensure original degree + all mark sheets are ready. Schedule free courier pickup: {pickup_url}',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 2,
        channel: 'email',
        stage: 'Step-by-Step Chain Transparency',
        subject: 'Understanding the Legalization Chain: State HRD ➔ MEA ➔ Embassy',
        body: 'Track every step of your certificate attestation with live WhatsApp milestones and insured return dispatch.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 4,
        channel: 'whatsapp',
        stage: 'Free Doorstep Pickup Confirmation',
        subject: 'Doorstep Courier Dispatch Available Today',
        body: 'Reply with your address to book insured BlueDart/DTDC pickup from anywhere in Telangana & Andhra Pradesh.',
        tool: 'OpenWA',
      },
    ],
  },
  {
    id: 'journey-global-cold',
    key: 'global_newsletter_cold',
    name: '🌐 Global Discovery — Monthly Policy & Opportunity Digest',
    division: 'general',
    scoreTier: 'cold',
    scoreRange: '0 – 39',
    goal: 'Re-engagement: Increase awareness and elevate lead score via newsletter clicks',
    description: 'Early-stage website visitors and subscribers in the initial discovery phase.',
    channelStack: ['Listmonk Newsletter', 'Mautic Broadcast'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'email',
        stage: 'Monthly Global Visa & Education Bulletin',
        subject: 'Opus Overseas Monthly Digest: Visa Changes & University Intakes',
        body: 'Latest policy updates: UK Graduate Route extensions, German opportunity cards, and Saudi multi-entry visa rules.',
        tool: 'Listmonk',
      },
      {
        seq: 2,
        day: 7,
        channel: 'email',
        stage: 'Top 5 High-ROI Programs for Indian Students',
        subject: 'Affordable English-Taught Programs with Post-Study Work Visas',
        body: 'Discover top accredited colleges with low tuition fees and robust job placement networks.',
        tool: 'Listmonk',
      },
      {
        seq: 3,
        day: 15,
        channel: 'whatsapp',
        stage: 'Free Live Q&A Webinar Invitation',
        subject: 'Live Zoom Session: Ask Our Senior Visa Experts',
        body: 'Join our weekly live webinar this Saturday at 5 PM IST. Register for free: {webinar_url}',
        tool: 'OpenWA',
      },
    ],
  },
  {
    id: 'journey-reactivation-stale',
    key: 'stale_lead_reactivation',
    name: '🔄 Stale Lead Reactivation — Intake Deadline Fee Waiver',
    division: 'general',
    scoreTier: 'stale',
    scoreRange: 'Inactive > 30 Days',
    goal: 'Re-activation: Win back unclosed leads with time-limited intake incentives',
    description: 'Leads with zero interactions in over 30 days who previously expressed interest.',
    channelStack: ['WhatsApp Broadcast', 'Listmonk Email'],
    touches: [
      {
        seq: 1,
        day: 0,
        channel: 'whatsapp',
        stage: 'Urgent Intake Closing Alert & Fee Waiver',
        subject: 'Upcoming Intake Closes in 10 Days — Special Application Fee Waiver',
        body: 'Hi {name}! We noticed you explored overseas opportunities with us previously. Upcoming deadlines are closing in 10 days. Reply RECONNECT for an instant fee waiver on your processing.',
        tool: 'OpenWA',
      },
      {
        seq: 2,
        day: 3,
        channel: 'email',
        stage: 'Dedicated Counselor Re-Assignment',
        subject: 'Your dedicated Opus counselor is ready to assist you',
        body: 'Schedule a direct 10-minute catch-up call at your convenience: {call_url}',
        tool: 'Listmonk',
      },
    ],
  },
];

// GET /api/admin/campaigns/matrix — dynamic score tiers + qualifying lead counts + journeys
campaignsRouter.get('/matrix', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const allClients = await db.select().from(clients).all();
    const allScoring = await db.select().from(scoringEvents).orderBy(desc(scoringEvents.createdAt)).all();
    const allEngagements = await db.select().from(engagements).all();

    // Map client scores
    const clientScoreMap = new Map<string, { total: number; lastAt: number }>();
    for (const s of allScoring) {
      const cur = clientScoreMap.get(s.clientId) || { total: 0, lastAt: 0 };
      cur.total += Math.max(0, s.points);
      if (s.createdAt > cur.lastAt) cur.lastAt = s.createdAt;
      clientScoreMap.set(s.clientId, cur);
    }

    // Classify leads
    const tiers = {
      hot: [] as any[],
      warm: [] as any[],
      cold: [] as any[],
      stale: [] as any[],
    };

    const divisionStats: Record<string, { total: number; hot: number; warm: number; cold: number }> = {
      'study-abroad': { total: 0, hot: 0, warm: 0, cold: 0 },
      'umrah': { total: 0, hot: 0, warm: 0, cold: 0 },
      'attestation': { total: 0, hot: 0, warm: 0, cold: 0 },
      'visa': { total: 0, hot: 0, warm: 0, cold: 0 },
      'manpower': { total: 0, hot: 0, warm: 0, cold: 0 },
      'general': { total: 0, hot: 0, warm: 0, cold: 0 },
    };

    for (const cl of allClients) {
      const scoreData = clientScoreMap.get(cl.id) || { total: 0, lastAt: cl.createdAt };
      const eng = allEngagements.find((e) => e.clientId === cl.id);
      const division = eng?.division || 'general';
      const isStale = (now - (scoreData.lastAt || cl.createdAt)) > THIRTY_DAYS_SEC;

      const leadSummary = {
        id: cl.id,
        name: cl.name,
        email: cl.email,
        phone: cl.phone,
        division,
        score: scoreData.total,
        lastActiveAt: scoreData.lastAt || cl.createdAt,
      };

      if (divisionStats[division]) {
        divisionStats[division].total++;
      }

      if (isStale) {
        tiers.stale.push(leadSummary);
      }

      if (scoreData.total >= HOT_THRESHOLD) {
        tiers.hot.push(leadSummary);
        if (divisionStats[division]) divisionStats[division].hot++;
      } else if (scoreData.total >= WARM_THRESHOLD) {
        tiers.warm.push(leadSummary);
        if (divisionStats[division]) divisionStats[division].warm++;
      } else {
        tiers.cold.push(leadSummary);
        if (divisionStats[division]) divisionStats[division].cold++;
      }
    }

    // Attach real qualifying lead counts to journeys
    const journeysWithCounts = SCORE_JOURNEYS.map((j) => {
      let qualifyingCount = 0;
      if (j.scoreTier === 'hot') {
        qualifyingCount = j.division === 'general'
          ? tiers.hot.length
          : tiers.hot.filter((l) => l.division === j.division).length;
      } else if (j.scoreTier === 'warm') {
        qualifyingCount = j.division === 'general'
          ? tiers.warm.length
          : tiers.warm.filter((l) => l.division === j.division).length;
      } else if (j.scoreTier === 'cold') {
        qualifyingCount = j.division === 'general'
          ? tiers.cold.length
          : tiers.cold.filter((l) => l.division === j.division).length;
      } else if (j.scoreTier === 'stale') {
        qualifyingCount = tiers.stale.length;
      }

      return {
        ...j,
        qualifyingLeadsCount: qualifyingCount,
      };
    });

    return c.json({
      ok: true,
      generatedAt: now,
      summary: {
        totalLeads: allClients.length,
        hotCount: tiers.hot.length,
        warmCount: tiers.warm.length,
        coldCount: tiers.cold.length,
        staleCount: tiers.stale.length,
      },
      divisionStats,
      journeys: journeysWithCounts,
    });
  } catch (e: any) {
    return c.json({ error: 'Failed to compute campaign score matrix', details: e.message }, 500);
  }
});

// GET /api/admin/campaigns — read-only catalog with touches (newest first)
campaignsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(campaigns).all();
    const result = [];
    for (const r of rows) {
      const touches = await db.select().from(campaignTouches).where(eq(campaignTouches.campaignId, r.id)).all()
        .then((t) => t.slice().sort((a, b) => a.seq - b.seq));
      result.push({ ...r, touches });
    }
    result.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    return c.json({ campaigns: result });
  } catch (e: any) {
    return c.json({ error: 'Campaign list failed', details: e.message }, 500);
  }
});