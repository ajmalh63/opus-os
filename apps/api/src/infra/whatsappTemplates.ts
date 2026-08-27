// WhatsApp Message Templates Catalog (Operational & Marketing Automation)
// Supports dynamic variable interpolation with strict money handling (paise -> INR format).

export type WhatsAppTemplateKey =
  | 'INVOICE_GENERATED'
  | 'AGREEMENT_SIGN_LINK'
  | 'CONSULTATION_CONFIRMATION'
  | 'CONSULTATION_REMINDER'
  | 'APPLICATION_MILESTONE'
  | 'UMRAH_BOOKING_CONFIRMED'
  | 'ATTESTATION_TRACKING_UPDATE'
  | 'HOT_TIER_VIP_FAST_TRACK'
  | 'WARM_TIER_ROADMAP'
  | 'COLD_TIER_REACTIVATION'
  | 'ABANDONED_BOOKING_RECOVERY';

export interface WhatsAppTemplateDef {
  key: WhatsAppTemplateKey;
  name: string;
  category: 'operational' | 'marketing';
  division: string;
  description: string;
  sampleVariables: Record<string, string>;
  template: (vars: Record<string, any>) => string;
}

export function formatInrPaise(paise: number): string {
  const rupees = Math.floor(paise / 100);
  return '₹' + rupees.toLocaleString('en-IN');
}

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, WhatsAppTemplateDef> = {
  INVOICE_GENERATED: {
    key: 'INVOICE_GENERATED',
    name: 'Official Invoice & Payment Receipt',
    category: 'operational',
    division: 'all',
    description: 'Instant receipt notification upon verified payment receipt.',
    sampleVariables: { name: 'Rahul Sharma', invoiceNo: 'INV-2026-0891', amountPaise: '5000000', division: 'Study Abroad', receiptUrl: 'https://opusoverseas.com/portal/receipt/891' },
    template: (v) => `*Official Payment Receipt · Opus Overseas* 🏛️

Dear *${v.name || 'Valued Client'}*,

Thank you! We have received your payment for *${v.division || 'Opus Overseas Services'}*.

📄 *Invoice No:* ${v.invoiceNo || 'INV-2026'}
💰 *Amount Received:* ${typeof v.amountPaise === 'number' ? formatInrPaise(v.amountPaise) : (v.amount || '₹—')}
📅 *Date:* ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
✅ *Status:* Confirmed & Processed

👉 *View / Download Receipt:* ${v.receiptUrl || 'https://opusoverseas.com/portal'}

Our operations desk is actively moving your file forward. Reply to this chat if you have any questions.`,
  },

  AGREEMENT_SIGN_LINK: {
    key: 'AGREEMENT_SIGN_LINK',
    name: 'Legal Service Agreement Ready for e-Signature',
    category: 'operational',
    division: 'all',
    description: 'Dispatches legal terms and secure signing link.',
    sampleVariables: { name: 'Priya Patel', division: 'Global Visa Advisory', signUrl: 'https://opusoverseas.com/sign/v1', expiresInHours: '48' },
    template: (v) => `*Action Required: Service Agreement for ${v.name || 'Applicant'}* ✍️

Hello *${v.name || 'there'}*,

Your official service agreement for *${v.division || 'Opus Overseas'}* has been generated and is ready for secure digital signature.

⏳ *Validity:* Next ${v.expiresInHours || '48'} hours
🔒 *Secure e-Sign Link:* ${v.signUrl || 'https://opusoverseas.com/sign'}

Once signed, your dedicated counselor will begin your file preparation immediately.`,
  },

  CONSULTATION_CONFIRMATION: {
    key: 'CONSULTATION_CONFIRMATION',
    name: '1-on-1 Consultation Scheduled',
    category: 'operational',
    division: 'consultation',
    description: 'Confirmed date, time, and meeting link for advisory session.',
    sampleVariables: { name: 'Aman Khan', counselor: 'Dr. S. Mukherjee', dateTime: '22 Aug 2026 at 4:30 PM IST', meetUrl: 'https://meet.google.com/xyz-opus' },
    template: (v) => `*Consultation Confirmed · Opus Overseas* 🗓️

Hello *${v.name || 'there'}*,

Your dedicated 1-on-1 strategy consultation has been locked in.

👤 *Advisor:* ${v.counselor || 'Senior Admissions Director'}
⏰ *Time:* ${v.dateTime || 'Scheduled Time'}
🔗 *Meeting Link:* ${v.meetUrl || 'https://meet.google.com/opus-session'}

Please keep your academic transcripts or previous travel history handy for a productive session.`,
  },

  CONSULTATION_REMINDER: {
    key: 'CONSULTATION_REMINDER',
    name: 'Consultation 1-Hour Reminder',
    category: 'operational',
    division: 'consultation',
    description: 'Sent 60 minutes prior to scheduled advisory call.',
    sampleVariables: { name: 'Aman Khan', counselor: 'Dr. S. Mukherjee', meetUrl: 'https://meet.google.com/xyz-opus' },
    template: (v) => `*Reminder: Your Consultation Starts in 1 Hour* ⏳

Hi *${v.name || 'there'}*,

Your strategy session with *${v.counselor || 'Senior Counselor'}* starts in 60 minutes.

👉 *Join Here:* ${v.meetUrl || 'https://meet.google.com/opus-session'}

See you shortly!`,
  },

  APPLICATION_MILESTONE: {
    key: 'APPLICATION_MILESTONE',
    name: 'Application Milestone & Approval Alert',
    category: 'operational',
    division: 'study-abroad',
    description: 'High-urgency alert for offer letter receipt or visa approval.',
    sampleVariables: { name: 'Sneha Roy', institution: 'University of Birmingham (UK)', milestone: 'Conditional Offer Letter Issued', portalUrl: 'https://opusoverseas.com/portal' },
    template: (v) => `*🎉 Milestone Alert: ${v.milestone || 'Update on Your Application'}*

Dear *${v.name || 'Student'}*,

Great news! We have received a key update from *${v.institution || 'Your Target Institution'}*:

📋 *Status:* ${v.milestone || 'Offer Letter Received'}
🌐 *Client Portal:* ${v.portalUrl || 'https://opusoverseas.com/portal'}

Our counselor is reviewing the decision terms and will call you shortly to outline the next steps.`,
  },

  UMRAH_BOOKING_CONFIRMED: {
    key: 'UMRAH_BOOKING_CONFIRMED',
    name: 'Umrah Package Booking & Departure Manifest',
    category: 'operational',
    division: 'umrah',
    description: 'Confirmed flight blocks, Makkah/Madinah hotel vouchers.',
    sampleVariables: { name: 'Mohammed Farooq', departureDate: '15 Sep 2026', packageName: '15-Day Executive Clock Tower', paxCount: '4', hotel: 'Fairmont Makkah (Front View)' },
    template: (v) => `*Blessed Umrah Journey Confirmed* 🕋

Assalamu Alaikum *${v.name || 'Respected Pilgrim'}*,

Your booking for the *${v.packageName || 'Executive Umrah Package'}* has been confirmed!

📅 *Departure Date:* ${v.departureDate || 'Confirmed Departure'}
👥 *Travellers (Pax):* ${v.paxCount || '1'}
🏨 *Makkah Hotel:* ${v.hotel || 'Luxury 5-Star (0-100m from Haram)'}
🛂 *Visa Status:* Processing Under Ministry of Hajj Quota

Our pilgrim care desk will share your flight tickets and visa documents 7 days before departure.`,
  },

  ATTESTATION_TRACKING_UPDATE: {
    key: 'ATTESTATION_TRACKING_UPDATE',
    name: 'Document Attestation Chain Status',
    category: 'operational',
    division: 'attestation',
    description: 'Real-time stage tracking as document moves through MEA & Embassy.',
    sampleVariables: { name: 'Karthik Raja', documentType: 'Degree Certificate', currentStage: 'MEA New Delhi (Apostille Seal)', awb: 'INP892019482IN' },
    template: (v) => `*Document Attestation Update* 📑

Hello *${v.name || 'Applicant'}*,

Your *${v.documentType || 'Document'}* has completed the next verification stage:

🏛️ *Current Stage:* ${v.currentStage || 'MEA Verification Completed'}
🚚 *Tracking / AWB:* ${v.awb || 'Live Tracking Active'}
🔒 *Security:* Sealed in tamper-evident pouch

Track your document chain anytime on your Opus OS portal.`,
  },

  HOT_TIER_VIP_FAST_TRACK: {
    key: 'HOT_TIER_VIP_FAST_TRACK',
    name: 'Hot Tier: Senior Counselor WhatsApp Introduction',
    category: 'marketing',
    division: 'all',
    description: 'Instant VIP introduction to high-intent leads.',
    sampleVariables: { name: 'Zaid Khan', division: 'Study Abroad (UK/USA)', counselor: 'Director of Global Admissions', waiverDeadline: '48 Hours' },
    template: (v) => `*VIP Priority Status Allocated · Opus Overseas* ⭐

Hello *${v.name || 'there'}*,

I am *${v.counselor || 'Senior Admissions Advisor'}* from Opus Overseas. Based on your profile inquiry for *${v.division || 'Overseas Admissions'}*, your file has been placed in our **Priority Queue**.

✨ *Exclusive Benefits Active for Your File:*
• 100% Application Fee Waiver on partner universities
• Direct 1-on-1 profile evaluation & institutional match
• Priority fast-track visa filing compliance

To schedule a dedicated 15-minute consultation with me, reply directly to this chat or pick a slot here: https://opusoverseas.com/bookings

How can I best assist you today?`,
  },

  WARM_TIER_ROADMAP: {
    key: 'WARM_TIER_ROADMAP',
    name: 'Warm Tier: 5-Step Master Roadmap Delivery',
    category: 'marketing',
    division: 'all',
    description: 'Sends strategic blueprint to engaged leads.',
    sampleVariables: { name: 'Aditi Nair' },
    template: (v) => `*Your 5-Step Overseas Roadmap · Opus Overseas* 🗺️

Hi *${v.name || 'there'}*,

Navigating overseas admissions and visas doesn't have to be stressful. Here is the proven 5-step blueprint that delivers a 99.4% approval rate:

1️⃣ *Profile Assessment:* Matching GPA, test scores & budget to top institutions.
2️⃣ *SOP & Document Perfection:* Professional review meeting embassy standards.
3️⃣ *Fast-Track Offer Letters:* Direct institutional representation.
4️⃣ *Proof of Funds & Visa Prep:* Mock interviews & financial audit.
5️⃣ *Pre-Departure Community:* Housing, forex & student network.

Download your full checklist PDF: https://opusoverseas.com

Reply *EVALUATE* anytime to have our team review your academic score for free!`,
  },

  COLD_TIER_REACTIVATION: {
    key: 'COLD_TIER_REACTIVATION',
    name: 'Cold Tier: 2026/2027 Policy & Deadline Alert',
    category: 'marketing',
    division: 'all',
    description: 'Re-engages inactive contacts with high-urgency intake quotas.',
    sampleVariables: { name: 'Vikram Singh' },
    template: (v) => `*Important Intake Notice for 2026/2027* 📢

Hello *${v.name || 'there'}*,

Global immigration bodies and international universities have updated their admissions criteria for the upcoming **Fall 2026 & Spring 2027 Intakes**.

Key changes:
• Early scholarship quotas (up to 50% tuition grants) are now open.
• Streamlined post-study work permit streams confirmed.

If you are still planning your international journey, reply *YES* or check updated cutoffs in 60 seconds: https://opusoverseas.com`,
  },

  ABANDONED_BOOKING_RECOVERY: {
    key: 'ABANDONED_BOOKING_RECOVERY',
    name: 'Abandoned Intake / Booking Recovery',
    category: 'marketing',
    division: 'all',
    description: 'Proactive check-in when a lead starts form but drops off.',
    sampleVariables: { name: 'Farhan Ali', division: 'Visa Filing' },
    template: (v) => `*Quick check-in from Opus Overseas* 👋

Hi *${v.name || 'there'}*,

We noticed you started checking eligibility for *${v.division || 'Overseas Opportunities'}* but didn't finish.

Did you run into any questions or need help selecting the right country/program?

Reply directly to this WhatsApp message — our counseling desk is here to help you 1-on-1!`,
  },
};

export function renderWhatsAppMessage(key: WhatsAppTemplateKey, variables: Record<string, any> = {}): string {
  const tpl = WHATSAPP_TEMPLATES[key];
  if (!tpl) return `Hello ${variables.name || 'there'}, update from Opus Overseas.`;
  return tpl.template(variables);
}
