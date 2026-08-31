import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSyncClient } from '../../lib/syncClient';

const API = (import.meta as any).env?.VITE_API_URL || '';

/* ==========================================================================
   VISA SERVICES — client-facing application desk (Visa Phase-1)
   Three modes: Catalogue → Draft Wizard (9 steps) → Tracker.
   Identity/auth: the portal TOKEN doubles as the client id — the exact same
   token already handed to /lookup and /documents/presigned, so we reuse it
   for every visa endpoint below (token-auth, spec section 3).
   ========================================================================== */

type VisaSectionKey = 'applicant' | 'passport' | 'contact' | 'employment' | 'travel' | 'financial' | 'visaHistory';

interface VisaProduct {
  id: string;
  country: string;
  visaType: string;
  entryType: string;
  processingTime: string;
  feePaise: number;
  requiredDocs: string[];
}

interface VisaDocRow {
  id: string;
  fileName: string;
  version: string;
  status: 'pending' | 'verified' | 'rejected';
  uploadedAt: number | null;
  verifiedAt: number | null;
}

interface VisaApplicationRow {
  id: string;
  country: string;
  visaType: string;
  status: string;
  appointmentDate: number | null;
  appointmentLocation: string | null;
  notes: string | null;
  formJson: Record<string, any> | null;
  submittedAt: number | null;
  decisionAt: number | null;
  rejectionReason: string | null;
  deliveredAt: number | null;
  createdAt: number;
  updatedAt: number;
  requiredDocs: string[];
  documents: VisaDocRow[];
}

const VISA_STEPS: { key: string; label: string }[] = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'passport', label: 'Passport' },
  { key: 'contact', label: 'Contact' },
  { key: 'employment', label: 'Employment' },
  { key: 'travel', label: 'Travel' },
  { key: 'financial', label: 'Financial' },
  { key: 'visaHistory', label: 'Visa History' },
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review' },
];

const VISA_FLOW: { key: string; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'document_prep', label: 'Document Prep' },
  { key: 'slot_booked', label: 'Slot Booked' },
  { key: 'granted', label: 'Granted' },
  { key: 'delivered', label: 'Delivered' },
];

const VISA_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VISA_INPUT = 'w-full text-sm sm:text-base px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 outline-none transition font-medium shadow-xs';
const VISA_LABEL = 'text-xs font-bold uppercase tracking-wider text-slate-600';
const VISA_HEADING = 'text-xs font-extrabold uppercase tracking-widest text-brand-gold';
const VISA_BTN = 'bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white font-bold transition shadow-xs text-xs sm:text-sm';

const visaBlockedEdit = (s: string) => ['granted', 'rejected', 'delivered', 'cancelled'].includes(s);

const visaChip = (s: string) =>
  ['granted', 'delivered'].includes(s)
    ? 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200'
    : ['rejected', 'cancelled'].includes(s)
      ? 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200'
      : 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200';

const docBadge = (s: string) =>
  s === 'verified'
    ? 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200'
    : s === 'rejected'
      ? 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200'
      : 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200';

function validateVisaSection(key: VisaSectionKey, s: Record<string, any> | undefined): string {
  const sec = s || {};
  const required = (v: any, label: string) => {
    if (v === undefined || v === null || String(v).trim() === '') return `${label} is required.`;
    return '';
  };
  const date = (v: any, label: string) => {
    const r = required(v, label);
    if (r) return r;
    if (!VISA_DATE_RE.test(String(v))) return `${label} must be a valid date (YYYY-MM-DD).`;
    return '';
  };
  const boolSet = (v: any, label: string) => (typeof v === 'boolean' ? '' : `${label} is required.`);
  switch (key) {
    case 'applicant':
      return required(sec.fullName, 'Full name')
        || date(sec.dob, 'Date of birth')
        || (!sec.gender ? 'Gender is required.' : '')
        || (!sec.maritalStatus ? 'Marital status is required.' : '');
    case 'passport': {
      if (!required(sec.number, 'Passport number')) {
        if (String(sec.number).length < 4) return 'Passport number must be at least 4 characters.';
        if (!/^[A-Z0-9]+$/.test(String(sec.number))) return 'Passport number allows only uppercase letters and digits.';
      }
      return required(sec.number, 'Passport number')
        || date(sec.issueDate, 'Passport issue date')
        || date(sec.expiryDate, 'Passport expiry date')
        || required(sec.placeOfIssue, 'Place of issue')
        || boolSet(sec.hasPreviousPassport, 'Previous passport')
        || (sec.hasPreviousPassport ? required(sec.previousPassportNumber, 'Previous passport number') : '');
    }
    case 'contact':
      return required(sec.address, 'Residential address')
        || required(sec.city, 'City')
        || required(sec.state, 'State')
        || required(sec.pincode, 'PIN code')
        || required(sec.emergencyContact, 'Emergency contact')
        || required(sec.emergencyPhone, 'Emergency contact phone');
    case 'employment':
      return required(sec.status, 'Employment status')
        || ((sec.status === 'salaried' || sec.status === 'self_employed')
          ? (required(sec.occupation, 'Occupation') || (sec.status === 'salaried' ? required(sec.employerName, 'Employer name') : ''))
          : '');
    case 'travel':
      return required(sec.purpose, 'Travel purpose')
        || date(sec.intendedArrival, 'Intended arrival date')
        || date(sec.intendedDeparture, 'Intended departure date')
        || required(sec.accommodation, 'Accommodation')
        || (sec.accommodation === 'hotel' ? required(sec.accommodationName, 'Hotel name') : '')
        || boolSet(sec.returnTicketBooked, 'Return ticket booked')
        || boolSet(sec.hasCompanions, 'Companions');
    case 'financial':
      return required(sec.fundingSource, 'Funding source')
        || (sec.fundingSource === 'sponsor' ? required(sec.sponsorName, 'Sponsor name') : '')
        || boolSet(sec.employmentLetterAvailable, 'Employment letter')
        || boolSet(sec.itrFiled, 'ITR filed');
    case 'visaHistory':
      return boolSet(sec.hasUsUkSchengen, 'US/UK/Schengen travel')
        || boolSet(sec.everRejected, 'Visa rejection history')
        || (sec.everRejected ? required(sec.rejectionCountry, 'Rejection country') : '')
        || boolSet(sec.everOverstayed, 'Overstay history');
  }
  return '';
}

