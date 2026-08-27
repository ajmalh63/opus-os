import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import AiVisaRiskCopilot from '../../components/ai/AiVisaRiskCopilot';


type VisaStatus = 'draft' | 'submitted' | 'document_prep' | 'slot_booked' | 'granted' | 'rejected' | 'delivered' | 'cancelled';

const ALL_STATUSES: VisaStatus[] = ['draft', 'submitted', 'document_prep', 'slot_booked', 'granted', 'rejected', 'delivered', 'cancelled'];

const STATUS_META: Record<VisaStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted: { label: 'Submitted', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  document_prep: { label: 'Document Prep', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  slot_booked: { label: 'Slot Booked', cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  granted: { label: 'Granted', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  delivered: { label: 'Delivered', cls: 'bg-teal-50 text-teal-600 border-teal-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
};

const statusMeta = (s: string) => STATUS_META[s as VisaStatus] || { label: s || '—', cls: 'bg-brand-navy/[0.06] text-brand-navy/60 border-brand-navy/10' };

// Suggested next-status transitions per state. The server enforces the real
// interlock — this list only shapes what the desk offers (not over-restricted).
const NEXT_STATUSES: Record<VisaStatus, VisaStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['document_prep', 'slot_booked', 'granted', 'rejected', 'cancelled'],
  document_prep: ['slot_booked', 'submitted', 'cancelled'],
  slot_booked: ['submitted', 'granted', 'rejected', 'cancelled'],
  granted: ['delivered', 'cancelled'],
  rejected: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' };
const MARITAL_LABELS: Record<string, string> = { single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed' };
const EMPLOYMENT_LABELS: Record<string, string> = { salaried: 'Salaried', self_employed: 'Self Employed', student: 'Student', retired: 'Retired', unemployed: 'Unemployed', homemaker: 'Homemaker' };
const PURPOSE_LABELS: Record<string, string> = { tourism: 'Tourism', business: 'Business', medical: 'Medical', visiting_family: 'Visiting Family', other: 'Other' };
const ACCOMMODATION_LABELS: Record<string, string> = { hotel: 'Hotel', family: 'Family', friend: 'Friend', other: 'Other' };
const FUNDING_LABELS: Record<string, string> = { salary: 'Salary', savings: 'Savings', sponsor: 'Sponsor', family: 'Family' };

interface FormField { key: string; label: string; kind?: 'text' | 'date' | 'boolean' | 'enum' | 'number' | 'array'; options?: Record<string, string>; currency?: boolean; }
interface FormSection { key: string; title: string; fields: FormField[]; }

const FORM_SECTIONS: FormSection[] = [
  { key: 'applicant', title: 'Applicant', fields: [
    { key: 'fullName', label: 'Full Name' },
    { key: 'dob', label: 'Date of Birth', kind: 'date' },
    { key: 'gender', label: 'Gender', kind: 'enum', options: GENDER_LABELS },
    { key: 'maritalStatus', label: 'Marital Status', kind: 'enum', options: MARITAL_LABELS },
    { key: 'nationality', label: 'Nationality' },
    { key: 'placeOfBirth', label: 'Place of Birth' }
  ]},
  { key: 'passport', title: 'Passport', fields: [
    { key: 'number', label: 'Passport Number' },
    { key: 'issueDate', label: 'Issue Date', kind: 'date' },
    { key: 'expiryDate', label: 'Expiry Date', kind: 'date' },
    { key: 'placeOfIssue', label: 'Place of Issue' },
    { key: 'countryOfIssue', label: 'Country of Issue' },
    { key: 'hasPreviousPassport', label: 'Has Previous Passport', kind: 'boolean' },
    { key: 'previousPassportNumber', label: 'Previous Passport Number' }
  ]},
  { key: 'contact', title: 'Contact', fields: [
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'phone', label: 'Phone' },
    { key: 'alternatePhone', label: 'Alternate Phone' },
    { key: 'emergencyContact', label: 'Emergency Contact' },
    { key: 'emergencyPhone', label: 'Emergency Phone' }
  ]},
  { key: 'employment', title: 'Employment', fields: [
    { key: 'status', label: 'Employment Status', kind: 'enum', options: EMPLOYMENT_LABELS },
    { key: 'occupation', label: 'Occupation' },
    { key: 'employerName', label: 'Employer Name' },
    { key: 'designation', label: 'Designation' },
    { key: 'employerAddress', label: 'Employer Address' },
    { key: 'employerPhone', label: 'Employer Phone' },
    { key: 'yearsEmployed', label: 'Years Employed', kind: 'number' },
    { key: 'monthlyIncome', label: 'Monthly Income (₹)', kind: 'number', currency: true }
  ]},
  { key: 'travel', title: 'Travel', fields: [
    { key: 'purpose', label: 'Purpose of Visit', kind: 'enum', options: PURPOSE_LABELS },
    { key: 'intendedArrival', label: 'Intended Arrival', kind: 'date' },
    { key: 'intendedDeparture', label: 'Intended Departure', kind: 'date' },
    { key: 'accommodation', label: 'Accommodation', kind: 'enum', options: ACCOMMODATION_LABELS },
    { key: 'accommodationName', label: 'Accommodation Name' },
    { key: 'returnTicketBooked', label: 'Return Ticket Booked', kind: 'boolean' },
    { key: 'hasCompanions', label: 'Has Companions', kind: 'boolean' },
    { key: 'companions', label: 'Companions', kind: 'number' }
  ]},
  { key: 'financial', title: 'Financial', fields: [
    { key: 'fundingSource', label: 'Funding Source', kind: 'enum', options: FUNDING_LABELS },
    { key: 'bankBalanceInr', label: 'Bank Balance (₹)', kind: 'number', currency: true },
    { key: 'sponsorName', label: 'Sponsor Name' },
    { key: 'sponsorRelation', label: 'Sponsor Relation' },
    { key: 'sponsorContact', label: 'Sponsor Contact' },
    { key: 'employmentLetterAvailable', label: 'Employment Letter Available', kind: 'boolean' },
    { key: 'itrFiled', label: 'ITR Filed', kind: 'boolean' }
  ]},
  { key: 'visaHistory', title: 'Visa History', fields: [
    { key: 'hasUsUkSchengen', label: 'Has US / UK / Schengen Visa', kind: 'boolean' },
    { key: 'previousCountries', label: 'Previous Countries', kind: 'array' },
    { key: 'everRejected', label: 'Visa Ever Rejected', kind: 'boolean' },
    { key: 'rejectionCountry', label: 'Rejection Country' },
    { key: 'everOverstayed', label: 'Ever Overstayed', kind: 'boolean' }
  ]}
];

const fmtRel = (ts?: number | null): string => {
  if (!ts) return '—';
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtVal = (f: FormField, v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (f.kind === 'boolean') return v ? 'Yes' : 'No';
  if (f.kind === 'array') return Array.isArray(v) ? v.join(', ') : String(v);
  if (f.kind === 'number' && f.currency) return `₹${Number(v).toLocaleString('en-IN')}`;
  if (f.kind === 'number') return String(v);
  if (f.options && f.options[v]) return f.options[v];
  return String(v);
};

// Build a PATCH-safe form_json payload: only filled fields, booleans/numbers
// typed, arrays comma-split — so partial drafts still validate server-side.
const buildFormPayload = (draft: Record<string, any>) => {
  const out: Record<string, any> = {};
  for (const sec of FORM_SECTIONS) {
    const data = draft[sec.key];
    if (!data) continue;
    const clean: Record<string, any> = {};
    for (const f of sec.fields) {
      let v = data[f.key];
      if (v === undefined || v === null || v === '') continue;
      if (f.kind === 'boolean') clean[f.key] = !!v;
      else if (f.kind === 'number') clean[f.key] = typeof v === 'number' ? v : Number(v);
      else if (f.kind === 'array') {
        const arr = String(v).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (arr.length) clean[f.key] = arr;
      } else clean[f.key] = String(v);
    }
    if (Object.keys(clean).length) out[sec.key] = clean;
  }
  return out;
};

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
  highestQualification: string;
  intakeContext?: string; // stringified JSON
  status: string;
}

interface VisaProduct {
  id: string;
  country: string;
  visaType: string;
  entryType: string;
  processingTime: string;
  feePaise: number;
  requiredDocsJson: string; // JSON array
  status: string;
  category?: string;
  tier?: string;
  validityDays?: number | null;
  maxStayDays?: number | null;
  insuranceIncluded?: boolean;
}

interface VisaDocRow {
  id: string;
  fileName: string;
  version: number | null;
  status: string;
  uploadedAt: number;
  verifiedAt: number | null;
}

interface VisaApplication {
  id: string;
  clientId: string;
  country: string;
  visaType: string;
  appointmentDate: number | null;
  appointmentLocation: string | null;
  status: VisaStatus;
  notes: string | null;
  formJson?: Record<string, any> | null;
  submittedAt?: number | null;
  decisionAt?: number | null;
  rejectionReason?: string | null;
  deliveredAt?: number | null;
  clientName?: string;
  clientToken?: string;
  requiredDocs?: string[];
  documents?: VisaDocRow[];
  createdAt: number;
  updatedAt: number;
}

interface VisaMock {
  id: string;
  clientId: string;
  interviewerId: string | null;
  scheduledAt: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  score: number | null;
  feedback: string | null;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_PRODUCTS = [
  { id: 'v1', country: 'Dubai 🇦🇪', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3-4 Days', feePaise: 1450000, requiredDocsJson: '["Passport scan", "Photo", "Return ticket"]', status: 'active' },
  { id: 'v2', country: 'Thailand 🇹🇭', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '2-3 Days', feePaise: 1280000, requiredDocsJson: '["Passport scan", "Photo", "Hotel booking"]', status: 'active' },
  { id: 'v3', country: 'Malaysia 🇲🇾', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '4-5 Days', feePaise: 1620000, requiredDocsJson: '["Passport scan", "Photo", "Flight booking"]', status: 'active' },
  { id: 'v4', country: 'Vietnam 🇻🇳', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3 Days', feePaise: 1150000, requiredDocsJson: '["Passport scan", "Photo", "Intended dates"]', status: 'active' }
];

const COUNTRY_VISA_CATEGORIES: Record<string, string[]> = {
  "Dubai 🇦🇪": [
    "UAE 30 Days Single Entry (Without Insurance)",
    "UAE 30 Days Express Single Entry (Without Insurance)",
    "UAE 30 Days Multiple Entry (Without Insurance)",
    "UAE 60 Days Single Entry (Without Insurance)",
    "UAE 60 Days Multiple Entry (Without Insurance)"
  ],
  "Thailand 🇹🇭": [
    "Thailand 15 Days Visa on Arrival (E-VOA)",
    "Thailand 30 Days Single Entry Tourist",
    "Thailand 60 Days Single Entry Tourist",
    "Thailand Multiple Entry Tourist (METV)"
  ],
  "Malaysia 🇲🇾": [
    "Malaysia 30 Days Single Entry E-Visa",
    "Malaysia 30 Days Multiple Entry E-Visa",
    "Malaysia 30 Days Single Entry Business"
  ],
  "Vietnam 🇻🇳": [
    "Vietnam 30 Days Single Entry E-Visa",
    "Vietnam 30 Days Multiple Entry E-Visa",
    "Vietnam 90 Days Single Entry E-Visa",
    "Vietnam 90 Days Multiple Entry E-Visa"
  ],
  "Sri Lanka 🇱🇰": [
    "Sri Lanka 30 Days Tourist ETA (Double Entry)",
    "Sri Lanka 30 Days Business ETA (Multiple Entry)",
    "Sri Lanka 2 Year Tourist Visa (Multiple Entry)"
  ],
  "Azerbaijan 🇦🇿": [
    "Azerbaijan 30 Days Single Entry ASAN E-Visa",
    "Azerbaijan 30 Days Urgent ASAN E-Visa"
  ],
  "Bahrain 🇧🇭": [
    "Bahrain 14 Days Single Entry E-Visa",
    "Bahrain 30 Days Multiple Entry E-Visa",
    "Bahrain 1 Year Multiple Entry E-Visa"
  ],
  "Cambodia 🇰🇭": [
    "Cambodia 30 Days Single Entry E-Visa (Tourist)",
    "Cambodia 30 Days Single Entry E-Visa (Business)"
  ],
  "Egypt 🇪🇬": [
    "Egypt 30 Days Single Entry E-Visa",
    "Egypt 90 Days Multiple Entry E-Visa"
  ],
  "Ethiopia 🇪🇹": [
    "Ethiopia 30 Days Single Entry E-Visa",
    "Ethiopia 90 Days Single Entry E-Visa"
  ],
  "Georgia 🇬🇪": [
    "Georgia 30 Days Single Entry E-Visa",
    "Georgia 90 Days Multiple Entry E-Visa"
  ],
  "Hong Kong 🇭🇰": [
    "Hong Kong 14 Days Pre-Arrival Registration (PAR)",
    "Hong Kong 30 Days Visit Visa (Tourist)"
  ],
  "Indonesia 🇮🇩": [
    "Indonesia 30 Days Visa on Arrival (E-VOA)",
    "Indonesia 60 Days Single Entry Tourist Visa (B211A)"
  ],
  "Kenya 🇰🇪": [
    "Kenya 90 Days Single Entry E-Visa",
    "Kenya 90 Days Transit E-Visa"
  ],
  "Morocco 🇲🇦": [
    "Morocco 30 Days Single Entry E-Visa",
    "Morocco 30 Days Multiple Entry E-Visa"
  ],
  "Myanmar 🇲🇲": [
    "Myanmar 28 Days Single Entry E-Visa (Tourist)",
    "Myanmar 70 Days Single Entry E-Visa (Business)"
  ],
  "Oman 🇴🇲": [
    "Oman 10 Days Single Entry E-Visa (26A)",
    "Oman 30 Days Single Entry E-Visa (26B)",
    "Oman 1 Year Multiple Entry E-Visa (36B)"
  ],
  "Qatar 🇶🇦": [
    "Qatar 30 Days Visa on Arrival (Hayya)",
    "Qatar 30 Days E-Visa (Tourist)"
  ],
  "Russia 🇷🇺": [
    "Russia 16 Days Unified E-Visa",
    "Russia 30 Days Single Entry Tourist Visa"
  ],
  "Turkey 🇹🇷": [
    "Turkey 30 Days Single Entry E-Visa",
    "Turkey 90 Days Multiple Entry E-Visa"
  ],
  "Uzbekistan 🇺🇿": [
    "Uzbekistan 30 Days Single Entry E-Visa",
    "Uzbekistan 30 Days Double Entry E-Visa",
    "Uzbekistan 30 Days Multiple Entry E-Visa"
  ],
  "Zambia 🇿🇲": [
    "Zambia 30 Days Single Entry E-Visa",
    "Zambia 30 Days Multiple Entry E-Visa"
  ]
};

const VISA_COUNTRIES = [
  "Dubai 🇦🇪",
  "Thailand 🇹🇭",
  "Malaysia 🇲🇾",
  "Vietnam 🇻🇳",
  "Sri Lanka 🇱🇰",
  "Azerbaijan 🇦🇿",
  "Bahrain 🇧🇭",
  "Cambodia 🇰🇭",
  "Egypt 🇪🇬",
  "Ethiopia 🇪🇹",
  "Georgia 🇬🇪",
  "Hong Kong 🇭🇰",
  "Indonesia 🇮🇩",
  "Kenya 🇰🇪",
  "Morocco 🇲🇦",
  "Myanmar 🇲🇲",
  "Oman 🇴🇲",
  "Qatar 🇶🇦",
  "Russia 🇷🇺",
  "Turkey 🇹🇷",
  "Uzbekistan 🇺🇿",
  "Zambia 🇿🇲"
];

export default function VisaPrepPortal() {
  const queryClient = useQueryClient();
  const { me } = useSession();
  const [viewMode, setViewMode] = useState<'applicants' | 'inventory' | 'ai-copilot'>('applicants');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'booking' | 'mock' | 'ai-risk'>('details');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Rejection notes state
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [customCategoryMode, setCustomCategoryMode] = useState(false);

  // Inventory Management State
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [prodCountry, setProdCountry] = useState('Dubai 🇦🇪');
  const [prodVisaType, setProdVisaType] = useState('Tourist');
  const [prodEntryType, setProdEntryType] = useState('Single Entry');
  const [prodDuration, setProdDuration] = useState('3-4 Days');
  const [prodFeeInr, setProdFeeInr] = useState('7200');
  const [prodDocsText, setProdDocsText] = useState('Passport scan, Photograph, Flight itinerary');
  const [prodCategory, setProdCategory] = useState('Tourist');
  const [prodTier, setProdTier] = useState('Standard');
  const [prodValidity, setProdValidity] = useState('30');
  const [prodMaxStay, setProdMaxStay] = useState('30');
  const [prodInsurance, setProdInsurance] = useState(false);
  const [prodCategoryFilter, setProdCategoryFilter] = useState('all');
  const [previewProduct, setPreviewProduct] = useState<VisaProduct | null>(null);

  // Modals state
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppEmail, setNewAppEmail] = useState('');
  const [newAppPhone, setNewAppPhone] = useState('');

  // New application initiation state
  const [initCountry, setInitCountry] = useState('Dubai 🇦🇪');
  const [initType, setInitType] = useState('Tourist');

  // Slot Scheduler state edit triggers
  const [editApptDate, setEditApptDate] = useState('');
  const [editApptLoc, setEditApptLoc] = useState('New Delhi VFS');
  const [editApptStatus, setEditApptStatus] = useState<VisaStatus>('document_prep');
  const [editApptNotes, setEditApptNotes] = useState('');

  // Mock interview scheduler state
  const [mockTime, setMockTime] = useState('');
  const [evalMockId, setEvalMockId] = useState<string | null>(null);
  const [mockScore, setMockScore] = useState('8');
  const [mockFeedback, setMockFeedback] = useState('Applicant exhibits strong preparation.');

  // Applicants list filters + selection
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState('');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // Status transition bar state
  const [transitionNext, setTransitionNext] = useState<VisaStatus | ''>('');
  const [rejectionReasonText, setRejectionReasonText] = useState('');

  // Edit form modal state
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [formDraft, setFormDraft] = useState<Record<string, any>>({});

  // Queries
  const { data: dbProductsData } = useQuery<{ products: VisaProduct[] }>({
    queryKey: ['visaProductsList'],
    queryFn: async () => {
      const r = await fetch('/api/visa/products');
      if (!r.ok) throw new Error('Failed to fetch visa products');
      return r.json();
    }
  });

  // Dynamically filter visa products for application initialization
  const filteredInitVisaOptions = (dbProductsData?.products || DEFAULT_PRODUCTS).filter((p: any) => 
    initCountry && p.country.toLowerCase().includes(initCountry.toLowerCase()) && p.status === 'active'
  );

  const activeProducts = dbProductsData?.products && dbProductsData.products.length > 0
    ? dbProductsData.products
    : DEFAULT_PRODUCTS as unknown as VisaProduct[];

  const { data: clientsData } = useQuery<{ clients: Client[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch('/api/clients');
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  const visaClients = (clientsData?.clients || []).filter(c => c.primaryDivision === 'visa');
  const selectedClient = (clientsData?.clients || []).find(c => c.id === selectedClientId) || null;

  // Fetch complete client detail including document vault rows
  const { data: clientDetailData } = useQuery<any>({
    queryKey: ['clientDetail', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return null;
      const r = await fetch(`/api/clients/${selectedClient.id}`);
      if (!r.ok) throw new Error('Failed to fetch client details');
      return r.json();
    },
    enabled: !!selectedClient?.id
  });

  const clientDocs = clientDetailData?.documents || [];

  // Fetch client visa applications from D1 API
  const { data: appsData } = useQuery<{ success: boolean; applications: VisaApplication[] }>({
    queryKey: ['visaApplications', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return { success: true, applications: [] };
      const r = await fetch(`/api/visa/applications?clientId=${selectedClient.id}`);
      if (!r.ok) throw new Error('Failed to fetch visa applications');
      return r.json();
    },
    enabled: !!selectedClient?.id
  });

  // All applications list — filtered server-side once the backend lands
  // (?status=&country=&q=); until then (or if params are ignored) the client
  // side re-filters the same list, and a per-client aggregation fallback keeps
  // the desk working against today's backend.
  const { data: allAppsData, isError: allAppsError } = useQuery<{ success: boolean; applications: VisaApplication[] }>({
    queryKey: ['visaApplicationsAll', statusFilter, countryFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (countryFilter) params.set('country', countryFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const qs = params.toString();
      const r = await fetch(`/api/visa/applications${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch visa applications');
      return r.json();
    },
    retry: 0
  });

  const { data: allAppsFallback } = useQuery<{ success: boolean; applications: VisaApplication[] }>({
    queryKey: ['visaApplicationsAllFallback'],
    queryFn: async () => {
      const lists = await Promise.all(visaClients.map(async (c) => {
        const r = await fetch(`/api/visa/applications?clientId=${c.id}`, { credentials: 'include' });
        if (!r.ok) return [];
        const j = await r.json().catch(() => null);
        return (j?.applications || []).map((a: VisaApplication) => ({ ...a, clientName: c.name, clientToken: c.id }));
      }));
      return { success: true, applications: lists.flat() };
    },
    enabled: !!allAppsError && visaClients.length > 0,
    staleTime: 60_000
  });

  const allAppsSource = allAppsError ? (allAppsFallback?.applications || []) : (allAppsData?.applications || []);

  const clientsById = new Map((clientsData?.clients || []).map(c => [c.id, c]));
  const qLower = searchQuery.trim().toLowerCase();
  const allApps = allAppsSource.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (countryFilter && a.country !== countryFilter) return false;
    if (qLower) {
      const clientRow = clientsById.get(a.clientId);
      const name = `${a.clientName || clientRow?.name || ''} ${a.clientToken || a.clientId}`.toLowerCase();
      if (!name.includes(qLower)) return false;
    }
    return true;
  });

  const visaCountries = [...new Set([...activeProducts.map(p => p.country), ...allAppsSource.map(a => a.country)])].sort((x, y) => x.localeCompare(y));

  const clientHasApp = new Set(allAppsSource.map(a => a.clientId));
  const noAppClients = statusFilter === 'all' && !countryFilter && !qLower
    ? visaClients.filter(c => !clientHasApp.has(c.id))
    : [];

  // Auto-select the first application once the list loads
  useEffect(() => {
    if (selectedClientId) return;
    if (allAppsSource.length > 0) {
      setSelectedClientId(allAppsSource[0].clientId);
      setSelectedAppId(allAppsSource[0].id);
    } else if (visaClients.length > 0) {
      setSelectedClientId(visaClients[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAppsSource.length > 0, visaClients.length > 0, selectedClientId]);

  // Fetch client mock interviews from D1 API
  const { data: mocksData } = useQuery<{ success: boolean; interviews: VisaMock[] }>({
    queryKey: ['visaMocks', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return { success: true, interviews: [] };
      const r = await fetch(`/api/visa/mock-interviews?clientId=${selectedClient.id}`);
      if (!r.ok) throw new Error('Failed to fetch mock interviews');
      return r.json();
    },
    enabled: !!selectedClient?.id
  });

  const activeApp: VisaApplication | null = (allAppsSource || []).find(a => a.id === selectedAppId)
    || (appsData?.applications && appsData.applications.length > 0 ? appsData.applications[appsData.applications.length - 1] : null);

  const openFormEditor = () => {
    setFormDraft(JSON.parse(JSON.stringify(activeApp?.formJson || {})));
    setFormEditorOpen(true);
  };

  // Initialize booking details form when active application is loaded
  const syncBookingFields = (app: VisaApplication) => {
    if (app.appointmentDate) {
      const d = new Date(app.appointmentDate * 1000);
      setEditApptDate(d.toISOString().split('T')[0]);
    } else {
      setEditApptDate('');
    }
    setEditApptLoc(app.appointmentLocation || 'New Delhi VFS');
    setEditApptStatus(app.status);
    setEditApptNotes(app.notes || '');
  };

  // Mutations
  const createApplicantMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to create applicant');
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      setSelectedClientId(data.client?.id || null);
      setShowAddApplicant(false);
      setNewAppName('');
      setNewAppEmail('');
      setNewAppPhone('');
    }
  });

  const startApplicationMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/visa/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to create visa application');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaApplications', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAllFallback'] });
    }
  });

  const updateApplicationMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/visa/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error(e?.message || e?.error || 'Failed to update visa status');
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaApplications', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAllFallback'] });
    }
  });

  // Status transition (uses the extended /:id/status endpoint; server enforces the interlock)
  const transitionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { status: VisaStatus; rejectionReason?: string } }) => {
      const r = await fetch(`/api/visa/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error(e?.message || e?.error || 'Failed to update visa status');
      }
      return r.json();
    },
    onSuccess: () => {
      setTransitionNext('');
      setRejectionReasonText('');
      queryClient.invalidateQueries({ queryKey: ['visaApplications', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAllFallback'] });
    }
  });

  // Staff form correction — PATCH /applications/:id { formJson } (full replace, zod-validated)
  const updateFormMutation = useMutation({
    mutationFn: async ({ id, formJson }: { id: string; formJson: Record<string, any> }) => {
      const r = await fetch(`/api/visa/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ formJson })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error(e?.error || e?.message || 'Failed to save application form');
      }
      return r.json();
    },
    onSuccess: () => {
      setFormEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ['visaApplications', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAllFallback'] });
    }
  });

  const createProductMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/visa/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to create visa product');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaProductsList'] });
      setShowAddProduct(false);
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/visa/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to update visa product');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaProductsList'] });
      setShowAddProduct(false);
      setEditProductId(null);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/visa/products/${id}`, {
        method: 'DELETE'
      });
      if (!r.ok) throw new Error('Failed to delete visa product');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaProductsList'] });
    }
  });

  const toggleProductStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' }) => {
      const r = await fetch(`/api/visa/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Failed to update status');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaProductsList'] });
    }
  });

  const scheduleMockMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/visa/mock-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to schedule mock');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaMocks', selectedClient?.id] });
      setMockTime('');
    }
  });

  const completeMockMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/visa/mock-interviews/${id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to evaluate mock');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visaMocks', selectedClient?.id] });
      setEvalMockId(null);
    }
  });

  const verifyDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      const r = await fetch(`/api/visa/documents/${docId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'verified' })
      });
      if (!r.ok) throw new Error('Failed to verify document');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientDetail', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
    }
  });

  const rejectDocMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const r = await fetch(`/api/visa/documents/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ status: 'rejected', notes })
      });
      if (!r.ok) throw new Error('Failed to reject document');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientDetail', selectedClient?.id] });
      queryClient.invalidateQueries({ queryKey: ['visaApplicationsAll'] });
      setRejectingDocId(null);
      setRejectionNotes('');
    }
  });

  // Parse required documents list helper
  const getRequiredDocs = (product: any): string[] => {
    if (!product) return ["Passport scan", "Photo"];
    try {
      return JSON.parse(product.requiredDocsJson || '[]');
    } catch {
      return ["Passport scan", "Photo"];
    }
  };

  const handleStartApplication = () => {
    if (!selectedClient) return;
    startApplicationMutation.mutate({
      clientId: selectedClient.id,
      country: initCountry,
      visaType: initType
    });
  };

  const handleSaveProduct = () => {
    const payload = {
      country: prodCountry,
      visaType: prodVisaType,
      entryType: prodEntryType,
      processingTime: prodDuration,
      feePaise: Math.round(parseFloat(prodFeeInr) * 100),
      requiredDocsJson: JSON.stringify(prodDocsText.split(',').map(s => s.trim()).filter(Boolean)),
      category: prodCategory,
      tier: prodTier,
      validityDays: prodValidity ? parseInt(prodValidity, 10) : null,
      maxStayDays: prodMaxStay ? parseInt(prodMaxStay, 10) : null,
      insuranceIncluded: prodInsurance
    };

    if (editProductId) {
      updateProductMutation.mutate({ id: editProductId, payload });
    } else {
      createProductMutation.mutate(payload);
    }
  };

  const handleEditProductClick = (p: VisaProduct) => {
    setEditProductId(p.id);
    setProdCountry(p.country);
    setProdVisaType(p.visaType);
    const standardCategories = COUNTRY_VISA_CATEGORIES[p.country] || [];
    if (standardCategories.includes(p.visaType)) {
      setCustomCategoryMode(false);
    } else {
      setCustomCategoryMode(true);
    }
    setProdEntryType(p.entryType);
    setProdDuration(p.processingTime);
    setProdFeeInr((p.feePaise / 100).toFixed(0));
    setProdCategory(p.category || 'Tourist');
    setProdTier(p.tier || 'Standard');
    setProdValidity(p.validityDays ? String(p.validityDays) : '');
    setProdMaxStay(p.maxStayDays ? String(p.maxStayDays) : '');
    setProdInsurance(!!p.insuranceIncluded);
    try {
      const parsed = JSON.parse(p.requiredDocsJson);
      setProdDocsText(parsed.join(', '));
    } catch {
      setProdDocsText('');
    }
    setShowAddProduct(true);
  };

  const handleSaveBooking = () => {
    if (!activeApp) return;
    const ts = editApptDate ? Math.floor(new Date(editApptDate).getTime() / 1000) : null;
    updateApplicationMutation.mutate({
      id: activeApp.id,
      payload: {
        status: editApptStatus,
        appointmentDate: ts,
        appointmentLocation: editApptLoc,
        notes: editApptNotes
      }
    });
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Toggle Switch with luxury glass depth */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.8)] animate-pulse" />
            <span className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-gold">Immigration & Embassy Slots</span>
          </div>
          <h1 className="font-display text-2xl font-black text-brand-navy tracking-tight">Visa Processing Operations</h1>
          <p className="text-xs text-brand-textLight mt-0.5">Coordinate visa applicants, embassy appointments, mock interviews, and active inventory.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white/80 p-1.5 rounded-2xl border border-brand-navy/15 text-xs font-bold text-brand-navy shadow-xs backdrop-blur-md">
          <button
            onClick={() => setViewMode('applicants')}
            className={`px-4 py-2 rounded-xl cursor-pointer transition-all duration-200 flex items-center gap-1.5 ${viewMode === 'applicants' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
          >
            <span>👥</span>
            <span>Applicants Desk</span>
          </button>
          <button
            onClick={() => setViewMode('ai-copilot')}
            className={`px-4 py-2 rounded-xl cursor-pointer transition-all duration-200 flex items-center gap-1.5 ${viewMode === 'ai-copilot' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
          >
            <span>✨</span>
            <span>AI Risk Copilot</span>
          </button>
          {['super_admin', 'manager'].includes(me?.role || '') && (
            <button
              onClick={() => setViewMode('inventory')}
              className={`px-4 py-2 rounded-xl cursor-pointer transition-all duration-200 flex items-center gap-1.5 ${viewMode === 'inventory' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
            >
              <span>⚙️</span>
              <span>Manage Inventory</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'ai-copilot' ? (
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm backdrop-blur-sm">
          <div className="mb-4 border-b border-brand-navy/10 pb-3">
            <h2 className="font-display font-extrabold text-base text-brand-navy">✨ AI Visa Refusal & Risk Copilot</h2>
            <p className="text-xs text-brand-navy/50">Evaluate points-based immigration risk, financial thresholds, academic gaps, and prior refusal impacts across destinations.</p>
          </div>
          <AiVisaRiskCopilot
            clientId={selectedClientId || undefined}
            clientName={selectedClient?.name}
            defaultCountry={activeApp?.country || 'United Kingdom'}
          />
        </div>
      ) : viewMode === 'applicants' ? (
        /* Applicants Processing Desk mode */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-xs">
          {/* Applicant list sidebar */}
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 flex flex-col gap-4 shadow-sm h-[550px] backdrop-blur-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-xs uppercase font-bold text-brand-navy/50 tracking-wider">Applicants Directory</h3>
              <button
                onClick={() => setShowAddApplicant(true)}
                className="bg-brand-gold text-brand-navy text-[13px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
              >
                + Add Applicant
              </button>
            </div>

            <input
              type="text"
              placeholder="Search by name or token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/35 outline-none focus:border-brand-gold"
            />

            {/* Status filter pill row */}
            <div className="flex flex-wrap gap-1.5">
              {['all', ...ALL_STATUSES].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-[13px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                    statusFilter === s ? 'bg-brand-navy text-white border-brand-navy' : 'border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy/60 hover:border-brand-gold hover:text-brand-gold'
                  }`}
                >
                  {s === 'all' ? 'All' : statusMeta(s).label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="flex-1 rounded-xl border border-brand-navy/10 bg-white px-2.5 py-2 text-xs text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
              >
                <option value="">All Countries</option>
                {visaCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {allApps.map(a => {
                const clientRow = clientsById.get(a.clientId);
                const name = a.clientName || clientRow?.name || a.clientId;
                const token = a.clientToken || a.clientId;
                const m = Array.isArray(a.requiredDocs) && a.requiredDocs.length
                  ? a.requiredDocs.length
                  : (() => {
                      const prod = activeProducts.find(p => p.country === a.country && p.visaType === a.visaType) || activeProducts.find(p => p.country === a.country);
                      return prod ? getRequiredDocs(prod).length : 0;
                    })();
                const n = Array.isArray(a.documents)
                  ? a.documents.filter(d => d.status === 'verified').length
                  : (a.clientId === selectedClientId ? clientDocs.filter((d: any) => d.status === 'verified').length : -1);
                const docLine = n >= 0 ? `${n}/${m}` : (m > 0 ? `—/${m}` : '—');
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedClientId(a.clientId);
                      setSelectedAppId(a.id);
                      setActiveTab('details');
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all cursor-pointer space-y-1.5 ${selectedAppId === a.id ? 'border-brand-gold bg-brand-gold/10 shadow-xs' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-brand-navy line-clamp-1 truncate">{name}</span>
                      <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${statusMeta(a.status).cls}`}>
                        {statusMeta(a.status).label}
                      </span>
                    </div>
                    <div className="text-[13px] text-brand-navy/50 font-mono truncate">{token}</div>
                    <div className="text-[13px] text-brand-navy/50 truncate">{a.country} · {a.visaType}</div>
                    <div className="flex items-center justify-between gap-2 text-[13px] font-semibold text-brand-navy/50">
                      <span className="shrink-0">📄 {docLine} verified</span>
                      <span className="shrink-0">{a.submittedAt ? `submitted ${fmtRel(a.submittedAt)}` : 'not submitted'}</span>
                    </div>
                  </button>
                );
              })}
              {allApps.length === 0 && (
                <p className="text-brand-navy/50 italic text-center py-6">
                  {allAppsError && !allAppsFallback ? 'Loading applicants…' : 'No applicants matched.'}
                </p>
              )}

              {noAppClients.length > 0 && (
                <>
                  <p className="text-[13px] uppercase font-bold text-brand-navy/40 tracking-wider pt-2.5">Without application</p>
                  {noAppClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedClientId(c.id);
                        setSelectedAppId(null);
                        setActiveTab('details');
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border border-dashed text-xs transition-all cursor-pointer space-y-1 ${selectedClientId === c.id && !selectedAppId ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-navy/15 bg-white hover:border-brand-gold/50'}`}
                    >
                      <span className="font-bold text-brand-navy block truncate">{c.name}</span>
                      <span className="text-[13px] text-brand-navy/40 font-mono block truncate">{c.id}</span>
                      <span className="text-[13px] text-brand-navy/40 italic">no application yet — initialize below</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Applicant Workspace detail */}
          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm flex flex-col gap-6 backdrop-blur-sm">
            {selectedClient ? (
              <>
                {/* Header matching Jilnar Example layout */}
                <div className="flex items-center justify-between border-b border-brand-navy/10 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy/[0.05] border border-brand-navy/10 text-brand-gold font-display font-bold text-xl">
                      {selectedClient.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-extrabold text-brand-navy">{selectedClient.name}</h2>
                        {activeApp && <span className="text-sm">🛫</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-brand-navy/50 font-mono text-[13px] mt-1 font-semibold">
                        <span className="text-emerald-700 font-bold">#{selectedClient.id.split('-').pop()}</span>
                        <span>•</span>
                        <span>{selectedClient.email}</span>
                        <span>•</span>
                        <span>{selectedClient.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab('details')}
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] cursor-pointer"
                      title="Visa Details"
                    >
                      🛂
                    </button>
                    <button
                      onClick={() => setActiveTab('booking')}
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] cursor-pointer"
                      title="VFS Booking"
                    >
                      🏛️
                    </button>
                  </div>
                </div>

                {/* Sub Navigation tabs */}
                {activeApp && activeApp.appointmentDate && (() => {
                  const diffDays = Math.ceil((activeApp.appointmentDate - Math.floor(Date.now() / 1000)) / (24 * 3600));
                  if (diffDays > 0 && diffDays <= 3) {
                    return (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3 text-xs font-semibold animate-pulse mb-3">
                        <span className="text-base">🚨</span>
                        <div>
                          <strong className="block font-bold">Proximity Warning: Embassy Consulate Slot Approaching!</strong>
                          VFS Appointment slot is scheduled in ${diffDays} day(s) on ${new Date(activeApp.appointmentDate * 1000).toLocaleDateString()} at "${activeApp.appointmentLocation || 'VFS Consulate Office'}". Verify all requirements immediately!
                        </div>
                      </div>
                    );
                  } else if (diffDays > 3 && diffDays <= 7) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3 text-xs font-semibold mb-3">
                        <span className="text-base">⚠️</span>
                        <div>
                          <strong className="block font-bold">Upcoming Embassy Slot Booking Alert</strong>
                          VFS Appointment slot is in ${diffDays} days on ${new Date(activeApp.appointmentDate * 1000).toLocaleDateString()} at "${activeApp.appointmentLocation || 'VFS Consulate Office'}".
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex border-b border-brand-navy/[0.08] text-xs font-semibold gap-6 pb-2.5">
                  {[
                    { key: 'details', label: 'Application Details' },
                    { key: 'booking', label: 'Embassy Slot Booking' },
                    { key: 'mock', label: 'Mock Interview Prep' },
                    { key: 'ai-risk', label: '✨ AI Risk Copilot' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setActiveTab(tab.key as any);
                        if (tab.key === 'booking' && activeApp) {
                          syncBookingFields(activeApp);
                        }
                      }}
                      className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${activeTab === tab.key ? 'border-brand-gold text-brand-navy font-bold' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content panel */}
                <div className="space-y-4">
                  {activeTab === 'details' && (
                    <div className="space-y-4">
                      {activeApp ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-brand-navy/[0.08] pb-2">
                              <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">Processing Pipeline</h4>
                            </div>

                            <div className="space-y-3.5 bg-brand-navy/[0.04] rounded-xl border border-brand-navy/10 p-4">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-brand-navy/40">Visa Country:</span>
                                <span className="font-bold text-brand-navy">{activeApp.country}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-brand-navy/40">Visa Type:</span>
                                <span className="font-bold text-brand-navy">{activeApp.visaType}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-brand-navy/40">Current Status:</span>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${statusMeta(activeApp.status).cls}`}>
                                  {statusMeta(activeApp.status).label}
                                </span>
                              </div>
                              {activeApp.submittedAt && (
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-brand-navy/40">Submitted:</span>
                                  <span className="font-bold text-brand-navy">{fmtRel(activeApp.submittedAt)}</span>
                                </div>
                              )}
                              {activeApp.decisionAt && (
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-brand-navy/40">Decision:</span>
                                  <span className="font-bold text-brand-navy">{fmtRel(activeApp.decisionAt)}</span>
                                </div>
                              )}
                              {activeApp.deliveredAt && (
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-brand-navy/40">Delivered:</span>
                                  <span className="font-bold text-brand-navy">{fmtRel(activeApp.deliveredAt)}</span>
                                </div>
                              )}

                              {/* Status transition bar */}
                              {(NEXT_STATUSES[activeApp.status] || []).length > 0 ? (
                                <div className="pt-2 space-y-2.5 border-t border-brand-navy/[0.08]">
                                  <div className="flex items-end gap-2">
                                    <div className="flex-1 space-y-1">
                                      <label className="font-semibold text-brand-navy/40 text-[13px] uppercase">Transition to</label>
                                      <select
                                        value={transitionNext}
                                        onChange={(e) => {
                                          setTransitionNext(e.target.value as VisaStatus | '');
                                          if (e.target.value !== 'rejected') setRejectionReasonText('');
                                        }}
                                        className="w-full rounded-lg border border-brand-navy/10 bg-white px-2 py-1.5 text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                                      >
                                        <option value="">Choose status…</option>
                                        {NEXT_STATUSES[activeApp.status].map(s => (
                                          <option key={s} value={s}>{statusMeta(s).label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (!transitionNext) return;
                                        transitionMutation.mutate({
                                          id: activeApp.id,
                                          payload: { status: transitionNext, rejectionReason: transitionNext === 'rejected' ? rejectionReasonText : undefined }
                                        });
                                      }}
                                      disabled={!transitionNext || (transitionNext === 'rejected' && !rejectionReasonText.trim()) || transitionMutation.isPending}
                                      className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy font-bold px-3.5 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 text-[13px] uppercase tracking-wider"
                                    >
                                      {transitionMutation.isPending ? 'Saving…' : 'Apply'}
                                    </button>
                                  </div>
                                  {transitionNext === 'rejected' && (
                                    <div className="space-y-1">
                                      <label className="font-semibold text-brand-navy/40 text-[13px] uppercase">Rejection reason (required)</label>
                                      <textarea
                                        value={rejectionReasonText}
                                        onChange={(e) => setRejectionReasonText(e.target.value)}
                                        rows={2}
                                        placeholder="e.g. Insufficient financial documentation; passport validity below 6 months…"
                                        className="w-full border border-rose-200 rounded-lg p-2.5 text-xs bg-white placeholder:text-brand-navy/35 outline-none focus:border-rose-400"
                                      />
                                    </div>
                                  )}
                                  {(transitionMutation.isError || updateApplicationMutation.isError) && (
                                    <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2">
                                      {((transitionMutation.error || updateApplicationMutation.error) as any)?.message || 'Status update failed — the server may require verified documents or a valid transition.'}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[13px] font-semibold text-brand-navy/40 italic pt-2 border-t border-brand-navy/[0.08]">This application is in a terminal state.</p>
                              )}

                              {(activeApp.status === 'granted' || activeApp.status === 'rejected') && (
                                <button
                                  onClick={() => transitionMutation.mutate({ id: activeApp.id, payload: { status: 'delivered' } })}
                                  disabled={transitionMutation.isPending}
                                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-[13px] uppercase tracking-wider px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                  ✓ Mark Delivered
                                </button>
                              )}

                              {activeApp.status === 'rejected' && activeApp.rejectionReason && (
                                <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-lg p-2.5 text-[13px] font-semibold">
                                  Rejection reason: {activeApp.rejectionReason}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px] border-b border-brand-navy/[0.08] pb-2">Document Notes</h4>
                            <div className="space-y-3">
                              <textarea
                                value={activeApp.notes || ''}
                                onChange={(e) => updateApplicationMutation.mutate({
                                  id: activeApp.id,
                                  payload: { status: activeApp.status, notes: e.target.value }
                                })}
                                placeholder="Add documents status, checklist updates, comments..."
                                rows={4}
                                className="w-full border rounded-lg p-2.5 outline-none focus:border-brand-gold bg-brand-navy/[0.04] text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Application Form (form_json) */}
                        <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-4 mt-6 backdrop-blur-sm">
                          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                            <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">📝 Application Form Profile</h4>
                            <button
                              onClick={openFormEditor}
                              className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[13px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              ✎ Edit Form
                            </button>
                          </div>

                          {!activeApp.formJson || Object.keys(activeApp.formJson).length === 0 ? (
                            <div className="bg-brand-navy/[0.04] border border-dashed border-brand-navy/15 rounded-xl p-6 text-center space-y-2">
                              <p className="text-brand-navy/50 font-semibold text-xs">Complete application profile</p>
                              <p className="text-[13px] text-brand-navy/40">
                                The client has not completed their application form yet. Ask them to fill it in the portal, or use “Edit Form” to assist with corrections.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {FORM_SECTIONS.map(sec => {
                                const data = activeApp.formJson?.[sec.key];
                                const filled = !!data && Object.keys(data).some(k => data[k] !== undefined && data[k] !== null && data[k] !== '');
                                return (
                                  <div key={sec.key} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4 space-y-2.5">
                                    <h5 className="font-bold text-brand-navy uppercase tracking-wider text-[13px] border-b border-brand-navy/[0.08] pb-1.5">{sec.title}</h5>
                                    {filled ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                        {sec.fields.map(f => {
                                          const v = data?.[f.key];
                                          if (v === undefined || v === null || v === '') return null;
                                          return (
                                            <div key={f.key} className="min-w-0">
                                              <span className="text-xs font-bold uppercase tracking-wider text-brand-navy/40 block">{f.label}</span>
                                              <span className="text-xs font-semibold text-brand-navy break-words">{fmtVal(f, v)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-[13px] text-brand-navy/40 italic">Not filled yet.</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* All Uploaded Files — every document the client uploaded (incl. non-checklist) */}
                        <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-3 mt-6 backdrop-blur-sm">
                          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                            <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">🗂️ All Uploaded Files ({clientDocs.length})</h4>
                            <span className="text-[13px] text-brand-navy/50">Every document the client uploaded to their vault</span>
                          </div>
                          {clientDocs.length === 0 ? (
                            <p className="text-[13px] text-brand-navy/40 italic py-3">No files uploaded yet by this client.</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {clientDocs.map((d: any) => (
                                <div key={d.id} className="rounded-lg border border-brand-navy/10 bg-brand-navy/[0.03] p-3 flex items-center justify-between gap-3">
                                  <div className="min-w-0 space-y-0.5">
                                    <span className="text-sm font-bold text-brand-navy truncate block">{d.fileName}</span>
                                    <span className="text-xs text-brand-navy/40 font-mono block">
                                      {d.version} · {new Date(d.uploadedAt * 1000).toLocaleDateString()}
                                      {d.sizeBytes ? ` · ${(d.sizeBytes / 1024).toFixed(0)} KB` : ''}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                                      d.status === 'verified' ? 'bg-emerald-50 text-emerald-600' :
                                      d.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                                    }`}>{d.status}</span>
                                    <a href={`/api/visa/documents/${d.id}/download`} target="_blank" rel="noreferrer" className="bg-brand-navy/[0.05] hover:bg-brand-navy/[0.08] text-brand-navy font-bold text-xs px-2 py-1 rounded transition-all">👁️ View</a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Document Verification & Review Panel */}
                        <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-4 mt-6 backdrop-blur-sm">
                          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                            <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">
                              📋 Document Checklist & Verification Vault for {activeApp.country}
                            </h4>
                            <span className="text-[13px] font-bold text-brand-navy/50">
                              Verified: {clientDocs.filter((d: any) => d.status === 'verified').length} / {getRequiredDocs(activeProducts.find(p => p.country === activeApp.country && p.visaType === activeApp.visaType) || activeProducts.find(p => p.country === activeApp.country)).length}
                            </span>
                          </div>

                          {rejectingDocId && (
                            <div className="bg-rose-50 border border-rose-100 p-4.5 rounded-xl space-y-3.5">
                              <h5 className="font-bold text-rose-800 text-[13px] uppercase">Rejection Reason Remarks</h5>
                              <textarea
                                value={rejectionNotes}
                                onChange={(e) => setRejectionNotes(e.target.value)}
                                placeholder="Specify what correction is required (e.g. signature cut off, blur resolution, expired file)..."
                                className="w-full text-xs p-2.5 border rounded-lg bg-brand-navy/[0.06] outline-none focus:border-rose-300"
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => rejectDocMutation.mutate({ id: rejectingDocId, notes: rejectionNotes })}
                                  disabled={!rejectionNotes.trim()}
                                  className="bg-rose-600 text-white text-[13px] font-bold px-3 py-1.5 rounded hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                                >
                                  Confirm Rejection
                                </button>
                                <button 
                                  onClick={() => setRejectingDocId(null)}
                                  className="text-brand-navy/50 font-bold text-[13px] px-2 py-1.5"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {getRequiredDocs(activeProducts.find(p => p.country === activeApp.country && p.visaType === activeApp.visaType) || activeProducts.find(p => p.country === activeApp.country)).map((docName: string) => {
                              const docFile = clientDocs.find((d: any) => 
                                d.fileName.toLowerCase().includes(docName.toLowerCase().replace(/\s+/g, '_')) || 
                                d.fileName.toLowerCase().includes(docName.toLowerCase())
                              );

                              return (
                                <div key={docName} className="rounded-xl border border-brand-navy/10 bg-white p-3.5 flex items-center justify-between gap-3 shadow-sm">
                                  <div className="space-y-1">
                                    <span className="font-bold text-brand-navy/70 text-sm block">{docName}</span>
                                    {docFile ? (
                                      <div className="space-y-0.5">
                                        <span className="text-[13px] text-brand-navy/40 font-mono block truncate max-w-[180px]">
                                          {docFile.fileName}
                                        </span>
                                        <span className="text-xs text-brand-navy/50 block font-mono">
                                          Uploaded: {new Date(docFile.uploadedAt * 1000).toLocaleDateString()} ({docFile.version})
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[13px] text-brand-navy/50 italic block">Awaiting upload from client...</span>
                                    )}
                                  </div>

                                  <div className="flex flex-col items-end gap-2 shrink-0">
                                    {docFile ? (
                                      <>
                                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                                          docFile.status === 'verified' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                          docFile.status === 'rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                          'bg-amber-50 text-amber-600 border border-amber-100'
                                        }`}>
                                          {docFile.status}
                                        </span>
                                        <div className="flex gap-1.5">
                                          <a
                                            href={`/api/visa/documents/${docFile.id}/download`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="bg-brand-navy/[0.05] hover:bg-brand-navy/[0.06] text-brand-navy font-bold text-xs px-2 py-1 rounded transition-all"
                                          >
                                            👁️ View
                                          </a>
                                          {docFile.status !== 'verified' && (
                                            <button
                                              onClick={() => verifyDocMutation.mutate(docFile.id)}
                                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2 py-1 rounded transition-all cursor-pointer"
                                            >
                                              ✓ Verify
                                            </button>
                                          )}
                                          {docFile.status !== 'rejected' && (
                                            <button
                                              onClick={() => {
                                                setRejectingDocId(docFile.id);
                                                setRejectionNotes('');
                                              }}
                                              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-2 py-1 rounded transition-all cursor-pointer"
                                            >
                                              ✕ Reject
                                            </button>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-brand-navy/[0.06] text-brand-navy/50 border border-brand-navy/10">
                                        Missing
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        </>
                      ) : (
                        <div className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-2xl p-8 text-center space-y-4">
                          <p className="text-brand-navy/40 font-medium">No active visa application is registered for this client.</p>
                          <div className="flex justify-center items-end gap-3 max-w-md mx-auto">
                            <div className="flex-1 text-left space-y-1">
                              <label className="text-[13px] font-bold text-brand-navy/50 block uppercase">Destination Country</label>
                              <select
                                value={initCountry}
                                onChange={(e) => {
                                  setInitCountry(e.target.value);
                                  setInitType('');
                                }}
                                className="w-full rounded-lg border border-brand-navy/10 bg-white p-2 text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                              >
                                <option value="">Select Destination...</option>
                                {VISA_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="flex-1 text-left space-y-1">
                              <label className="text-[13px] font-bold text-brand-navy/50 block uppercase">Visa Type / Option</label>
                              <select
                                value={initType}
                                onChange={(e) => setInitType(e.target.value)}
                                disabled={!initCountry}
                                className="w-full rounded-lg border border-brand-navy/10 bg-white p-2 text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white disabled:opacity-50 font-semibold"
                              >
                                <option value="">Select Visa Option...</option>
                                {filteredInitVisaOptions.map((p: any) => (
                                  <option key={p.id} value={p.visaType}>
                                    {p.visaType.replace(p.country, '').trim()} (₹{(p.feePaise / 100).toLocaleString('en-IN')})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={handleStartApplication}
                              className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy hover:bg-brand-gold hover:text-brand-navy font-bold px-4 py-2 rounded-lg transition cursor-pointer"
                            >
                              Initialize
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'booking' && (
                    <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-4 backdrop-blur-sm">
                      {activeApp ? (
                        <>
                          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                            <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">Embassy Appointment Slot</h4>
                            <button
                              onClick={handleSaveBooking}
                              className="text-brand-navy hover:text-brand-gold font-bold transition-all cursor-pointer"
                            >
                              Save Schedule ✓
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1">
                              <label className="font-semibold text-brand-navy/40">Appointment Date</label>
                              <input
                                type="date"
                                value={editApptDate}
                                onChange={(e) => setEditApptDate(e.target.value)}
                                className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="font-semibold text-brand-navy/40">VFS / Embassy Location</label>
                              <select
                                value={editApptLoc}
                                onChange={(e) => setEditApptLoc(e.target.value)}
                                className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold cursor-pointer"
                              >
                                <option>New Delhi VFS</option>
                                <option>Mumbai VFS</option>
                                <option>Chennai VFS</option>
                                <option>Kolkata VFS</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="font-semibold text-brand-navy/40">VFS Booking Status</label>
                              <select
                                value={editApptStatus}
                                onChange={(e) => setEditApptStatus(e.target.value as any)}
                                className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold cursor-pointer font-semibold text-brand-navy"
                              >
                                <option value="document_prep">Document Prep</option>
                                <option value="slot_booked">Slot Booked</option>
                                <option value="submitted">Submitted</option>
                                <option value="granted">Granted</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-brand-navy/50 italic text-center py-6">Initialize a visa application in the details tab first.</p>
                      )}
                    </div>
                  )}

                  {activeTab === 'mock' && (
                    <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-4 backdrop-blur-sm">
                      <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">Visa Mock Interviews</h4>
                      </div>

                      {/* Schedule Mock Form */}
                      <div className="flex items-end gap-3 bg-brand-navy/[0.04] p-4 rounded-xl border border-brand-navy/10">
                        <div className="flex-1 space-y-1">
                          <label className="font-semibold text-brand-navy/40">Schedule Interview Time</label>
                          <input
                            type="datetime-local"
                            value={mockTime}
                            onChange={(e) => setMockTime(e.target.value)}
                            className="w-full border rounded px-3 py-1.5 outline-none focus:border-brand-gold"
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (!mockTime) return;
                            const ts = Math.floor(new Date(mockTime).getTime() / 1000);
                            scheduleMockMutation.mutate({
                              clientId: selectedClient.id,
                              scheduledAt: ts
                            });
                          }}
                          className="bg-brand-gold text-brand-navy font-bold px-4 py-2 rounded-lg hover:bg-brand-gold/90 cursor-pointer transition-all"
                        >
                          Schedule Session
                        </button>
                      </div>

                      {/* Mocks List */}
                      <div className="space-y-3.5">
                        {mocksData?.interviews?.map((m) => (
                          <div key={m.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 space-y-2 shadow-sm">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-brand-navy">
                                📅 {new Date(m.scheduledAt * 1000).toLocaleString()}
                              </span>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {m.status}
                              </span>
                            </div>

                            {m.status === 'completed' ? (
                              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-brand-navy/[0.08] text-brand-navy/70">
                                <div>
                                  <span className="font-semibold text-brand-navy/50 block">Score:</span>
                                  <span className="font-bold text-brand-gold text-sm">{m.score}/10</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-brand-navy/50 block">Feedback:</span>
                                  <span className="font-semibold text-brand-navy">{m.feedback}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2 border-t border-brand-navy/[0.08]">
                                {evalMockId === m.id ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="font-semibold text-brand-navy/40">Mock Score (1-10)</label>
                                        <input
                                          type="number"
                                          min="1"
                                          max="10"
                                          value={mockScore}
                                          onChange={(e) => setMockScore(e.target.value)}
                                          className="w-full border rounded px-2.5 py-1 bg-brand-navy/[0.04] outline-none"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="font-semibold text-brand-navy/40">Feedback Remarks</label>
                                      <textarea
                                        rows={2}
                                        value={mockFeedback}
                                        onChange={(e) => setMockFeedback(e.target.value)}
                                        className="w-full border rounded p-2.5 bg-brand-navy/[0.04] outline-none"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={async () => {
                                          const finalScore = parseInt(mockScore);
                                          await completeMockMutation.mutateAsync({
                                            id: m.id,
                                            payload: { score: finalScore, feedback: mockFeedback }
                                          });
                                          
                                          if (finalScore < 7) {
                                            const followUpTime = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 16);
                                            if (confirm(`⚠️ Poor Score logged (${finalScore}/10). The client is underprepared.\n\nDo you want to automatically schedule a follow-up mock preparation loop in 2 days?`)) {
                                              const ts = Math.floor(new Date(followUpTime).getTime() / 1000);
                                              scheduleMockMutation.mutate({
                                                clientId: selectedClient.id,
                                                scheduledAt: ts
                                              });
                                            }
                                          }
                                        }}
                                        className="bg-brand-gold text-brand-navy px-3 py-1.5 rounded font-bold hover:bg-brand-gold/90 cursor-pointer"
                                      >
                                        Save Scorecard
                                      </button>
                                      <button onClick={() => setEvalMockId(null)} className="text-brand-navy/50 hover:text-brand-navy/40 font-bold px-2 py-1.5">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEvalMockId(m.id);
                                      setMockScore('8');
                                      setMockFeedback('Applicant exhibits strong preparation.');
                                    }}
                                    className="text-brand-navy hover:text-brand-gold font-bold flex items-center gap-1.5 cursor-pointer"
                                  >
                                    ✎ Enter Mock Scorecard
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {(!mocksData?.interviews || mocksData.interviews.length === 0) && (
                          <p className="text-brand-navy/50 italic text-center py-4">No mock preparation loops scheduled.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'ai-risk' && (
                    <div className="rounded-xl border border-brand-navy/10 bg-white p-5 space-y-4 backdrop-blur-sm">
                      <AiVisaRiskCopilot
                        clientId={selectedClient?.id}
                        clientName={selectedClient?.name}
                        defaultCountry={activeApp?.country || 'United Kingdom'}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic text-center py-12">No active applicants. Click "+ Add Applicant" to start.</p>
            )}
          </div>
        </div>
      ) : (
        /* Inventory Management Control Panel View */
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 text-xs backdrop-blur-sm">
          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-3">
            <div>
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Visa Products Inventory Control</h3>
              <p className="text-[13px] text-brand-navy/50">Configure tourist, work, and business visa pricing, processing durations, and documents.</p>
            </div>
            <button
              onClick={() => {
                setEditProductId(null);
                setProdCountry('Dubai 🇦🇪');
                setProdVisaType('Tourist');
                setProdEntryType('Single Entry');
                setProdDuration('3-4 Days');
                setProdFeeInr('7200');
                setProdDocsText('Passport scan, Photograph, Flight itinerary');
                setProdCategory('Tourist');
                setProdTier('Standard');
                setProdValidity('30');
                setProdMaxStay('30');
                setProdInsurance(false);
                setShowAddProduct(true);
              }}
              className="bg-brand-gold text-brand-navy text-[13px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
            >
              + Create Product
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mr-1">Category:</span>
            {['all', 'Tourist', 'Business', 'Work', 'Student', 'Medical', 'Transit', 'Visit', 'Other'].map(cat => (
              <button
                key={cat}
                onClick={() => setProdCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition cursor-pointer ${prodCategoryFilter === cat ? 'bg-brand-gold text-brand-navy' : 'bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy border border-brand-navy/10'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border border-brand-navy/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-navy/[0.04] text-[13px] uppercase font-bold text-brand-gold border-b border-brand-navy/[0.08]">
                <tr>
                  <th className="px-4 py-3">Destination Country</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Visa Type</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Entry Type</th>
                  <th className="px-4 py-3 font-mono text-[13px]">Clearance</th>
                  <th className="px-4 py-3 text-right">Validity / Stay</th>
                  <th className="px-4 py-3 text-right">Fee (INR)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/[0.08] text-brand-navy/70">
                {activeProducts.filter((p) => prodCategoryFilter === 'all' || (p.category || 'Tourist') === prodCategoryFilter).map((p) => (
                  <tr key={p.id} onClick={() => setPreviewProduct(p)} className="hover:bg-brand-navy/[0.04] cursor-pointer">
                    <td className="px-4 py-3 font-semibold text-brand-navy">{p.country}</td>
                    <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-navy/[0.06] text-brand-navy/70">{p.category || 'Tourist'}</span></td>
                    <td className="px-4 py-3 font-medium">{p.visaType}</td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${p.tier === 'Urgent' ? 'bg-rose-50 text-rose-600' : p.tier === 'Express' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.tier || 'Standard'}</span></td>
                    <td className="px-4 py-3 text-brand-navy/40">{p.entryType}</td>
                    <td className="px-4 py-3 font-mono text-[13px]">{p.processingTime}</td>
                    <td className="px-4 py-3 text-right text-[13px] text-brand-navy/50">{p.validityDays ? `${p.validityDays}d` : '—'}{p.maxStayDays ? ` / ${p.maxStayDays}d stay` : ''}{p.insuranceIncluded ? ' · 🛡️' : ''}</td>
                    <td className="px-4 py-3 text-right font-bold text-brand-gold">₹{(p.feePaise / 100).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>
                        {p.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center space-x-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditProductClick(p); }}
                        className="text-brand-navy hover:underline font-bold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = p.status === 'active' ? 'inactive' : 'active';
                          toggleProductStatusMutation.mutate({ id: p.id, status: nextStatus });
                        }}
                        className={`font-bold cursor-pointer hover:underline ${p.status === 'active' ? 'text-amber-600' : 'text-emerald-700'}`}
                      >
                        {p.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to archive this visa product?')) {
                            deleteProductMutation.mutate(p.id);
                          }
                        }}
                        className="text-rose-600 hover:underline font-bold cursor-pointer"
                      >
                        Archive
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProductId(null);
                          setProdCountry(p.country);
                          setProdVisaType(p.visaType);
                          setCustomCategoryMode(!(COUNTRY_VISA_CATEGORIES[p.country] || []).includes(p.visaType));
                          setProdEntryType(p.entryType);
                          setProdDuration(p.processingTime);
                          setProdFeeInr((p.feePaise / 100).toFixed(0));
                          setProdCategory(p.category || 'Tourist');
                          setProdTier(p.tier || 'Standard');
                          setProdValidity(p.validityDays ? String(p.validityDays) : '');
                          setProdMaxStay(p.maxStayDays ? String(p.maxStayDays) : '');
                          setProdInsurance(!!p.insuranceIncluded);
                          try { setProdDocsText(JSON.parse(p.requiredDocsJson).join(', ')); } catch { setProdDocsText(''); }
                          setShowAddProduct(true);
                        }}
                        className="text-brand-navy hover:text-brand-gold hover:underline font-bold cursor-pointer"
                        title="Duplicate as a new variant (e.g. different tier/price)"
                      >
                        Duplicate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Detail + Client Portal Preview Drawer */}
      {previewProduct && (
        <>
          <div className="fixed inset-0 bg-brand-navy/40 z-40" onClick={() => setPreviewProduct(null)} />
          <aside className="fixed top-0 right-0 h-full w-[30rem] max-w-[95vw] bg-white shadow-2xl z-50 overflow-y-auto p-6 space-y-5 border-l border-brand-navy/10 animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-start border-b border-brand-navy/10 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-gold">Visa Product</p>
                <h3 className="font-display font-extrabold text-lg text-brand-navy mt-1">{previewProduct.visaType}</h3>
                <p className="text-sm text-brand-navy/50">{previewProduct.country}</p>
              </div>
              <button onClick={() => setPreviewProduct(null)} className="text-brand-navy/50 hover:text-brand-navy text-xl cursor-pointer">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Category</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.category || 'Tourist'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Tier</p>
                <p className={`font-bold mt-0.5 ${previewProduct.tier === 'Urgent' ? 'text-rose-600' : previewProduct.tier === 'Express' ? 'text-amber-600' : 'text-emerald-600'}`}>{previewProduct.tier || 'Standard'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Entry Type</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.entryType}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Processing</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.processingTime}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Validity</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.validityDays ? `${previewProduct.validityDays} days` : '—'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Max Stay</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.maxStayDays ? `${previewProduct.maxStayDays} days` : '—'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Fee</p>
                <p className="font-bold text-brand-gold mt-0.5">₹{(previewProduct.feePaise / 100).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Insurance</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewProduct.insuranceIncluded ? 'Included 🛡️' : 'Not included'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Status</p>
                <p className={`font-bold mt-0.5 ${previewProduct.status === 'active' ? 'text-emerald-600' : 'text-brand-navy/40'}`}>{previewProduct.status || 'active'}</p>
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-2">Required Documents</h4>
              <div className="flex flex-wrap gap-1.5">
                {(() => { try { return JSON.parse(previewProduct.requiredDocsJson || '[]'); } catch { return []; } })().map((d: string, i: number) => (
                  <span key={i} className="bg-brand-navy/[0.06] text-brand-navy/70 border border-brand-navy/10 rounded px-2 py-0.5 text-[13px]">{d}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-2">Client Portal Preview</h4>
              <div className="rounded-2xl border border-white/10 bg-[#0B132B] p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <h3 className="font-display font-bold text-sm text-white leading-snug">{previewProduct.visaType}</h3>
                  <div className="flex flex-wrap gap-2 text-[13px]">
                    <span className="bg-white/10 text-white/70 rounded px-2 py-0.5 font-mono border border-white/10">{previewProduct.country}</span>
                    <span className="bg-brand-gold/10 text-brand-gold rounded px-2 py-0.5 font-bold capitalize">{previewProduct.category || 'Tourist'}</span>
                    <span className="bg-white/10 text-white/70 rounded px-2 py-0.5">{previewProduct.entryType}</span>
                  </div>
                  <p className="text-[13px] text-white/40">{previewProduct.processingTime}{previewProduct.validityDays ? ` · ${previewProduct.validityDays} days validity` : ''}{previewProduct.maxStayDays ? ` · ${previewProduct.maxStayDays} days stay` : ''}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => { try { return JSON.parse(previewProduct.requiredDocsJson || '[]'); } catch { return []; } })().slice(0, 4).map((d: string, i: number) => (
                      <span key={i} className="bg-emerald-500/10 text-emerald-300 text-xs px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-brand-gold font-bold text-sm">₹{(previewProduct.feePaise / 100).toLocaleString('en-IN')}</span>
                  <span className="bg-brand-gold text-brand-navy text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg">Start Application</span>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Add / Edit Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-250">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs animate-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">
                {editProductId ? 'Edit Visa Product' : 'Create New Visa Product'}
              </h3>
              <button onClick={() => setShowAddProduct(false)} className="text-brand-navy/50 hover:text-brand-navy/40 text-lg cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Country Destination</label>
                <select
                  value={prodCountry}
                  onChange={(e) => setProdCountry(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white focus:border-brand-gold"
                >
                  {VISA_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-brand-navy/40">Visa Category / Type</label>
                  <button
                    onClick={() => {
                      setCustomCategoryMode(!customCategoryMode);
                      setProdVisaType('');
                    }}
                    className="text-xs text-brand-navy hover:text-brand-gold font-bold uppercase transition"
                  >
                    {customCategoryMode ? 'Select Preset' : 'Write Custom'}
                  </button>
                </div>
                {customCategoryMode ? (
                  <input
                    type="text"
                    required
                    value={prodVisaType}
                    onChange={(e) => setProdVisaType(e.target.value)}
                    placeholder="e.g. Special Express Tourist Visa"
                    className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04] font-semibold"
                  />
                ) : (
                  <select
                    value={prodVisaType}
                    onChange={(e) => {
                      if (e.target.value === 'custom_write_in') {
                        setCustomCategoryMode(true);
                        setProdVisaType('');
                      } else {
                        setProdVisaType(e.target.value);
                      }
                    }}
                    className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white focus:border-brand-gold font-semibold text-brand-navy"
                  >
                    <option value="">Select Visa Category...</option>
                    {(COUNTRY_VISA_CATEGORIES[prodCountry] || []).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="custom_write_in">✎ Custom Write-in...</option>
                  </select>
                )}
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Entry Type</label>
                <select
                  value={prodEntryType}
                  onChange={(e) => setProdEntryType(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white focus:border-brand-gold"
                >
                  <option>Single Entry</option>
                  <option>Double Entry</option>
                  <option>Multiple Entry</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Processing Duration</label>
                <input
                  type="text"
                  value={prodDuration}
                  onChange={(e) => setProdDuration(e.target.value)}
                  placeholder="e.g. 3-4 Days"
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Standard Visa Fee (INR)</label>
                <input
                  type="number"
                  value={prodFeeInr}
                  onChange={(e) => setProdFeeInr(e.target.value)}
                  placeholder="e.g. 7200"
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Visa Category</label>
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                >
                  {['Tourist', 'Business', 'Work', 'Student', 'Medical', 'Transit', 'Visit', 'Other'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Service Tier</label>
                <select
                  value={prodTier}
                  onChange={(e) => setProdTier(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                >
                  {['Standard', 'Express', 'Urgent'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-brand-navy/40">Validity (days)</label>
                  <input type="number" min={1} value={prodValidity} onChange={(e) => setProdValidity(e.target.value)} placeholder="e.g. 30" className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]" />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-brand-navy/40">Max Stay (days)</label>
                  <input type="number" min={1} value={prodMaxStay} onChange={(e) => setProdMaxStay(e.target.value)} placeholder="e.g. 30" className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-brand-navy/70 font-semibold">
                <input type="checkbox" checked={prodInsurance} onChange={(e) => setProdInsurance(e.target.checked)} className="rounded border-brand-navy/20 accent-brand-gold" />
                Travel insurance included
              </label>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Required Documents (Comma-separated)</label>
                <textarea
                  rows={2}
                  value={prodDocsText}
                  onChange={(e) => setProdDocsText(e.target.value)}
                  placeholder="Passport copy, photograph, bank statements"
                  className="w-full border rounded-lg p-2.5 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddProduct(false)}
                className="flex-1 bg-brand-navy/[0.06] border border-brand-navy/10 hover:bg-brand-navy/[0.06] py-2 rounded-lg font-bold text-brand-navy/40 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all"
              >
                {editProductId ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Applicant Modal */}
      {showAddApplicant && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-250">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs animate-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Add New Visa Applicant</h3>
              <button onClick={() => setShowAddApplicant(false)} className="text-brand-navy/50 hover:text-brand-navy/40 text-lg cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Saurabh Sen"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. saurabh@gmail.com"
                  value={newAppEmail}
                  onChange={(e) => setNewAppEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={newAppPhone}
                  onChange={(e) => setNewAppPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddApplicant(false)}
                className="flex-1 bg-brand-navy/[0.06] border border-brand-navy/10 hover:bg-brand-navy/[0.06] py-2 rounded-lg font-bold text-brand-navy/40 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createApplicantMutation.mutate({
                    name: newAppName,
                    email: newAppEmail,
                    phone: newAppPhone,
                    highestQualification: 'undergrad',
                    primaryDivision: 'visa',
                    intakeContext: JSON.stringify({
                      visaPathway: 'Tourist Visa',
                      targetProduct: 'Dubai Tourist'
                    })
                  });
                }}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all"
              >
                Create Applicant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Application Form Modal (staff corrections) */}
      {formEditorOpen && activeApp && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-250">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-[680px] max-w-[92vw] max-h-[88vh] overflow-y-auto shadow-lg space-y-4 text-xs animate-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2 sticky top-0 bg-white z-10">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">
                Edit Application Form — {activeApp.country} · {activeApp.visaType}
              </h3>
              <button onClick={() => setFormEditorOpen(false)} className="text-brand-navy/50 hover:text-brand-navy/40 text-lg cursor-pointer">✕</button>
            </div>

            {updateFormMutation.isError && (
              <p className="text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-[13px] font-semibold">
                {((updateFormMutation.error as any)?.message) || 'Failed to save form — validations failed server-side.'}
              </p>
            )}

            <div className="space-y-4">
              {FORM_SECTIONS.map(sec => (
                <div key={sec.key} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4 space-y-3">
                  <h5 className="font-bold text-brand-navy uppercase tracking-wider text-[13px] border-b border-brand-navy/[0.08] pb-1.5">{sec.title}</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sec.fields.map(f => {
                      const val = formDraft?.[sec.key]?.[f.key];
                      const upd = (v: any) => setFormDraft((d) => ({ ...d, [sec.key]: { ...(d?.[sec.key] || {}), [f.key]: v } }));
                      return (
                        <div key={f.key} className={f.kind === 'boolean' ? 'flex items-center gap-2 pt-1' : 'space-y-1'}>
                          <label className="font-semibold text-brand-navy/40 text-[13px] block">{f.label}</label>
                          {f.kind === 'boolean' ? (
                            <input type="checkbox" checked={!!val} onChange={(e) => upd(e.target.checked)} className="w-4 h-4 accent-brand-gold cursor-pointer" />
                          ) : f.kind === 'enum' && f.options ? (
                            <select
                              value={val ?? ''}
                              onChange={(e) => upd(e.target.value)}
                              className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                            >
                              <option value="">— select —</option>
                              {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          ) : f.kind === 'number' ? (
                            <input
                              type="number"
                              min={0}
                              value={val ?? ''}
                              onChange={(e) => upd(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-brand-navy placeholder:text-brand-navy/35 outline-none focus:border-brand-gold"
                            />
                          ) : (
                            <input
                              type={f.kind === 'date' ? 'date' : 'text'}
                              value={f.kind === 'array' && Array.isArray(val) ? val.join(', ') : (val ?? '')}
                              onChange={(e) => upd(e.target.value)}
                              placeholder={f.kind === 'array' ? 'comma-separated' : ''}
                              className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-brand-navy placeholder:text-brand-navy/35 outline-none focus:border-brand-gold"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2 sticky bottom-0 bg-white">
              <button
                onClick={() => setFormEditorOpen(false)}
                className="flex-1 bg-brand-navy/[0.06] border border-brand-navy/10 hover:bg-brand-navy/[0.06] py-2 rounded-lg font-bold text-brand-navy/40 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => updateFormMutation.mutate({ id: activeApp.id, formJson: buildFormPayload(formDraft) })}
                disabled={updateFormMutation.isPending}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                {updateFormMutation.isPending ? 'Saving…' : 'Save Form Corrections'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