function visaReviewRows(key: VisaSectionKey, form: Record<string, any>): [string, string][] {
  const s = form[key] || {};
  const val = (v: any) => {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    return String(v);
  };
  switch (key) {
    case 'applicant':
      return ([['Full Name', s.fullName], ['Date of Birth', s.dob], ['Gender', s.gender], ['Marital Status', s.maritalStatus], ['Nationality', s.nationality], ['Place of Birth', s.placeOfBirth]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'passport':
      return ([['Passport Number', s.number], ['Issue Date', s.issueDate], ['Expiry Date', s.expiryDate], ['Place of Issue', s.placeOfIssue], ['Country of Issue', s.countryOfIssue], ['Previous Passport', s.hasPreviousPassport], s.hasPreviousPassport ? ['Previous Number', s.previousPassportNumber] : null] as ([string, any] | null)[])
        .filter((r): r is [string, any] => r !== null)
        .map(([k, v]) => [k, val(v)]);
    case 'contact':
      return ([['Address', s.address], ['City', s.city], ['State', s.state], ['PIN Code', s.pincode], ['Phone', s.phone], ['Alternate Phone', s.alternatePhone], ['Emergency Contact', s.emergencyContact], ['Emergency Phone', s.emergencyPhone]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'employment':
      return ([['Status', s.status], ['Occupation', s.occupation], ['Employer', s.employerName], ['Designation', s.designation], ['Employer Address', s.employerAddress], ['Employer Phone', s.employerPhone], ['Years Employed', s.yearsEmployed], ['Monthly Income (₹)', s.monthlyIncome]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'travel':
      return ([['Purpose', s.purpose], ['Intended Arrival', s.intendedArrival], ['Intended Departure', s.intendedDeparture], ['Accommodation', s.accommodation], ['Accommodation Name', s.accommodationName], ['Return Ticket Booked', s.returnTicketBooked], ['Has Companions', s.hasCompanions], ['Companions', s.companions]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'financial':
      return ([['Funding Source', s.fundingSource], ['Bank Balance (₹)', s.bankBalanceInr], s.fundingSource === 'sponsor' ? ['Sponsor Name', s.sponsorName] : null, s.fundingSource === 'sponsor' ? ['Sponsor Relation', s.sponsorRelation] : null, s.fundingSource === 'sponsor' ? ['Sponsor Contact', s.sponsorContact] : null, ['Employment Letter', s.employmentLetterAvailable], ['ITR Filed', s.itrFiled]] as ([string, any] | null)[])
        .filter((r): r is [string, any] => r !== null)
        .map(([k, v]) => [k, val(v)]);
    case 'visaHistory':
      return ([['US/UK/Schengen Travel', s.hasUsUkSchengen], ['Previous Countries', s.previousCountries], ['Ever Rejected', s.everRejected], ['Rejection Country', s.rejectionCountry], ['Ever Overstayed', s.everOverstayed]] as [string, any][]).map(([k, v]) => [k, val(v)]);
  }
  return [];
}

function VField({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={`${inline ? 'flex flex-col gap-1.5' : 'space-y-1.5'}`}>
      <label className={`${VISA_LABEL} block`}>{label}</label>
      {children}
    </div>
  );
}

function VInput(props: { label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  return (
    <VField label={props.label} inline>
      <input
        type={props.type || 'text'}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`${VISA_INPUT} ${props.className || ''}`}
      />
    </VField>
  );
}

function VNumber(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <VField label={props.label} inline>
      <input
        type="number"
        min={0}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder={props.placeholder}
        className={VISA_INPUT}
      />
    </VField>
  );
}

function VSelect(props: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <VField label={props.label} inline>
      <select
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        className={`${VISA_INPUT} cursor-pointer ${props.className || ''}`}
      >
        <option value="">{props.placeholder || 'Select...'}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </VField>
  );
}

function VPill(props: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <VField label={props.label} inline>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 w-fit border border-slate-200/80">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
              props.value === o.value ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </VField>
  );
}

function VBool(props: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const on = props.value === true;
  return (
    <VField label={props.label} inline>
      <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1 w-fit border border-slate-200/80">
        <button
          type="button"
          onClick={() => props.onChange(true)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
            on ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => props.onChange(false)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
            !on ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
          }`}
        >
          No
        </button>
      </div>
    </VField>
  );
}

export default function VisaServices({ token, clientId }: { token: string; clientId?: string }) {
  const qc = useQueryClient();
  const VISA_PAUSED = true; // subtle paused — pricing will be available soon, applications via waitlist only
  const [tab, setTab] = useState<'catalogue' | 'wizard' | 'tracker'>('catalogue');
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [selectedVisaByCountry, setSelectedVisaByCountry] = useState<Record<string, string>>({});
  const [inquiryCountry, setInquiryCountry] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [inquiryError, setInquiryError] = useState('');

  const submitInquiry = async () => {
    setInquiryBusy(true); setInquiryError('');
    try {
      const r = await fetch(`${API}/api/public/portal/visa/inquiry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: token, country: inquiryCountry, visaType: inquiryType || 'Custom request', notes: inquiryNotes, agreedToTerms: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to send request');
      setInquirySent(true);
    } catch (e: any) { setInquiryError(e.message); } finally { setInquiryBusy(false); }
  };
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardErr, setWizardErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const productsQ = useQuery<VisaProduct[]>({
    queryKey: ['portalVisaProducts'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/visa/products`);
      if (!r.ok) throw new Error(await r.text() || 'Failed to load visa products.');
      const d = await r.json();
      return d.products || [];
    },
    retry: false,
  });

  const appsQ = useQuery<VisaApplicationRow[]>({
    queryKey: ['portalVisaApplications', token],
    queryFn: async () => {
      if (!token) return [];
      const r = await fetch(`${API}/api/public/portal/visa/applications`, { headers: { 'X-Portal-Token': token } });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(await r.text() || 'Failed to load your applications.');
      const d = await r.json();
      return d.applications || [];
    },
    enabled: !!token,
    retry: false,
  });

  const products: VisaProduct[] = productsQ.data || [];
  const applications: VisaApplicationRow[] = appsQ.data || [];
  const countries: string[] = Array.from(new Set(products.map((p: VisaProduct) => p.country))).sort();
  const activeApp = applications.find((a) => a.id === activeAppId) || null;

  // P1-3 realtime: tracker updates live when staff advances the application status.
  useEffect(() => {
    if (!clientId) return;
    const client = createSyncClient({
      plane: 'client',
      token,
      channels: [`client:${clientId}:visa`],
      onEvent: (e) => {
        if (e.type === 'VISA_STATUS_UPDATED' || e.type === 'VISA_APPLICATION_SUBMITTED') {
          qc.invalidateQueries({ queryKey: ['portalVisaApplications', token] });
        }
      },
    });
    client.connect();
    return () => client.disconnect();
  }, [clientId, token]);

  const patch = (key: VisaSectionKey, p: Record<string, any>) =>
    setForm((f) => ({ ...f, [key]: { ...(f[key] || {}), ...p } }));

  const materializeSection = (key: VisaSectionKey): Record<string, any> => {
    const seeded = { ...(form[key] || {}) };
    if (key === 'applicant' && !seeded.nationality) seeded.nationality = 'Indian';
    if (key === 'passport') {
      if (!seeded.countryOfIssue) seeded.countryOfIssue = 'India';
      if (typeof seeded.hasPreviousPassport !== 'boolean') seeded.hasPreviousPassport = false;
    }
    if (key === 'travel') {
      if (typeof seeded.returnTicketBooked !== 'boolean') seeded.returnTicketBooked = false;
      if (typeof seeded.hasCompanions !== 'boolean') seeded.hasCompanions = false;
      if (typeof seeded.companions !== 'number') seeded.companions = 0;
    }
    if (key === 'financial') {
      if (typeof seeded.employmentLetterAvailable !== 'boolean') seeded.employmentLetterAvailable = false;
      if (typeof seeded.itrFiled !== 'boolean') seeded.itrFiled = false;
    }
    if (key === 'visaHistory') {
      if (typeof seeded.hasUsUkSchengen !== 'boolean') seeded.hasUsUkSchengen = false;
      if (typeof seeded.everRejected !== 'boolean') seeded.everRejected = false;
      if (typeof seeded.everOverstayed !== 'boolean') seeded.everOverstayed = false;
      if (!Array.isArray(seeded.previousCountries)) seeded.previousCountries = [];
    }
    setForm((f) => ({ ...f, [key]: seeded }));
    return seeded;
  };

  const latestDoc = (docName: string): VisaDocRow | null => {
    const matches = (activeApp?.documents || []).filter((d) => d.fileName.toLowerCase().includes(docName.toLowerCase()));
    return matches.length ? matches[matches.length - 1] : null;
  };

  const saveSection = async (key: VisaSectionKey): Promise<boolean> => {
    if (!activeApp) return false;
    const normalized = materializeSection(key);
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch(`${API}/api/public/portal/visa/applications/${activeApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, formJson: { [key]: normalized } }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not save this section.');
      await appsQ.refetch();
      return true;
    } catch (err: any) {
      setWizardErr(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startApp = async (product: VisaProduct) => {
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch(`${API}/api/public/portal/visa/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, country: product.country, visaProductId: product.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not start application.');
      const res = await appsQ.refetch();
      const fresh = (res.data || []).find((a) => a.id === d.id) || null;
      setActiveAppId(d.id);
      setForm(fresh?.formJson ? JSON.parse(JSON.stringify(fresh.formJson)) : {});
      setAgreed(false);
      setStep(0);
      setTab('wizard');
      setNotice(d.draft ? `Resumed your existing draft.` : `Started ${product.visaType} application for ${product.country}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setWizardErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openApp = (app: VisaApplicationRow) => {
    setActiveAppId(app.id);
    if (app.status === 'draft') {
      setForm(app.formJson ? JSON.parse(JSON.stringify(app.formJson)) : {});
      setAgreed(false);
      setStep(0);
      setTab('wizard');
    } else {
      setTab('tracker');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editApplication = () => {
    if (!activeApp) return;
    setForm(activeApp.formJson ? JSON.parse(JSON.stringify(activeApp.formJson)) : {});
    setAgreed(false);
    setStep(0);
    setTab('wizard');
    setNotice(`Editing ${activeApp.country} ${activeApp.visaType} — changes are saved per section.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = async () => {
    setWizardErr('');
    if (step === 7) { setStep(8); return; }
    if (step >= 8) return;
    const key = VISA_STEPS[step].key as VisaSectionKey;
    const err = validateVisaSection(key, form[key]);
    if (err) { setWizardErr(err); return; }
    const ok = await saveSection(key);
    if (ok) setStep(step + 1);
  };

  const uploadDoc = async (docName: string, file: File) => {
    if (!activeApp) return;
    setBusy(true);
    setWizardErr('');
    try {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const fileName = `${docName}-${Date.now()}${ext}`;
      // 1. Presigned GET: bucket grants a signed, time-limited upload URL.
      const pRes = await fetch(`${API}/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(fileName)}`, { headers: { 'X-Portal-Token': token } });
      const pData = await pRes.json() as any;
      if (!pRes.ok || !pData.success || !pData.url) throw new Error(pData.error || 'Failed to generate upload link.');
      // 2. PUT the raw file binary to the signed URL (query carries token/filename/expires/signature).
      const uRes = await fetch(pData.url, {
        method: 'PUT',
        body: file,
      });
      if (!uRes.ok) throw new Error((await uRes.text().catch(() => '')) || 'Upload failed.');
      await appsQ.refetch();
      setNotice(`Uploaded "${docName}" — pending staff verification.`);
    } catch (err: any) {
      setWizardErr(`Upload failed for ${docName}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submitApp = async () => {
    if (!activeApp) return;
    if (!agreed) { setWizardErr('Please agree to the Terms & Conditions before submitting.'); return; }
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch(`${API}/api/public/portal/visa/applications/${activeApp.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, agreedToTerms: true }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        const missing = (d.missingSections || []).join(', ');
        setWizardErr(missing ? `Application incomplete. Missing sections: ${missing}.` : (d.error || 'Submission failed. Please try again.'));
        return;
      }
      await appsQ.refetch();
      setAgreed(false);
      setTab('tracker');
      setNotice('Application submitted for review. Our visa desk will begin document preparation.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setWizardErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const draftByProduct = (p: VisaProduct) =>
    applications.some((a) => a.status === 'draft' && a.country === p.country && a.visaType === p.visaType);
  void draftByProduct; void startApp;

  const reviewErrors = VISA_STEPS.slice(0, 7)
    .map((s) => ({ key: s.key, label: s.label, err: validateVisaSection(s.key as VisaSectionKey, form[s.key]) }))
    .filter((e) => e.err);

  /* ---------------- Catalogue ---------------- */
  const renderCatalogue = () => (
    <div className="flex flex-col gap-6">
      {/* Destination Country Filter Strip */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Visa Catalogue</span>
            <h3 className="font-display font-extrabold text-base text-brand-navy mt-1">Choose your destination</h3>
          </div>
          <div className="w-full md:w-72">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium outline-none focus:border-brand-gold shadow-xs cursor-pointer"
            >
              <option value="">All Countries ({countries.length} Available)</option>
              {countries.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other country…</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">Standard processing fees apply per product. Start an application to open the guided draft wizard — your progress is saved at every step.</p>
      </div>

      {wizardErr && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠</span>
            <span>{wizardErr}</span>
          </div>
          <button onClick={() => setWizardErr('')} className="text-rose-500 hover:text-rose-800 font-bold px-2 py-1 cursor-pointer">✕</button>
        </div>
      )}

      {productsQ.isLoading && (
        <div className="py-12 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Loading visa catalogue...</p>
        </div>
      )}

      {productsQ.isError && (
        <div className="p-5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs">
          <p className="font-bold">Catalogue unavailable</p>
          <p className="text-sm mt-0.5 opacity-80">{(productsQ.error as Error)?.message}</p>
          <button onClick={() => productsQ.refetch()} className="mt-3 text-[13px] font-bold uppercase tracking-wider bg-white border border-rose-300 text-rose-700 px-3 py-1.5 rounded-lg cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {!productsQ.isLoading && products.length === 0 && (
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No visa products available</h3>
          <p className="text-xs text-slate-500 mt-1">Our visa desk has not published any active products yet.</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Your Applications</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {applications.map((a: VisaApplicationRow) => (
              <button
                key={a.id}
                onClick={() => openApp(a)}
                className="text-left bg-white border border-slate-200 hover:border-brand-gold rounded-2xl p-4 transition cursor-pointer shadow-xs hover:shadow-sm"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-brand-navy text-xs">{a.country} — {a.visaType}</span>
                  <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  {a.status === 'draft' ? 'Draft in progress — tap to continue.' : `Last updated ${new Date(a.updatedAt * 1000).toLocaleDateString()}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {country === '__other__' && (
        <div className="rounded-2xl border border-brand-gold/40 bg-amber-50/40 p-6 space-y-4 shadow-xs">
          <div>
            <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Country not listed?</span>
            <h3 className="font-display font-bold text-sm text-brand-navy mt-1">Request a custom visa</h3>
            <p className="text-xs text-slate-500 mt-1">Tell us the country you need a visa for — our desk will get back to you with options and pricing.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Country you need *</label>
              <input value={inquiryCountry} onChange={(e) => setInquiryCountry(e.target.value)} placeholder="e.g. United Kingdom" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Visa type (if known)</label>
              <input value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} placeholder="e.g. Tourist / Work / Student" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Anything else we should know?</label>
              <textarea value={inquiryNotes} onChange={(e) => setInquiryNotes(e.target.value)} rows={2} placeholder="Travel dates, purpose, number of travellers…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">We'll contact you on your registered details.</p>
            <button onClick={submitInquiry} disabled={inquiryBusy || !inquiryCountry.trim()} className="bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs">
              {inquiryBusy ? 'Sending…' : 'Request Visa'}
            </button>
          </div>
          {inquirySent && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">✓ Request sent! Our visa desk will get back to you shortly.</p>}
          {inquiryError && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{inquiryError}</p>}
        </div>
      )}

      {/* ——— Subtle Guided Path — applications paused, pricing will be available soon ——— */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
        <span className="text-lg">⏸️</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-amber-900">Applications paused — pricing will be available soon</p>
          <p className="text-sm text-amber-800/80 mt-0.5">We’re refining our visa processing flow for a calmer, step-by-step experience. Save your interest below — we’ll notify you the moment we go live. No fees are charged while paused.</p>
        </div>
        <span className="text-[13px] font-bold uppercase tracking-wider bg-white border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full shrink-0">Will be available soon</span>
      </div>

      {!productsQ.isLoading && products.length > 0 && country !== '__other__' && (() => {
        const filtered = products.filter((p: VisaProduct) => !country || p.country === country);
        if (filtered.length === 0) return <p className="text-xs text-slate-500 text-center py-6">No visa options for this country yet — try "Other country…" below.</p>;
        // Subtle single-selector: pick one country (from top filter) → one visa type → checklist → waitlist
        const list = country && country !== '' ? filtered : filtered.slice(0, 12); void list;
        // If a country filter is set, show its options in a single subtle card; otherwise show the first country's card as preview
        const singleCountry = country && country !== '' ? country : filtered[0]?.country;
        const countryList = filtered.filter(p => p.country === singleCountry);
        const selectedId = selectedVisaByCountry[singleCountry] || countryList[0]?.id;
        const selected = countryList.find(x => x.id === selectedId) || countryList[0];
        if (!selected) return null;
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest">Your next step</span>
                <h4 className="font-display font-bold text-brand-navy text-sm mt-1">1. Choose destination → 2. See checklist → 3. Join waitlist</h4>
              </div>
              <span className="text-[13px] px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-bold">{selected.entryType} · {singleCountry}</span>
            </div>

            {countryList.length > 1 && (
              <div>
                <label className="text-[13px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Visa type for {singleCountry}</label>
                <select
                  value={selected.id}
                  onChange={(e) => setSelectedVisaByCountry((m) => ({ ...m, [singleCountry]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-brand-gold focus:outline-none cursor-pointer"
                >
                  {countryList.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.visaType} • {opt.processingTime} • Will be available soon</option>
                  ))}
                </select>
              </div>
            )}
            {countryList.length === 1 && (
              <div className="text-xs font-bold text-brand-navy bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">{selected.visaType} · {selected.entryType}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider block">Required documents — prepare early</span>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {(selected.requiredDocs || ['Passport scan', 'Color photograph', 'Supporting docs per checklist']).map((doc: string) => (
                    <li key={doc} className="flex gap-2"><span className="text-slate-300">—</span><span>{doc}</span></li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500">⏱ Processing</span>
                  <strong className="text-slate-700">{selected.processingTime}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Fee</span>
                  <span className="text-xs font-bold text-slate-400 blur-[3px] select-none">₹••••</span>
                  <span className="text-[13px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">Will be available soon</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={async () => {
                  setInquiryBusy(true);
                  try {
                    const r = await fetch(`${API}/api/public/portal/visa/inquiry`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clientId: token, country: selected.country, visaType: selected.visaType, notes: 'Waitlist — applications paused, notify when live', agreedToTerms: true }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(j.error || 'Waitlist failed');
                    setNotice(`✓ You’re on the waitlist for ${selected.country} — ${selected.visaType}. We’ll notify you when applications reopen.`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } catch (e: any) { setWizardErr(e.message); } finally { setInquiryBusy(false); }
                }}
                disabled={inquiryBusy}
                className="flex-1 py-3 rounded-xl bg-brand-navy text-white text-xs font-black uppercase tracking-wider hover:bg-brand-gold hover:text-brand-navy transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {inquiryBusy ? 'Joining…' : '✓ Join Waitlist — Notify Me When Live'}
              </button>
              <button onClick={() => setCountry('__other__')} className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-brand-gold cursor-pointer">Need another country? →</button>
            </div>
            <p className="text-sm text-slate-500 text-center">No payment is taken while paused. Your checklist is saved to your portal — we’ll pre-fill it when we go live.</p>
          </div>
        );
      })()}
    </div>
  );

  /* ---------------- Wizard ---------------- */
  const renderWizard = () => {
    if (!activeApp) {
      return (
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No active draft</h3>
          <p className="text-xs text-slate-500 mt-1">Start an application from the catalogue to open the wizard.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
        </div>
      );
    }

    const applicant = form.applicant || {};
    const passport = form.passport || {};
    const contact = form.contact || {};
    const employment = form.employment || {};
    const travel = form.travel || {};
    const financial = form.financial || {};
    const visaHistory = form.visaHistory || {};

    return (
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 flex flex-col gap-5 shadow-xs">
        {VISA_PAUSED && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 text-sm text-amber-800">
            <span>⏸️</span><span className="font-bold">Applications paused — will be available soon.</span><span className="text-amber-700">You can still fill and save your draft; submit will reopen and auto-notify waitlist.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <span className={VISA_HEADING + ' block'}>Draft Application {VISA_PAUSED && <span className="ml-2 text-[13px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800">Paused</span>}</span>
            <h3 className="font-display font-bold text-base text-brand-navy mt-1">{activeApp.country} — {activeApp.visaType}</h3>
          </div>
          <button onClick={() => setTab('catalogue')} className="text-xs text-slate-500 hover:text-brand-navy font-bold uppercase tracking-wider cursor-pointer">✕ Exit Draft</button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {VISA_STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => { if (i <= step) setStep(i); }}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                i === step ? 'bg-brand-navy text-white shadow-xs'
                : i < step ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-white border border-slate-200 text-slate-400'
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-brand-gold transition-all duration-300" style={{ width: `${(step / (VISA_STEPS.length - 1)) * 100}%` }}></div>
        </div>

        <div className="min-h-[280px]">
          {/* Applicant */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Full Name *" value={applicant.fullName} onChange={(v) => patch('applicant', { fullName: v })} placeholder="As printed on passport" className="md:col-span-2" />
              <VInput label="Date of Birth *" type="date" value={applicant.dob} onChange={(v) => patch('applicant', { dob: v })} />
              <VInput label="Nationality *" value={applicant.nationality} onChange={(v) => patch('applicant', { nationality: v })} placeholder="Indian" />
              <VPill label="Gender *" value={applicant.gender || ''} onChange={(v) => patch('applicant', { gender: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
              <VPill label="Marital Status *" value={applicant.maritalStatus || ''} onChange={(v) => patch('applicant', { maritalStatus: v })} options={[{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'divorced', label: 'Divorced' }, { value: 'widowed', label: 'Widowed' }]} />
              <VInput label="Place of Birth" value={applicant.placeOfBirth} onChange={(v) => patch('applicant', { placeOfBirth: v })} placeholder="Optional" />
            </div>
          )}

          {/* Passport */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Passport Number *" value={passport.number} onChange={(v) => patch('passport', { number: v.toUpperCase() })} placeholder="e.g. Z1234567" />
              <VInput label="Place of Issue *" value={passport.placeOfIssue} onChange={(v) => patch('passport', { placeOfIssue: v })} placeholder="e.g. Hyderabad" />
              <VInput label="Issue Date *" type="date" value={passport.issueDate} onChange={(v) => patch('passport', { issueDate: v })} />
              <VInput label="Expiry Date *" type="date" value={passport.expiryDate} onChange={(v) => patch('passport', { expiryDate: v })} />
              <VInput label="Country of Issue *" value={passport.countryOfIssue} onChange={(v) => patch('passport', { countryOfIssue: v })} placeholder="India" />
              <VBool label="Do you have a previous passport? *" value={passport.hasPreviousPassport} onChange={(v) => patch('passport', { hasPreviousPassport: v })} />
              {passport.hasPreviousPassport && (
                <VInput label="Previous Passport Number *" value={passport.previousPassportNumber} onChange={(v) => patch('passport', { previousPassportNumber: v.toUpperCase() })} className="md:col-span-2" />
              )}
            </div>
          )}

          {/* Contact */}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Residential Address *" value={contact.address} onChange={(v) => patch('contact', { address: v })} className="md:col-span-2" />
              <VInput label="City *" value={contact.city} onChange={(v) => patch('contact', { city: v })} />
              <VInput label="State *" value={contact.state} onChange={(v) => patch('contact', { state: v })} />
              <VInput label="PIN Code *" value={contact.pincode} onChange={(v) => patch('contact', { pincode: v })} />
              <VInput label="Primary Phone *" value={contact.phone} onChange={(v) => patch('contact', { phone: v })} />
              <VInput label="Alternate Phone" value={contact.alternatePhone} onChange={(v) => patch('contact', { alternatePhone: v })} />
              <VInput label="Emergency Contact Name *" value={contact.emergencyContact} onChange={(v) => patch('contact', { emergencyContact: v })} />
              <VInput label="Emergency Phone *" value={contact.emergencyPhone} onChange={(v) => patch('contact', { emergencyPhone: v })} />
            </div>
          )}

          {/* Employment */}
          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Employment Status *"
                value={employment.status || ''}
                onChange={(v) => patch('employment', { status: v })}
                options={[
                  { value: 'salaried', label: 'Salaried Employee' },
                  { value: 'self_employed', label: 'Self-Employed / Business' },
                  { value: 'student', label: 'Student' },
                  { value: 'unemployed', label: 'Unemployed' },
                  { value: 'retired', label: 'Retired' },
                  { value: 'homemaker', label: 'Homemaker' },
                ]}
                className="md:col-span-2"
              />
              {(employment.status === 'salaried' || employment.status === 'self_employed') && (
                <>
                  <VInput label="Occupation / Job Title *" value={employment.occupation} onChange={(v) => patch('employment', { occupation: v })} />
                  {employment.status === 'salaried' && (
                    <VInput label="Employer / Company Name *" value={employment.employerName} onChange={(v) => patch('employment', { employerName: v })} />
                  )}
                  <VInput label="Designation" value={employment.designation} onChange={(v) => patch('employment', { designation: v })} />
                  <VNumber label="Years Employed" value={employment.yearsEmployed} onChange={(v) => patch('employment', { yearsEmployed: v })} />
                  <VInput label="Employer Address" value={employment.employerAddress} onChange={(v) => patch('employment', { employerAddress: v })} className="md:col-span-2" />
                  <VInput label="Employer Phone" value={employment.employerPhone} onChange={(v) => patch('employment', { employerPhone: v })} />
                  <VNumber label="Monthly Income (₹)" value={employment.monthlyIncome} onChange={(v) => patch('employment', { monthlyIncome: v })} />
                </>
              )}
            </div>
          )}

          {/* Travel */}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Purpose of Travel *"
                value={travel.purpose || ''}
                onChange={(v) => patch('travel', { purpose: v })}
                options={[
                  { value: 'tourism', label: 'Tourism & Sightseeing' },
                  { value: 'business', label: 'Business Meeting / Conference' },
                  { value: 'family_visit', label: 'Visiting Family / Friends' },
                  { value: 'transit', label: 'Airport Transit' },
                  { value: 'medical', label: 'Medical Treatment' },
                  { value: 'other', label: 'Other' },
                ]}
                className="md:col-span-2"
              />
              <VInput label="Intended Arrival Date *" type="date" value={travel.intendedArrival} onChange={(v) => patch('travel', { intendedArrival: v })} />
              <VInput label="Intended Departure Date *" type="date" value={travel.intendedDeparture} onChange={(v) => patch('travel', { intendedDeparture: v })} />
              <VSelect
                label="Accommodation Type *"
                value={travel.accommodation || ''}
                onChange={(v) => patch('travel', { accommodation: v })}
                options={[
                  { value: 'hotel', label: 'Hotel / Resort' },
                  { value: 'host', label: 'Staying with Host / Family' },
                  { value: 'other', label: 'Other Accommodation' },
                ]}
              />
              {travel.accommodation === 'hotel' && (
                <VInput label="Hotel / Booking Name *" value={travel.accommodationName} onChange={(v) => patch('travel', { accommodationName: v })} />
              )}
              <VBool label="Return Flight Ticket Booked? *" value={travel.returnTicketBooked} onChange={(v) => patch('travel', { returnTicketBooked: v })} />
              <VBool label="Travelling with Companions? *" value={travel.hasCompanions} onChange={(v) => patch('travel', { hasCompanions: v })} />
              {travel.hasCompanions && (
                <VNumber label="Number of Companions" value={travel.companions} onChange={(v) => patch('travel', { companions: v })} />
              )}
            </div>
          )}

          {/* Financial */}
          {step === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Funding Source *"
                value={financial.fundingSource || ''}
                onChange={(v) => patch('financial', { fundingSource: v })}
                options={[
                  { value: 'self', label: 'Self-Funded' },
                  { value: 'sponsor', label: 'Sponsored by Family / Company' },
                  { value: 'employer', label: 'Employer-Funded' },
                ]}
                className="md:col-span-2"
              />
              <VNumber label="Estimated Bank Balance (₹)" value={financial.bankBalanceInr} onChange={(v) => patch('financial', { bankBalanceInr: v })} />
              {financial.fundingSource === 'sponsor' && (
                <>
                  <VInput label="Sponsor Full Name *" value={financial.sponsorName} onChange={(v) => patch('financial', { sponsorName: v })} />
                  <VInput label="Relationship with Sponsor" value={financial.sponsorRelation} onChange={(v) => patch('financial', { sponsorRelation: v })} />
                  <VInput label="Sponsor Phone" value={financial.sponsorContact} onChange={(v) => patch('financial', { sponsorContact: v })} />
                </>
              )}
              <VBool label="Employment Letter Available? *" value={financial.employmentLetterAvailable} onChange={(v) => patch('financial', { employmentLetterAvailable: v })} />
              <VBool label="ITR (Income Tax Returns) Filed? *" value={financial.itrFiled} onChange={(v) => patch('financial', { itrFiled: v })} />
            </div>
          )}

          {/* Visa History */}
          {step === 6 && (
            <div className="grid grid-cols-1 gap-4">
              <VBool label="Have you travelled to US, UK, Canada, or Schengen area in the last 5 years? *" value={visaHistory.hasUsUkSchengen} onChange={(v) => patch('visaHistory', { hasUsUkSchengen: v })} />
              <VInput label="Previous countries visited (comma-separated)" value={Array.isArray(visaHistory.previousCountries) ? visaHistory.previousCountries.join(', ') : (visaHistory.previousCountries || '')} onChange={(v) => patch('visaHistory', { previousCountries: v.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. Singapore, UAE, Thailand" />
              <VBool label="Have you ever had a visa application rejected? *" value={visaHistory.everRejected} onChange={(v) => patch('visaHistory', { everRejected: v })} />
              {visaHistory.everRejected && (
                <VInput label="Country of rejection *" value={visaHistory.rejectionCountry} onChange={(v) => patch('visaHistory', { rejectionCountry: v })} placeholder="e.g. United Kingdom" />
              )}
              <VBool label="Have you ever overstayed a visa in any country? *" value={visaHistory.everOverstayed} onChange={(v) => patch('visaHistory', { everOverstayed: v })} />
            </div>
          )}

          {/* Document Uploads */}
          {step === 7 && (
            <div className="flex flex-col gap-4">
              <div>
                <span className={VISA_HEADING + ' block'}>Required Documents</span>
                <p className="text-xs text-slate-500 mt-1">Upload clear scans or photos of the required documents for your {activeApp.country} {activeApp.visaType}.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <div key={docName} className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                      <div>
                        <span className="font-bold text-xs text-brand-navy block">{docName}</span>
                        {doc ? (
                          <span className="text-[13px] text-slate-500 font-mono mt-0.5 block">{doc.fileName} · v{doc.version} · {doc.status}</span>
                        ) : (
                          <span className="text-[13px] text-slate-400 italic mt-0.5 block">Not uploaded yet</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc && <span className={docBadge(doc.status)}>{doc.status}</span>}
                        <label className="bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition cursor-pointer shadow-xs">
                          {doc ? 'Re-upload' : 'Upload File'}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadDoc(docName, f);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review */}
          {step === 8 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className={VISA_HEADING + ' block'}>Review & Submit</span>
                <span className="text-xs text-slate-500 font-semibold">{activeApp.country} — {activeApp.visaType}</span>
              </div>

              {reviewErrors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs shadow-xs">
                  <p className="font-bold uppercase tracking-wider text-[13px] mb-1">Incomplete before submission</p>
                  {reviewErrors.map((e) => (
                    <p key={e.key}>• {e.label}: {e.err}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {VISA_STEPS.slice(0, 7).map((s) => (
                  <div key={s.key} className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
                    <span className={VISA_HEADING + ' block mb-2'}>{s.label}</span>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {visaReviewRows(s.key as VisaSectionKey, form).map(([k, v]) => (
                        <div key={k} className="col-span-2 flex justify-between gap-3 border-b border-slate-100 pb-1">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="font-semibold text-slate-800 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-brand-gold cursor-pointer" />
                  <span>
                    I confirm the information above is accurate, and I agree to the Terms & Conditions for visa processing.
                    <a href="https://opusoverseas.com/terms" target="_blank" rel="noreferrer" className="text-brand-gold font-bold hover:underline ml-1">Terms</a>
                  </span>
                </label>
                <div className="flex flex-col gap-2">
                  {VISA_PAUSED ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                      <p className="text-xs font-bold text-amber-800">Submit paused — will be available soon</p>
                      <p className="text-sm text-amber-700 mt-1">Your draft is saved. Join the waitlist from the catalogue and we’ll submit it for you when we go live — no re-entry needed.</p>
                      <button onClick={() => setTab('catalogue')} className="mt-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-gold hover:text-brand-navy cursor-pointer">Go to Waitlist →</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setStep(7)} disabled={busy} className="border border-slate-200 bg-white text-slate-600 hover:text-brand-navy hover:border-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs">
                        ← Back
                      </button>
                      <button
                        onClick={submitApp}
                        disabled={!agreed || reviewErrors.length > 0 || busy}
                        className={`${VISA_BTN} flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {busy ? 'Submitting...' : 'Submit Application'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {wizardErr && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 shadow-xs">
            <span className="font-bold">⚠</span><span>{wizardErr}</span>
          </div>
        )}

        {step < 8 && (
          <div className="flex justify-between gap-3 pt-4 border-t border-slate-200">
            {step > 0 ? (
              <button onClick={() => { setWizardErr(''); setStep(step - 1); }} disabled={busy} className="border border-slate-200 bg-white text-slate-600 hover:text-brand-navy hover:border-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs">
                ← Back
              </button>
            ) : <span />}
            <button onClick={handleNext} disabled={busy} className={`${VISA_BTN} px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition disabled:opacity-50`}>
              {busy ? 'Saving...' : step === 7 ? 'Continue to Review →' : 'Save & Continue →'}
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ---------------- Tracker ---------------- */
  const renderTracker = () => {
    if (!activeApp) {
      return (
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No application selected</h3>
          <p className="text-xs text-slate-500 mt-1">Pick an application from the catalogue or start a new one.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
        </div>
      );
    }

    const curIdx = VISA_FLOW.findIndex((f) => f.key === activeApp.status);
    const isRejected = activeApp.status === 'rejected' || activeApp.status === 'cancelled';

    return (
      <div className="flex flex-col gap-6">
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 flex flex-col gap-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={VISA_HEADING + ' block'}>Visa Application</span>
              <h3 className="font-display font-bold text-base text-brand-navy mt-1">{activeApp.country} — {activeApp.visaType}</h3>
            </div>
            <span className={visaChip(activeApp.status)}>{activeApp.status.replace('_', ' ')}</span>
          </div>

          {/* Status timeline */}
          <div className="flex flex-wrap items-center gap-1.5">
            {VISA_FLOW.map((f, i) => {
              const done = curIdx > i;
              const current = curIdx === i;
              return (
                <div key={f.key} className="flex items-center gap-1.5">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    done ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold'
                    : current ? 'text-brand-navy border-brand-gold bg-amber-50 font-extrabold shadow-xs'
                    : 'bg-white text-slate-400 border-slate-200'
                  }`}>
                    {f.label}
                  </span>
                  {i < VISA_FLOW.length - 1 && <span className="text-slate-300 text-[13px]">→</span>}
                </div>
              );
            })}
            {isRejected && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-rose-200 bg-rose-50 text-rose-700">
                {activeApp.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] uppercase tracking-wider text-slate-500">
            <span>Submitted: {activeApp.submittedAt ? new Date(activeApp.submittedAt * 1000).toLocaleString() : '—'}</span>
            <span>Decision: {activeApp.decisionAt ? new Date(activeApp.decisionAt * 1000).toLocaleString() : '—'}</span>
            <span>Delivered: {activeApp.deliveredAt ? new Date(activeApp.deliveredAt * 1000).toLocaleString() : '—'}</span>
            <span>Created: {new Date(activeApp.createdAt * 1000).toLocaleDateString()}</span>
          </div>
        </div>

        {activeApp.rejectionReason && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs shadow-xs">
            <span>⛔</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-[13px]">Application {activeApp.status === 'cancelled' ? 'Cancelled' : 'Rejected'}</p>
              <p className="mt-0.5">{activeApp.rejectionReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
            <span className={VISA_HEADING + ' block mb-2'}>Embassy Appointment</span>
            {activeApp.appointmentDate ? (
              <div className="space-y-1.5 text-xs text-slate-700">
                <p><span className="text-slate-400 block text-[13px]">Slot Scheduled Date</span><span className="font-bold text-brand-navy">{new Date(activeApp.appointmentDate * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                <p><span className="text-slate-400 block text-[13px]">Consulate Location</span><span className="font-semibold text-brand-navy">{activeApp.appointmentLocation || 'To be confirmed'}</span></p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No slot scheduled yet. Our visa desk will book your embassy slot and update it here.</p>
            )}
          </div>
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
            <span className={VISA_HEADING + ' block mb-2'}>Staff Notes</span>
            {activeApp.notes ? (
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{activeApp.notes}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No notes from the visa desk yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className={VISA_HEADING + ' block'}>Document Status</span>
          <div className="bg-white border border-slate-200/90 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs min-w-[560px]">
              <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-xs bg-slate-50">
                <tr>
                  <th className="py-2.5 px-3">Document</th>
                  <th className="py-2.5 px-3">File</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <tr key={docName} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-semibold text-brand-navy whitespace-nowrap">{docName}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono max-w-[220px] truncate">{doc ? doc.fileName : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{doc?.version || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{doc?.uploadedAt ? new Date(doc.uploadedAt * 1000).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5 px-3">
                        {doc ? (
                          <span className={docBadge(doc.status)}>{doc.status === 'pending' ? 'Uploaded' : doc.status === 'verified' ? 'Verified' : 'Rejected'}</span>
                        ) : (
                          <span className="text-sm uppercase tracking-wider text-slate-400">Not uploaded</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {(!doc || doc.status === 'rejected') ? (
                          <label className="inline-block cursor-pointer bg-slate-100 hover:bg-brand-navy hover:text-white text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-xs">
                            {doc?.status === 'rejected' ? '↻ Re-upload' : '↑ Upload'}
                            <input
                              type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadDoc(docName, f);
                                e.currentTarget.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <span className="text-xs uppercase tracking-wider text-emerald-600 font-bold">{doc.status === 'verified' ? 'Verified ✓' : 'Awaiting review'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!visaBlockedEdit(activeApp.status) && (
          <div className="flex justify-end">
            <button onClick={editApplication} className={`${VISA_BTN} px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition`}>
              Edit Application
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-lg text-brand-navy">🛂 Visa Services</h2>
        <p className="text-xs text-slate-500 mt-0.5">Apply for, draft, and track your embassy visa applications — end to end.</p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl px-3.5 py-2.5 shadow-xs">
          <span className="font-bold">✓</span><span>{notice}</span>
        </div>
      )}

      {tab === 'catalogue' && renderCatalogue()}
      {tab === 'wizard' && renderWizard()}
      {tab === 'tracker' && renderTracker()}
    </div>
  );
}