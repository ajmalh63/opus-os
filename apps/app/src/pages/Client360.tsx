import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { useSession } from '../lib/session';
import OcrWorkbench from '../components/OcrWorkbench';
const API = (import.meta as any).env?.VITE_API_URL || '';

// ==========================================
// 1. TYPE DEFINITIONS
// ==========================================
interface Engagement {
  id: string;
  clientId: string;
  division: 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';
  title: string;
  stageKey: string;
  outstandingBalance: number; // strictly paise
  status: string;
}

interface Consent {
  id: string;
  clientId: string;
  consentType: 'core-processing' | 'university-sharing' | 'whatsapp-updates' | 'marketing-campaigns' | 'manpower-retain';
  status: 'granted' | 'withdrawn';
  ipAddress: string;
  sha256Hash: string;
  grantedAt: number;
}

interface DocumentRecord {
  id: string;
  clientId: string;
  fileName: string;
  r2Key: string;
  version: string;
  status: 'pending' | 'verified' | 'rejected';
  courierName?: string | null;
  courierTrackingNumber?: string | null;
  courierStatus: 'not_applicable' | 'dispatched' | 'delivered';
  uploadedAt: number;
  verifiedAt?: number | null;
}

interface CommunicationLog {
  id: string;
  clientId: string;
  senderId?: string | null;
  sender?: string;
  channel: 'whatsapp' | 'email' | 'system' | 'note';
  direction: 'incoming' | 'outgoing' | 'internal';
  subject?: string;
  message?: string;
  body?: string; // body matches drizzle schema
  createdAt: number;
}

interface TaskRecord {
  id: string;
  clientId: string | null;
  engagementId: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  dueDate: number | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface ClientData {
  id: string;
  name: string;
  phone: string;
  email: string;
  dob: string | null;
  city: string | null;
  highestQualification: string;
  passportNumber: string | null;
  passportExpiry: string | null;
  createdAt: number;
  primaryDivision?: string;
  engagements: Engagement[];
  consents: Consent[];
  documents: DocumentRecord[];
  timeline: CommunicationLog[];
}

interface Template {
  id: string;
  name: string;
  division: string;
  clausesJson: string; // JSON string array
  version: string;
  createdAt: number;
}

interface Agreement {
  id: string;
  clientId: string;
  templateId: string;
  status: 'draft' | 'sent' | 'signed' | 'active' | 'terminated';
  content: string;
  esignMethod: 'aadhaar' | 'otp' | 'wet_ink' | null;
  ipAddress: string | null;
  userAgent: string | null;
  sha256Hash: string | null;
  signedAt: number | null;
  createdAt: number;
}

interface Payment {
  id: string;
  clientId: string;
  engagementId: string;
  amount: number; // paise
  type: 'invoice' | 'receipt' | 'charge' | 'refund';
  milestoneName: string;
  method: 'upi' | 'bank_transfer' | 'cash' | null;
  referenceNumber: string | null;
  taxableAmount: number | null; // paise
  cgst: number | null; // paise
  sgst: number | null; // paise
  igst: number | null; // paise
  isInterstate: boolean | null;
  gstRate?: number | null;
  createdAt: number;
}

interface Milestone {
  id: string;
  agreementId: string;
  number: number;
  label: string;
  amount: number; // paise
  dueDate: number; // unix timestamp
  status: 'pending' | 'paid' | 'void';
  overdueLevel: 'none' | 'yellow' | 'orange' | 'red' | 'hold';
  updatedAt: number;
}

interface Departure {
  id: string;
  packageTier: 'economy' | 'standard' | 'premium';
  departureDate: number;
  capacity: number;
  bookedSeats: number;
  price: number; // paise
  bookingFee: number; // paise
  status: 'draft' | 'open' | 'confirmed' | 'cancelled';
  createdAt: number;
}

interface TransitShipment {
  id: string;
  clientId: string;
  courierPartner: 'blue-dart' | 'dtdc';
  trackingNumber: string;
  status: 'pickup' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  shippingAddress: string;
  estimatedDelivery: number | null;
  createdAt: number;
  updatedAt: number;
}

interface TransitTrackEvent {
  status: string;
  timestamp: number;
  location: string;
  description: string;
}

interface TransitTrackInfo {
  success: boolean;
  partner: string;
  trackingNumber: string;
  currentStatus: string;
  estimatedDelivery: number | null;
  events: TransitTrackEvent[];
}

const tabIcons: Record<string, React.ReactNode> = {
  tasks: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  vault: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v6h6" />
    </svg>
  ),
  agreements: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  payments: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-6 2h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  umrah: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707" />
    </svg>
  ),
  courier: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1zm0 0h5l3 3v-3m-3-1v-4m-9.5-3.5h.01M6.5 16h.01" />
    </svg>
  ),
  'study-abroad': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
    </svg>
  ),
  visa: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  attestation: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  manpower: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
};

export default function Client360() {
  const [, params] = useRoute('/clients/:id');
  const clientId = params?.id || '';
  const queryClient = useQueryClient();

  // Toast notifications state
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 4000);
  };

// Real session: AuthGuard protects this route; RBAC is enforced server-side
  // (no demo role-switching here).
  const [sessionToken] = useState<string>(() => {
    if (typeof document === 'undefined') return '';
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s ? s.split('=')[1] : '';
  });

  const { me } = useSession();
  const meName = me?.name || me?.email?.split('@')[0] || 'Staff';
  const meRole = me?.role || '';
  const meCanAgreements = ['super_admin', 'manager', 'counselor', 'coordinator'].includes(meRole);


  // Navigation tabs state — includes PRD-001 Staff OCR Workbench (staff-only, never portal)
  const [activeTab, setActiveTab] = useState<'tasks' | 'vault' | 'ocr' | 'agreements' | 'payments' | 'umrah' | 'courier' | 'study-abroad' | 'visa' | 'attestation' | 'manpower'>('tasks');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  // Timeline Filter State
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'whatsapp' | 'email' | 'system'>('all');

  // Message Editor State
  const [editorTab, setEditorTab] = useState<'whatsapp' | 'email' | 'note'>('whatsapp');
  const [messageText, setMessageText] = useState('');
  const [messageSubject, setMessageSubject] = useState('');

  // ------------------------------------------
  // TAB STATES
  // ------------------------------------------
  
  // Service Agreements States
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState<boolean>(false);
  const [esignMethod, setEsignMethod] = useState<'aadhaar' | 'otp'>('aadhaar');
  const [esignChecked, setEsignChecked] = useState<boolean>(false);

  // Milestone Payments Form States
  const [paymentType, setPaymentType] = useState<'invoice' | 'receipt' | 'charge' | 'refund'>('invoice');
  const [paymentMilestoneName, setPaymentMilestoneName] = useState<string>('');
  const [paymentAmountInRupees, setPaymentAmountInRupees] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'bank_transfer' | 'cash'>('upi');
  const [paymentRefNumber, setPaymentRefNumber] = useState<string>('');
  const [paymentIsInterstate, setPaymentIsInterstate] = useState<boolean>(false);

  // Umrah Workspace states
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  // Razorpay Online Payment States (Section 44)
  const [razorpayMilestone, setRazorpayMilestone] = useState<string>('');
  const [razorpayAmount, setRazorpayAmount] = useState<string>('');
  const [razorpayStatus, setRazorpayStatus] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [rzPaymentBusy, setRzPaymentBusy] = useState<boolean>(false);

  // Attestation Courier States
  const [courierPartner, setCourierPartner] = useState<'blue-dart' | 'dtdc'>('blue-dart');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

  // Track Shipments stored locally in localStorage (per client) to display since no general list API exists
  const [shipmentIds, setShipmentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`opus_shipments_${clientId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // ==========================================
  // 2. QUERY HOOKS
  // ==========================================

  // A. Fetch Client 360 profile
  const { data: client, isLoading, isError } = useQuery<ClientData>({
    queryKey: ['client360', clientId, sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/clients/${clientId}`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch client profile');
      }
      return res.json();
    },
    enabled: !!clientId,
  });

  // B. Fetch Service Agreements Templates
  const { data: templatesData } = useQuery<{ templates: Template[] }>({
    queryKey: ['agreementTemplates', sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/agreements/templates`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch templates');
      return res.json();
    }
  });

  // C. Fetch Service Agreements List (and filter in-place by client ID)
  const { data: agreementsData, refetch: refetchAgreements } = useQuery<{ agreements: Agreement[] }>({
    queryKey: ['agreements', sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/agreements`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch agreements');
      return res.json();
    }
  });
  const clientAgreements = agreementsData?.agreements?.filter(a => a.clientId === clientId) || [];

  // D0. Fetch client tasks (Section 8.2 - Tasks & Calendar)
  const { data: tasksData, refetch: refetchTasks } = useQuery<{ tasks: TaskRecord[] }>({
    queryKey: ['clientTasks', clientId, sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/tasks/client/${clientId}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    enabled: !!clientId,
  });
  const clientTasks = tasksData?.tasks || [];

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newTaskDue, setNewTaskDue] = useState('');

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': `better-auth.session_token=${sessionToken}` },
        body: JSON.stringify({
          clientId,
          title: newTaskTitle,
          priority: newTaskPriority,
          dueDate: newTaskDue ? Math.floor(new Date(newTaskDue).getTime() / 1000) : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text() || 'Failed to create task');
      return res.json();
    },
    onSuccess: () => {
      setNewTaskTitle('');
      setNewTaskDue('');
      refetchTasks();
    },
  });

  const toggleTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskRecord['status'] }) => {
      const res = await fetch(`${API}/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Cookie': `better-auth.session_token=${sessionToken}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text() || 'Failed to update task');
      return res.json();
    },
    onSuccess: () => refetchTasks(),
  });

  // D. Fetch Milestones List
  const { data: milestonesData, refetch: refetchMilestones } = useQuery<{ milestones: Milestone[] }>({
    queryKey: ['milestones', sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/payments/milestones`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch milestones');
      return res.json();
    }
  });
  const clientAgreementIds = clientAgreements.map(a => a.id);
  const clientMilestones = milestonesData?.milestones?.filter(m => clientAgreementIds.includes(m.agreementId)) || [];

  // E. Fetch Payments Ledger
  const { data: paymentsData, refetch: refetchPayments } = useQuery<{ payments: Payment[] }>({
    queryKey: ['payments', clientId, sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/payments/client/${clientId}`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch payments ledger');
      return res.json();
    },
    enabled: !!clientId
  });

  // F. Fetch Umrah Departures
  const { data: departuresData, refetch: refetchDepartures } = useQuery<{ departures: Departure[] }>({
    queryKey: ['departures', sessionToken],
    queryFn: async () => {
      const res = await fetch(`${API}/api/umrah/departures`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch group departures');
      return res.json();
    }
  });

  // F.1 Fetch Umrah Bookings for client
  const { data: bookingsData, refetch: refetchBookings } = useQuery<{ bookings: any[] }>({
    queryKey: ['umrah-bookings', clientId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/umrah/bookings?clientId=${clientId}`);
      if (!res.ok) throw new Error('Failed to fetch bookings');
      return res.json();
    },
    enabled: !!clientId
  });

  // F.2 Fetch Umrah Checklist for selected booking
  const { data: checklistData, refetch: refetchChecklist } = useQuery<any>({
    queryKey: ['umrah-checklist', selectedBookingId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/umrah/checklists?bookingId=${selectedBookingId}`);
      if (!res.ok) throw new Error('Failed to fetch checklist');
      return res.json();
    },
    enabled: !!selectedBookingId
  });

  // G. Fetch shipments loaded via localStorage IDs
  const { data: shipments = [], refetch: refetchShipments } = useQuery<TransitShipment[]>({
    queryKey: ['shipments', clientId, shipmentIds, sessionToken],
    queryFn: async () => {
      const list = [];
      for (const id of shipmentIds) {
        try {
          const res = await fetch(`${API}/api/transit/shipments/${id}`, {
            headers: {
              'Cookie': `better-auth.session_token=${sessionToken}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            list.push(data.shipment);
          }
        } catch (err) {
          console.error(err);
        }
      }
      return list;
    },
    enabled: shipmentIds.length > 0
  });

  // H. Fetch active transit track info events
  const { data: activeTracking, isLoading: isLoadingTracking } = useQuery<TransitTrackInfo>({
    queryKey: ['shipmentTrack', selectedShipmentId, sessionToken],
    queryFn: async () => {
      if (!selectedShipmentId) return null as any;
      const res = await fetch(`${API}/api/transit/shipments/${selectedShipmentId}/track`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch shipment tracking info');
      return res.json();
    },
    enabled: !!selectedShipmentId
  });

  // ==========================================
  // 3. MUTATION HOOKS
  // ==========================================

  // Stage Advance
  const advanceMutation = useMutation({
    mutationFn: async (payload: { cardId: string; sourceStage: string; targetStage: string }) => {
      const res = await fetch(`${API}/api/kanban/board/move`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to advance stage');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
      if (data.wipLimitBreached) {
        showToast(` Advanced with WIP Limit warning: Column reached capacity limit of ${data.limit}.`);
      } else {
        showToast('Application stage advanced successfully.');
      }
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Advance failed'}`);
    },
  });

  // Initialize Engagement Pipeline
  const initializeEngagementMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/clients/${clientId}/engagements`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to initialize engagement');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
      showToast('Engagement pipeline initialized successfully.');
    },
    onError: (err: any) => {
      showToast(`Error initializing engagement: ${err.message}`);
    }
  });

  // Send communication log (persists to the client timeline via API)
  const sendMessageMutation = useMutation({
    mutationFn: async (payload: { sender: string; channel: string; subject?: string; message: string }) => {
      const res = await fetch(`${API}/api/clients/${clientId}/communications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          channel: payload.channel,
          direction: 'outgoing',
          subject: payload.subject || undefined,
          body: payload.message,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to log communication');
      }
      return res.json();
    },
    onSuccess: () => {
      showToast(`Message logged to timeline successfully.`);
      setMessageText('');
      setMessageSubject('');
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
    },
  });

  // Generate Agreement Draft
  const generateAgreementMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`${API}/api/agreements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          clientId,
          templateId
        })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to generate agreement draft');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showToast('Agreement draft compiled and merged successfully.');
      refetchAgreements();
      setSelectedAgreementId(data.id);
    },
    onError: (err: any) => {
      showToast(`Draft Error: ${err.message}`);
    }
  });

  // eSign Execute Signature
  const signAgreementMutation = useMutation({
    mutationFn: async ({ id, esignMethod }: { id: string; esignMethod: 'aadhaar' | 'otp' }) => {
      const res = await fetch(`${API}/api/agreements/${id}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          esignMethod
        })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to execute eSign');
      }
      return res.json();
    },
    onSuccess: () => {
      showToast('Service Agreement digitally signed and logged successfully.');
      refetchAgreements();
      refetchMilestones();
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
      setIsSignModalOpen(false);
      setEsignChecked(false);
    },
    onError: (err: any) => {
      showToast(`eSign Error: ${err.message}`);
    }
  });

  // Milestone Ledger Entry Submission (SoD restricted)
  const logPaymentMutation = useMutation({
    mutationFn: async (payload: {
      amount: number; // in paise
      type: 'invoice' | 'receipt' | 'charge' | 'refund';
      milestoneName: string;
      method?: 'upi' | 'bank_transfer' | 'cash';
      referenceNumber?: string;
      isInterstate?: boolean;
    }) => {
      const res = await fetch(`${API}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          clientId,
          engagementId: activeEng?.id,
          ...payload
        })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to submit payment entry');
      }
      return res.json();
    },
    onSuccess: () => {
      showToast('Ledger payment record logged successfully.');
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
      // Reset form
      setPaymentMilestoneName('');
      setPaymentAmountInRupees('');
      setPaymentRefNumber('');
    },
    onError: (err: any) => {
      showToast(`Forbidden / Transaction Failed: ${err.message}`);
    }
  });

  // Re-evaluate Overdue Milestones Escalation warnings
  const evaluateEscalationsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/payments/milestones/evaluate-escalations`, {
        method: 'POST',
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to evaluate escalations');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showToast(`Escalation warnings updated. Checked: ${data.evaluatedCount}, Updates: ${data.updatedCount}`);
      refetchMilestones();
    },
    onError: (err: any) => {
      showToast(`Escalation Check Failed: ${err.message}`);
    }
  });

  // Book seat in scheduled Umrah Departure Group
  const bookUmrahSeatMutation = useMutation({
    mutationFn: async (departureId: string) => {
      const res = await fetch(`${API}/api/umrah/departures/${departureId}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          clientId
        })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Umrah booking failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === 'confirmed') {
        showToast('Umrah group seat booked and confirmed successfully.');
      } else {
        showToast('Group departure full. Client placed in WAITLIST.');
      }
      refetchDepartures();
      refetchBookings();
    },
    onError: (err: any) => {
      showToast(`Umrah Booking Error: ${err.message}`);
    }
  });

  // F.3 Update Checklist document markings mutation
  const updateChecklistMutation = useMutation({
    mutationFn: async ({ id, passportScanned, visaIssued, vaccineCertificate, ticketIssued, notes }: any) => {
      const res = await fetch(`${API}/api/umrah/checklists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportScanned, visaIssued, vaccineCertificate, ticketIssued, notes })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      refetchChecklist();
      refetchBookings();
      showToast('Umrah checklist updated successfully.');
    },
    onError: (err: any) => {
      showToast(`Checklist Update Error: ${err.message}`);
    }
  });

  // F.4 Update Departure Status mutation (Manager only)
  const updateDepartureStatusMutation = useMutation({
    mutationFn: async ({ departureId, status }: { departureId: string; status: 'open' | 'confirmed' | 'cancelled' }) => {
      const res = await fetch(`${API}/api/umrah/departures/${departureId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      refetchDepartures();
      refetchBookings();
      showToast('Group departure status updated.');
    },
    onError: (err: any) => {
      showToast(`Departure Status Error: ${err.message}`);
    }
  });

  // Register Attestation Courier shipment
  const registerShipmentMutation = useMutation({
    mutationFn: async (payload: { courierPartner: 'blue-dart' | 'dtdc'; trackingNumber: string; shippingAddress: string }) => {
      const res = await fetch(`${API}/api/transit/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          clientId,
          ...payload
        })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to register courier shipment');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showToast('Shipment tracking number registered successfully.');
      // Persist locally
      const updatedIds = [...shipmentIds, data.id];
      setShipmentIds(updatedIds);
      localStorage.setItem(`opus_shipments_${clientId}`, JSON.stringify(updatedIds));
      // Invalidate queries to refresh list
      refetchShipments();
      setSelectedShipmentId(data.id);
      // Reset form
      setTrackingNumber('');
      setShippingAddress('');
    },
    onError: (err: any) => {
      showToast(`Shipment registration failed: ${err.message}`);
    }
  });

  // ==========================================
  // 4. ACTION HANDLERS
  // ==========================================

  const handleAdvanceStage = () => {
    const activeEng = client?.engagements?.[0];
    if (!activeEng) {
      showToast('No active engagement found to advance.');
      return;
    }

    const stages = ['lead', 'qualified', 'documents', 'processing', 'complete'];
    const currentIdx = stages.indexOf(activeEng.stageKey);
    if (currentIdx === -1 || currentIdx === stages.length - 1) {
      showToast('Engagement is already at complete stage.');
      return;
    }

    advanceMutation.mutate({
      cardId: activeEng.id,
      sourceStage: activeEng.stageKey,
      targetStage: stages[currentIdx + 1],
    });
  };

  const handleInitializeEngagement = () => {
    initializeEngagementMutation.mutate();
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      showToast('Message text cannot be empty.');
      return;
    }

    sendMessageMutation.mutate({
      sender: meName,
      channel: editorTab,
      subject: editorTab === 'email' ? messageSubject || 'Status Update Notification' : undefined,
      message: messageText,
    });
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast(`Uploading document ${file.name} to R2 bucket...`);
    try {
      const presignedRes = await fetch(`${API}/api/clients/${clientId}/documents/presigned?filename=${encodeURIComponent(file.name)}`, {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!presignedRes.ok) {
        throw new Error('Failed to generate presigned upload URL');
      }
      const { url } = await presignedRes.json();

      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: await file.arrayBuffer(),
      });
      if (!uploadRes.ok) {
        throw new Error(await uploadRes.text() || 'Failed to upload file bytes');
      }

      showToast('Document uploaded and version-controlled successfully.');
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
    } catch (err: any) {
      showToast(`Upload Error: ${err.message}`);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedDocs.size === 0) {
      showToast('Select at least one document to download.');
      return;
    }
    showToast(`Downloading ${selectedDocs.size} document(s)...`);
    for (const docId of Array.from(selectedDocs)) {
      try {
        const res = await fetch(`${API}/api/clients/${clientId}/documents/${docId}/download`, {
          headers: { 'Cookie': `better-auth.session_token=${sessionToken}` },
        });
        if (!res.ok) throw new Error(await res.text() || 'Download failed');
        const blob = await res.blob();
        const doc = client?.documents?.find((d) => d.id === docId);
        const filename = doc?.fileName || `${docId}.bin`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        showToast(`Download failed for ${docId}: ${err.message}`);
      }
    }
    showToast(`Downloaded ${selectedDocs.size} file(s).`);
  };

  const handleBulkVerify = async (status: 'verified' | 'rejected') => {
    if (selectedDocs.size === 0) {
      showToast('Select at least one document to update.');
      return;
    }
    showToast(`Updating ${selectedDocs.size} document(s) to ${status}...`);
    let successCount = 0;
    for (const docId of Array.from(selectedDocs)) {
      try {
        const res = await fetch(`${API}/api/clients/${clientId}/documents/${docId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Cookie': `better-auth.session_token=${sessionToken}` },
          body: JSON.stringify({ status, note: `Bulk ${status} via vault` }),
        });
        if (!res.ok) throw new Error(await res.text() || 'Status update failed');
        successCount++;
      } catch (err: any) {
        showToast(`Failed for ${docId}: ${err.message}`);
      }
    }
    showToast(`${successCount}/${selectedDocs.size} document(s) marked as ${status}.`);
    setSelectedDocs(new Set());
    queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'welcome') {
      setMessageText(`Dear ${client?.name || 'Client'},\nWelcome to Opus Overseas! We have provisioned your client profile and active tracking token: ${clientId}. Please use this token to track progress on our website status page.`);
    } else if (val === 'docRequest') {
      setMessageText(`Dear ${client?.name || 'Client'},\nWe are currently reviewing your documents in the vault. We noticed that your transcript records are missing or unreadable. Please upload a high-resolution scanned PDF copy of your consolidated transcripts.`);
    } else if (val === 'paymentAlert') {
      setMessageText(`Dear ${client?.name || 'Client'},\nThis is a friendly reminder that an outstanding milestone balance is pending on your profile. Please complete the transaction to proceed without delay.`);
    } else {
      setMessageText('');
    }
  };

  const handleCreateDraftAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) {
      showToast('Please select a template first.');
      return;
    }
    generateAgreementMutation.mutate(selectedTemplateId);
  };

  const handleOpenSignModal = (agreementId: string) => {
    setSelectedAgreementId(agreementId);
    setIsSignModalOpen(true);
  };

  const handleExecuteESign = () => {
    if (!selectedAgreementId) return;
    if (!esignChecked) {
      showToast('You must check the electronic consent declaration.');
      return;
    }
    signAgreementMutation.mutate({
      id: selectedAgreementId,
      esignMethod
    });
  };

  // Razorpay: create order -> open Checkout -> verify signature -> record receipt (Section 44)
  const handleRazorpaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountRs = parseFloat(razorpayAmount);
    if (!amountRs || amountRs <= 0) {
      setRazorpayStatus({ msg: 'Enter a valid amount', type: 'err' });
      return;
    }
    const amountPaise = Math.round(amountRs * 100);
    setRzPaymentBusy(true);
    setRazorpayStatus(null);

    try {
      // 1. Create order server-side (amount computed & verified vs ledger)
      const orderRes = await fetch(`${API}/api/payments/razorpay/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': `better-auth.session_token=${sessionToken}` },
        body: JSON.stringify({ clientId, engagementId: client?.engagements?.[0]?.id || clientId, amount: amountPaise, milestoneName: razorpayMilestone }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData?.error || 'Failed to create order');

      // 2. Load Checkout.js
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
          document.body.appendChild(s);
        });
      }

      // 3. Open Checkout
      const result = await new Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string } | null>((resolve) => {
        const rz = new (window as any).Razorpay({
          key: orderData.key,
          amount: orderData.amount_paise,
          currency: orderData.currency || 'INR',
          name: 'Opus Overseas',
          description: razorpayMilestone || 'Service payment',
          order_id: orderData.order_id,
          handler: (res: any) => resolve({ razorpay_payment_id: res.razorpay_payment_id, razorpay_order_id: res.razorpay_order_id, razorpay_signature: res.razorpay_signature }),
          modal: { ondismiss: () => resolve(null) },
          prefill: { contact: '' },
          theme: { color: '#d7a019' },
        });
        rz.open();
      });

      if (!result) {
        setRazorpayStatus({ msg: 'Payment window closed', type: 'err' });
        return;
      }

      // 4. Verify signature server-side + record receipt
      const verifyRes = await fetch(`${API}/api/payments/razorpay/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': `better-auth.session_token=${sessionToken}` },
        body: JSON.stringify({ clientId, engagementId: client?.engagements?.[0]?.id || clientId, ...result, milestoneName: razorpayMilestone }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData?.error || 'Verification failed');

      setRazorpayStatus({ msg: 'Payment captured & recorded', type: 'ok' });
      setRazorpayAmount('');
      setRazorpayMilestone('');
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ['client360', clientId] });
    } catch (err: any) {
      setRazorpayStatus({ msg: err.message || 'Payment failed', type: 'err' });
    } finally {
      setRzPaymentBusy(false);
    }
  };

  const handleLogPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentMilestoneName.trim()) {
      showToast('Milestone name is required.');
      return;
    }
    const parsedRupees = parseFloat(paymentAmountInRupees);
    if (isNaN(parsedRupees) || parsedRupees <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }

    // Convert Rupees format to strict integer paise (1 INR = 100 paise)
    const amountInPaise = Math.round(parsedRupees * 100);

    logPaymentMutation.mutate({
      amount: amountInPaise,
      type: paymentType,
      milestoneName: paymentMilestoneName,
      method: (paymentType === 'receipt' || paymentType === 'refund') ? paymentMethod : undefined,
      referenceNumber: (paymentType === 'receipt' || paymentType === 'refund') ? paymentRefNumber || undefined : undefined,
      isInterstate: (paymentType === 'invoice' || paymentType === 'charge') ? paymentIsInterstate : undefined
    });
  };

  const handleRegisterCourierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber.trim()) {
      showToast('Tracking number is required.');
      return;
    }
    if (!shippingAddress.trim()) {
      showToast('Shipping address is required.');
      return;
    }
    registerShipmentMutation.mutate({
      courierPartner,
      trackingNumber,
      shippingAddress
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-gold bg-brand-navy min-h-screen flex items-center justify-center">Loading Client Profile...</div>;
  }

  if (isError || !client) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-error bg-brand-navy min-h-screen flex items-center justify-center">Failed to fetch client profile or Client Not Found.</div>;
  }

  const activeEng = client.engagements?.[0];
  const selectedAgreement = clientAgreements.find(a => a.id === selectedAgreementId);

  const calculateHealthScore = () => {
    let score = 100;
    const openTasksCount = clientTasks.filter(t => t.status !== 'done').length;
    score -= openTasksCount * 15;
    
    const coreConsent = client.consents?.find(c => c.consentType === 'core-processing');
    if (!coreConsent || coreConsent.status === 'withdrawn') {
      score -= 10;
    }
    
    const hasOverdueMilestone = clientMilestones.some(m => m.status === 'pending' && m.overdueLevel !== 'none');
    if (hasOverdueMilestone) {
      score -= 25;
    }
    
    return Math.max(10, score);
  };
  const healthScore = calculateHealthScore();

  const calculateInvoicedProgress = () => {
    const clientPaymentsList = paymentsData?.payments || [];
    const totalInvoiced = clientPaymentsList
      .filter(p => p.type === 'invoice' || p.type === 'charge')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = clientPaymentsList
      .filter(p => p.type === 'receipt')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const percent = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 100;
    return { totalInvoiced, totalPaid, percent };
  };
  const billingSummary = calculateInvoicedProgress();

  const clientDivision = client.primaryDivision || activeEng?.division || 'study-abroad';
  const sidebarTabs = [
    { id: 'tasks', label: 'Tasks & Reminders' },
    { id: 'vault', label: 'Document Vault' },
    // PRD-001 Staff OCR Workbench — staff-only, HITL, never client portal (owner constraint)
    ...((['super_admin','manager','counselor','coordinator'].includes(meRole)) ? [{ id: 'ocr', label: 'OCR Workbench (Staff)' }] : []),
    ...(meCanAgreements ? [{ id: 'agreements', label: 'Service Agreements' }] : []),
    ...(meRole === 'super_admin' || meRole === 'manager' ? [{ id: 'payments', label: 'Milestones & GST' }] : []),
    ...(meRole === 'super_admin' || meRole === 'manager' ? [{ id: 'umrah', label: 'Tours & Travels' }] : []),
    { id: 'courier', label: 'Courier Tracker' },
    // Division Specific Desks: dynamically filtered!
    ...(clientDivision === 'study-abroad' ? [{ id: 'study-abroad', label: 'Study Abroad Desk' }] : []),
    ...(clientDivision === 'visa' ? [{ id: 'visa', label: 'Visa Prep Desk' }] : []),
    ...(clientDivision === 'attestation' ? [{ id: 'attestation', label: 'Attestations Desk' }] : []),
    ...(clientDivision === 'manpower' ? [{ id: 'manpower', label: 'Manpower Desk' }] : []),
  ];

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden text-brand-navy font-sans">

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-16 bg-white/85 border-b border-brand-navy/10 shadow-sm backdrop-blur-xl flex items-center justify-between px-8 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-display font-semibold text-lg text-brand-navy">
              Client Profile: <span className="text-brand-gold">{client.name}</span>
            </h2>
            <span className="px-3 py-1 bg-brand-navy text-brand-gold border border-brand-gold/30 text-[13px] uppercase font-bold tracking-widest rounded-full">
              {activeEng?.division || 'General Lead'}
            </span>
          </div>

          {/* Linear Progress Stage Timeline */}
          {activeEng && (
            <div className="hidden md:flex items-center gap-2">
              {[
                { key: 'lead', label: 'Consult', seq: 1 },
                { key: 'qualified', label: 'Qualify', seq: 2 },
                { key: 'documents', label: 'Documents', seq: 3 },
                { key: 'processing', label: 'Processing', seq: 4 },
                { key: 'complete', label: 'Complete', seq: 5 },
              ].map((step, idx, arr) => {
                const currentStages = ['lead', 'qualified', 'documents', 'processing', 'complete'];
                const currentIdx = currentStages.indexOf(activeEng.stageKey);
                const stepIdx = currentStages.indexOf(step.key);
                
                const isCompleted = stepIdx < currentIdx;
                const isActive = stepIdx === currentIdx;

                return (
                  <React.Fragment key={step.key}>
                    <div className={`flex items-center gap-1.5 text-xs ${
                      isCompleted ? 'text-brand-success font-medium' : isActive ? 'text-brand-gold font-semibold' : 'text-brand-navy/40'
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold border ${
                        isCompleted 
                          ? 'bg-brand-success/15 border-brand-success text-brand-success' 
                          : isActive 
                            ? 'bg-brand-gold/15 border-brand-gold text-brand-gold' 
                            : 'bg-brand-navy/[0.05] border-brand-navy/10 text-brand-navy/40'
                      }`}>
                        {isCompleted ? '✓-✓' : step.seq}
                      </span>
                      <span>{step.label}</span>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-8 h-[2px] ${isCompleted ? 'bg-brand-success' : 'bg-brand-navy/[0.08]'}`}></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <a 
              href={`/portal?token=${client.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm"
              title="View this page as the candidate sees it on the Portal"
            >
              👁 Impersonate Portal
            </a>
            
            <a 
              href={`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm"
              title="Chat with candidate on WhatsApp Messenger"
            >
              💬 WhatsApp Chat
            </a>

            {activeEng ? (
              <button 
                onClick={handleAdvanceStage} 
                disabled={advanceMutation.isPending || activeEng?.stageKey === 'complete'}
                className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition disabled:opacity-50 shadow-md"
              >
                <span>Advance Stage</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            ) : (
              <button 
                onClick={handleInitializeEngagement} 
                disabled={initializeEngagementMutation.isPending}
                className="bg-brand-navy hover:bg-brand-navy/90 text-brand-gold px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-md border border-brand-gold/30"
              >
                <span>🚀 Initialize Pipeline</span>
              </button>
            )}
          </div>
        </header>

        {/* CONTENT BODY */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT COLUMN: Profile info, Passports & Consents audit */}
          <section className="w-80 border-r border-brand-navy/[0.08] bg-brand-navy/[0.02] p-6 overflow-y-auto shrink-0 flex flex-col gap-6">
            <div className="text-center pb-6 border-b border-brand-navy/10">
              <div className="w-24 h-24 rounded-full bg-brand-gold/10 border-2 border-brand-gold mx-auto flex items-center justify-center text-brand-gold font-display font-bold text-3xl mb-3 shadow-inner">
                {client.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
              </div>
              <h3 className="font-display font-bold text-base text-brand-navy">{client.name}</h3>
              <p className="text-xs text-brand-navy/50 mt-0.5">Token: {clientId}</p>
            </div>

            {/* Contact details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">Contact Details</h4>
              <div className="space-y-3 text-xs bg-brand-navy/[0.04] p-3 rounded-lg border border-brand-navy/10">
                <div>
                  <span className="text-[13px] text-brand-navy/50 block mb-0.5">Mobile Phone</span>
                  <span className="font-semibold text-brand-navy/80">{client.phone}</span>
                </div>
                <div>
                  <span className="text-[13px] text-brand-navy/50 block mb-0.5">Email Address</span>
                  <span className="font-semibold text-brand-navy/80">{client.email}</span>
                </div>
                <div>
                  <span className="text-[13px] text-brand-navy/50 block mb-0.5">Highest Qualification</span>
                  <span className="font-semibold text-brand-navy/80 uppercase">{client.highestQualification}</span>
                </div>
              </div>
            </div>

            {/* Passport details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">PII Passport Vault</h4>
              <div className="space-y-3 text-xs bg-brand-navy/[0.04] p-3 rounded-lg border border-brand-navy/10">
                <div>
                  <span className="text-[13px] text-brand-navy/50 block mb-0.5">Passport Number (Masked)</span>
                  <span className="font-mono font-bold tracking-widest text-brand-gold">
                    {client.passportNumber || 'Not Uploaded'}
                  </span>
                </div>
                <div>
                  <span className="text-[13px] text-brand-navy/50 block mb-0.5">Expiry Date</span>
                  <span className="font-semibold text-brand-navy/80">{client.passportExpiry || 'Not Provided'}</span>
                </div>
              </div>
            </div>

            {/* DPDP Consents checklist */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">DPDP-2023 Consents</h4>
              <div className="space-y-3">
                {client.consents?.map((consent) => (
                  <div key={consent.id} className="p-3 bg-brand-navy/[0.04] rounded-lg border border-brand-navy/10 text-[13px] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-brand-gold uppercase">{consent.consentType.replace('-', ' ')}</span>
                      <span className="px-2 py-0.2 bg-emerald-50 text-brand-success border border-emerald-500/20 rounded font-bold uppercase tracking-widest text-sm">
                        GRANTED
                      </span>
                    </div>
                    <div>
                      <span className="text-brand-navy/50 block leading-none">SHA-256 Digest:</span>
                      <span className="font-mono text-xs break-all block mt-1 text-brand-navy/60 font-semibold">{consent.sha256Hash}</span>
                    </div>
                    <span className="text-sm text-brand-navy/40 block">IP: {consent.ipAddress}  {new Date(consent.grantedAt * 1000).toLocaleDateString()}</span>
                  </div>
                ))}
                {(!client.consents || client.consents.length === 0) && (
                  <div className="p-4 text-center text-xs text-brand-navy/40 bg-brand-navy/[0.03] rounded border border-dashed border-brand-navy/10">
                    No active consent logs found
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* CENTER COLUMN: Tabs & Integrated Modules */}
          <section className="flex-1 bg-brand-navy/[0.02] p-6 overflow-y-auto flex flex-col gap-6">
            
            {/* VISUAL INSIGHTS HUB (B2B Gold Standard best practice CRM dashboard layout) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Card 1: Account Health Score & Action State */}
              <div className="bg-white p-5 rounded-2xl border border-brand-navy/10 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <span className="text-[13px] text-brand-navy/40 font-bold uppercase tracking-wider block">Case Health Score</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className={`text-2xl font-extrabold ${
                      healthScore >= 80 ? 'text-emerald-700' : healthScore >= 50 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {healthScore}%
                    </span>
                    <span className="text-xs text-brand-navy/40">Status</span>
                  </div>
                  <p className="text-[13px] text-brand-navy/50 mt-1 leading-tight">
                    {healthScore >= 80 ? '✓ Profile status healthy.' : '⚠️ Open tasks / pending dues.'}
                  </p>
                </div>
                
                {/* Visual Circular Gauge using inline SVG */}
                <div className="w-14 h-14 shrink-0 relative flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="28" cy="28" r="22" stroke="rgba(10,45,80,0.06)" strokeWidth="4" fill="transparent" />
                    <circle 
                      cx="28" cy="28" r="22" 
                      stroke={healthScore >= 80 ? '#047857' : healthScore >= 50 ? '#d97706' : '#dc2626'} 
                      strokeWidth="4" fill="transparent" 
                      strokeDasharray={2 * Math.PI * 22}
                      strokeDashoffset={2 * Math.PI * 22 * (1 - healthScore / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[13px] font-extrabold text-brand-navy/60">Health</span>
                </div>
              </div>

              {/* Card 2: DPDP-2023 Consent Audit Desk */}
              <div className="bg-white p-5 rounded-2xl border border-brand-navy/10 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <span className="text-[13px] text-brand-navy/40 font-bold uppercase tracking-wider block">DPDP-2023 Consents</span>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border uppercase tracking-wider ${
                      client.consents?.some(c => c.consentType === 'core-processing' && c.status === 'granted')
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                      {client.consents?.some(c => c.consentType === 'core-processing' && c.status === 'granted')
                        ? 'Core Granted' : 'Withdrawn / Empty'}
                    </span>
                  </div>
                  <p className="text-[13px] text-brand-navy/50 mt-2 leading-tight">
                    WhatsApp Updates: <span className="font-bold">{client.consents?.some(c => c.consentType === 'whatsapp-updates' && c.status === 'granted') ? 'Active' : 'Muted'}</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-brand-navy/5 flex items-center justify-center text-brand-navy/45 text-sm shrink-0">
                  🛡️
                </div>
              </div>

              {/* Card 3: Milestone & Collection Progress bar */}
              <div className="bg-white p-5 rounded-2xl border border-brand-navy/10 shadow-sm flex flex-col justify-between gap-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-brand-navy/40 font-bold uppercase tracking-wider">Milestone Collection</span>
                  <span className="text-xs font-bold text-brand-gold">{billingSummary.percent}% Collected</span>
                </div>
                
                {/* Horizontal Progress Bar */}
                <div className="w-full bg-brand-navy/5 rounded-full h-2 overflow-hidden mt-1 border border-brand-navy/5">
                  <div 
                    className="bg-brand-gold h-full rounded-full transition-all duration-500" 
                    style={{ width: `${billingSummary.percent}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[13px] text-brand-navy/60 font-semibold mt-1">
                  <span>Paid: ₹{(billingSummary.totalPaid / 100).toFixed(2)}</span>
                  <span>Billed: ₹{(billingSummary.totalInvoiced / 100).toFixed(2)}</span>
                </div>
              </div>

            </div>

            {!activeEng && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="font-display font-bold text-sm text-amber-800">No Active Service Engagement</h4>
                  <p className="text-xs text-amber-700 mt-1">This candidate does not have an active application tracking pipeline registered. Initialize the pipeline to assign task cards, milestone collections, and progress check-offs.</p>
                </div>
                <button
                  onClick={handleInitializeEngagement}
                  disabled={initializeEngagementMutation.isPending}
                  className="bg-brand-navy text-brand-gold font-bold px-4 py-2 rounded text-xs hover:bg-brand-navy/90 transition shadow shrink-0 whitespace-nowrap border border-brand-gold/30"
                >
                  {initializeEngagementMutation.isPending ? 'Initializing...' : '🚀 Initialize Pipeline'}
                </button>
              </div>
            )}

            <div className="flex gap-6 items-start flex-1 min-h-0">
              {/* Left Vertical Tab Navigation Sidebar */}
              <div className="w-64 bg-white rounded-xl border border-brand-navy/10 shadow-md p-2 flex flex-col gap-1 shrink-0 backdrop-blur-sm">
                {sidebarTabs.map((tab: any) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-brand-gold text-brand-navy shadow border-l-4 border-brand-gold'
                          : 'text-brand-navy/40 hover:bg-brand-navy/[0.05] hover:text-brand-navy'
                      }`}
                    >
                      {tabIcons[tab.id] || null}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right Content Panel */}
              <div className="flex-1 min-h-0">

            {/* ==========================================
                TAB 0: TASKS (Section 8.2)
                ========================================== */}
            {activeTab === 'tasks' && (
              <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md flex flex-col gap-4 backdrop-blur-sm">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-gold">Client Tasks</h3>
                    <p className="text-xs text-brand-navy/50 mt-0.5">Assignments, reminders and follow-ups for this client.</p>
                  </div>
                  <span className="text-[13px] uppercase bg-brand-navy/[0.06] text-brand-navy/50 px-2.5 py-1 rounded font-bold border border-brand-navy/10">
                    {clientTasks.filter(t => t.status !== 'done').length} open
                  </span>
                </div>

                {/* Create task */}
                <form
                  onSubmit={(e) => { e.preventDefault(); if (newTaskTitle.trim()) createTaskMutation.mutate(); }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    type="text"
                    placeholder="New task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 min-w-[180px] bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <input
                    type="date"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold transition"
                  >
                    Add Task
                  </button>
                </form>

                <div className="space-y-2">
                  {clientTasks.length === 0 && (
                    <p className="text-xs text-brand-navy/40 text-center py-6">No tasks for this client yet.</p>
                  )}
                  {clientTasks.map((task) => {
                    const isOverdue = task.dueDate && task.dueDate < Math.floor(Date.now() / 1000) && task.status !== 'done';
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between gap-3 bg-brand-navy/[0.04] border rounded-lg px-3 py-2.5 text-xs ${
                          isOverdue ? 'border-brand-error/50' : 'border-brand-navy/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleTaskStatus.mutate({ id: task.id, status: task.status === 'done' ? 'open' : 'done' })}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition shrink-0 ${
                              task.status === 'done' ? 'bg-brand-success border-brand-success text-white' : 'border-brand-navy/25 hover:border-brand-gold'
                            }`}
                            title={task.status === 'done' ? 'Mark open' : 'Mark done'}
                          >
                            {task.status === 'done' ? '✓-✓' : ''}
                          </button>
                          <div className="min-w-0">
                            <p className={`font-semibold text-brand-navy truncate ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>
                              {task.title}
                            </p>
                            {task.dueDate && (
                              <p className={`text-[13px] ${isOverdue ? 'text-brand-error font-bold' : 'text-brand-navy/40'}`}>
                                {isOverdue ? 'Overdue · ' : 'Due '}{new Date(task.dueDate * 1000).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider shrink-0 ${
                          task.priority === 'urgent' ? 'bg-brand-error/20 text-brand-error'
                          : task.priority === 'high' ? 'bg-brand-warning/20 text-brand-warning'
                          : task.priority === 'medium' ? 'bg-brand-gold/15 text-brand-gold'
                          : 'bg-brand-navy/[0.05] text-brand-navy/60'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 1: DOCUMENT VAULT
                ========================================== */}
            {activeTab === 'vault' && (
              <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md flex flex-col gap-4 backdrop-blur-sm">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-gold">Document Vault</h3>
                    <p className="text-xs text-brand-navy/50 mt-0.5">Storage compliance repository on Cloudflare R2 bucket. Select multiple to bulk verify/download.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {client.documents && client.documents.length > 0 && (
                      <>
                        <button
                          onClick={handleBulkDownload}
                          disabled={selectedDocs.size === 0}
                          className="px-3 py-2 rounded-lg border border-brand-navy/15 bg-white text-brand-navy text-xs font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                        >
                          ⬇ Download ({selectedDocs.size})
                        </button>
                        <button
                          onClick={() => handleBulkVerify('verified')}
                          disabled={selectedDocs.size === 0}
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                        >
                          ✓ Verify ({selectedDocs.size})
                        </button>
                      </>
                    )}
                    <label className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-md">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                      <span>Upload Document</span>
                      <input 
                        type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" 
                        onChange={handleDocumentUpload} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-brand-navy/[0.04] text-brand-gold font-bold uppercase tracking-wider text-[13px] border-b border-brand-navy/[0.08]">
                        <th className="p-4 w-8">
                          <input
                            type="checkbox"
                            checked={client.documents ? selectedDocs.size === client.documents.length && client.documents.length > 0 : false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDocs(new Set((client.documents || []).map((d) => d.id)));
                              } else {
                                setSelectedDocs(new Set());
                              }
                            }}
                            className="w-4 h-4 accent-brand-gold cursor-pointer"
                            aria-label="Select all documents"
                          />
                        </th>
                        <th className="p-4">Document Name</th>
                        <th className="p-4">Version</th>
                        <th className="p-4">Upload Date</th>
                        <th className="p-4">Compliance</th>
                        <th className="p-4">Originals Transit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {client.documents?.map((doc) => (
                        <tr key={doc.id} className="hover:bg-brand-navy/[0.05] transition">
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedDocs.has(doc.id)}
                              onChange={(e) => {
                                const next = new Set(selectedDocs);
                                if (e.target.checked) next.add(doc.id);
                                else next.delete(doc.id);
                                setSelectedDocs(next);
                              }}
                              className="w-4 h-4 accent-brand-gold cursor-pointer"
                              aria-label={`Select ${doc.fileName}`}
                            />
                          </td>
                          <td className="p-4 font-semibold text-brand-navy">{doc.fileName}</td>
                          <td className="p-4 text-brand-navy/50 font-mono">{doc.version}</td>
                          <td className="p-4 text-brand-navy/60">{new Date(doc.uploadedAt * 1000).toLocaleDateString()}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              doc.status === 'verified' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {doc.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4">
                            {doc.courierTrackingNumber ? (
                              <span className="px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-900 rounded font-mono text-[13px]">
                                {doc.courierName}: {doc.courierTrackingNumber} ({doc.courierStatus})
                              </span>
                            ) : (
                              <span className="text-brand-navy/40">Not Dispatched</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {(!client.documents || client.documents.length === 0) && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-xs text-brand-navy/40">
                            No Documents Uploaded in Vault — documents uploaded in Study Abroad → Documents will appear here live.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 1b: STAFF OCR WORKBENCH (PRD-001, staff-only, HITL)
                Never exposed to client portal — staff processes, client sees only status.
                ========================================== */}
            {activeTab === 'ocr' && (
              <OcrWorkbench clientId={clientId} clientName={client?.name || ''} showToast={showToast} />
            )}

            {/* ==========================================
                TAB 2: SERVICE AGREEMENTS
                ========================================== */}
            {activeTab === 'agreements' && (
              <div className="flex flex-col gap-6">
                
                {/* Generation Block */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Compile New Service Agreement</h3>
                  
                  <form onSubmit={handleCreateDraftAgreement} className="flex flex-wrap gap-4 items-end bg-brand-navy/[0.04] p-4 rounded-lg border border-brand-navy/10">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Standard Templates</label>
                      <select 
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                      >
                        <option value="">-- Choose Agreement Template --</option>
                        {templatesData?.templates?.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.division.toUpperCase()})</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      type="submit"
                      disabled={generateAgreementMutation.isPending}
                      className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold py-2.5 px-4 rounded text-xs transition disabled:opacity-50 shadow-md"
                    >
                      {generateAgreementMutation.isPending ? 'Compiling Clauses...' : 'Generate Agreement Draft'}
                    </button>
                  </form>
                </div>

                {/* Agreement Index & Merged Clauses Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Side: Draft list */}
                  <div className="bg-white p-4 rounded-xl border border-brand-navy/10 h-96 overflow-y-auto flex flex-col gap-3 backdrop-blur-sm">
                    <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider pb-2 border-b border-brand-navy/10">Generated Agreements</h4>
                    {clientAgreements.map((agreement) => (
                      <button
                        key={agreement.id}
                        onClick={() => setSelectedAgreementId(agreement.id)}
                        className={`text-left p-3 rounded-lg border text-xs flex flex-col gap-1 transition duration-200 ${
                          selectedAgreementId === agreement.id
                            ? 'bg-brand-navy/[0.05] border-brand-gold'
                            : 'bg-brand-navy/[0.04] border-brand-navy/10 hover:border-brand-navy/20'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-bold text-brand-navy truncate max-w-[120px]">ID: {agreement.id.substring(0, 8)}...</span>
                          <span className={`px-1.5 py-0.5 rounded text-sm font-bold uppercase ${
                            agreement.status === 'signed' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {agreement.status}
                          </span>
                        </div>
                        <p className="text-[13px] text-brand-navy/50">Created: {new Date(agreement.createdAt * 1000).toLocaleDateString()}</p>
                        {agreement.sha256Hash && (
                          <div className="mt-1 bg-brand-navy/[0.05] p-1 rounded font-mono text-xs text-brand-navy/60 break-all border border-brand-navy/10">
                            Checksum: {agreement.sha256Hash.substring(0, 16)}...
                          </div>
                        )}
                      </button>
                    ))}

                    {clientAgreements.length === 0 && (
                      <div className="text-center text-xs text-brand-navy/40 py-10">
                        No agreements generated yet.
                      </div>
                    )}
                  </div>

                  {/* Right Side: Preview Clauses Pane */}
                  <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-brand-navy/10 flex flex-col gap-4 justify-between h-96 backdrop-blur-sm">
                    <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">Agreement Draft Preview</h4>
                        <p className="text-[13px] text-brand-navy/50 mt-0.5">Merged clauses audit trail.</p>
                      </div>
                      {selectedAgreement && selectedAgreement.status === 'draft' && (
                        <button
                          onClick={() => handleOpenSignModal(selectedAgreement.id)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1 px-3 rounded text-[13px] transition shadow"
                        >
                          eSign Document
                        </button>
                      )}
                    </div>

                    <div className="flex-1 bg-brand-navy/[0.04] border border-brand-navy/10 rounded p-4 overflow-y-auto text-sm font-mono whitespace-pre-wrap text-brand-navy/60">
                      {selectedAgreement ? selectedAgreement.content : 'Select an agreement from the list to preview merged clauses.'}
                    </div>

                    {selectedAgreement && selectedAgreement.sha256Hash && (
                      <div className="bg-brand-navy/[0.04] p-3 rounded-lg border border-brand-navy/10 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <div className="flex-1 font-mono text-[13px] text-brand-navy/60 truncate">
                          <span className="text-brand-navy/50 font-sans font-bold">SHA-256 Consent Hash:</span> {selectedAgreement.sha256Hash}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 3: MILESTONE PAYMENTS & GST INVOICING
                ========================================== */}
            {activeTab === 'payments' && (
              <div className="flex flex-col gap-6">
                
                {/* Razorpay Online Collection (Section 44) */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <div>
                      <h3 className="font-display font-bold text-sm text-brand-gold">Collect Online Payment (Razorpay)</h3>
                      <p className="text-xs text-brand-navy/50 mt-0.5">UPI ₹ Cards ₹ Netbanking ₹ Wallets ₹ amount computed from the ledger.</p>
                    </div>
                    {razorpayStatus && (
                      <span className={`text-[13px] px-2 py-1 rounded font-bold uppercase ${razorpayStatus.type === 'err' ? 'bg-brand-error/20 text-brand-error' : 'bg-brand-success/15 text-brand-success'}`}>
                        {razorpayStatus.msg}
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleRazorpaySubmit} className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Milestone</label>
                      <input
                        type="text"
                        value={razorpayMilestone}
                        onChange={(e) => setRazorpayMilestone(e.target.value)}
                        placeholder="e.g. 2nd Installment"
                        className="w-56 text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                      />
                    </div>
                    <div>
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Amount (₹-₹)</label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={razorpayAmount}
                        onChange={(e) => setRazorpayAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-40 text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={rzPaymentBusy}
                      className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-5 py-2.5 rounded text-xs font-bold transition disabled:opacity-40"
                    >
                      {rzPaymentBusy ? 'Processing...' : 'Pay with Razorpay'}
                    </button>
                  </form>
                </div>

                {/* Submit New Billing Log */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Log Billing Entry (Charges & Invoices)</h3>
                  
                  <form onSubmit={handleLogPaymentSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      
                      {/* Milestone Name */}
                      <div className="md:col-span-2">
                        <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Milestone / Item Name</label>
                        <input 
                          type="text" 
                          value={paymentMilestoneName}
                          onChange={(e) => setPaymentMilestoneName(e.target.value)}
                          placeholder="e.g. Visa Processing Fee, Onboarding Deposit"
                          className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                        />
                      </div>

                      {/* Entry Type */}
                      <div>
                        <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Entry Type</label>
                        <select 
                          value={paymentType}
                          onChange={(e) => setPaymentType(e.target.value as any)}
                          className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                        >
                          <option value="invoice">Invoice (Increase Bal)</option>
                          <option value="charge">Debit Charge (Increase Bal)</option>
                          <option value="receipt">Receipt (Decrease Bal)</option>
                          <option value="refund">Refund (Increase Bal)</option>
                        </select>
                      </div>

                      {/* Amount in Rupees */}
                      <div>
                        <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Amount (Rupees ₹-₹)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={paymentAmountInRupees}
                          onChange={(e) => setPaymentAmountInRupees(e.target.value)}
                          placeholder="0.00"
                          className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                        />
                      </div>

                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-brand-navy/10">
                      
                      {/* Sub-fields for receipt/refund */}
                      {(paymentType === 'receipt' || paymentType === 'refund') ? (
                        <div className="flex gap-4 items-center">
                          <div>
                            <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Payment Method</label>
                            <select 
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as any)}
                              className="text-xs p-2 rounded bg-brand-navy/[0.06] border border-brand-navy/10 text-brand-navy"
                            >
                              <option value="upi">UPI (GPay/PhonePe)</option>
                              <option value="bank_transfer">IMPS/NEFT Bank Transfer</option>
                              <option value="cash">Hard Cash</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Reference Number</label>
                            <input 
                              type="text" 
                              value={paymentRefNumber}
                              onChange={(e) => setPaymentRefNumber(e.target.value)}
                              placeholder="UTR / Ref Number"
                              className="text-xs p-2 rounded bg-brand-navy/[0.06] border border-brand-navy/10 text-brand-navy focus:ring-brand-gold w-48"
                            />
                          </div>
                        </div>
                      ) : (
                        /* Sub-fields for Invoice / Charge */
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="interstate"
                            checked={paymentIsInterstate}
                            onChange={(e) => setPaymentIsInterstate(e.target.checked)}
                            className="rounded border-brand-navy/10 bg-brand-navy/[0.05] text-brand-gold focus:ring-0 w-4 h-4"
                          />
                          <label htmlFor="interstate" className="text-xs text-brand-navy/60 font-medium cursor-pointer">
                            Interstate Transaction (Charges 18% IGST instead of 9% CGST + 9% SGST)
                          </label>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={logPaymentMutation.isPending}
                        className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold py-2.5 px-6 rounded text-xs transition shadow-md ml-auto"
                      >
                        {logPaymentMutation.isPending ? 'Logging Entry...' : 'Submit Ledger Entry'}
                      </button>

                    </div>
                  </form>
                </div>

                {/* Overdue Milestone Escalation status warning banners */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-display font-bold text-sm text-brand-gold">Milestone Payment Escalation Warnings</h3>
                      <p className="text-xs text-brand-navy/50 mt-0.5">Real-time outstanding tracking. System auto-escalates aging pending invoices.</p>
                    </div>
                    <button
                      onClick={() => evaluateEscalationsMutation.mutate()}
                      disabled={evaluateEscalationsMutation.isPending}
                      className="bg-brand-navy/[0.06] hover:bg-brand-navy/[0.08] border border-brand-navy/15 text-brand-gold px-3.5 py-2 rounded text-xs font-bold transition flex items-center gap-1 shadow"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.23"></path></svg>
                      <span>Run Escalation Check</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clientMilestones.map((milestone) => {
                      const isPending = milestone.status === 'pending';
                      const isOverdue = isPending && milestone.overdueLevel !== 'none';
                      
                      let warningBadgeStyle = 'bg-brand-navy/[0.04] text-brand-navy/50 border-brand-navy/10';
                      let warningText = 'No Escalation';

                      if (isOverdue) {
                        switch (milestone.overdueLevel) {
                          case 'yellow':
                            warningBadgeStyle = 'bg-yellow-950 text-yellow-400 border-yellow-800';
                            warningText = 'Escalation Level 1';
                            break;
                          case 'orange':
                            warningBadgeStyle = 'bg-orange-950 text-orange-400 border-orange-850';
                            warningText = 'Escalation Level 2';
                            break;
                          case 'red':
                            warningBadgeStyle = 'bg-red-50 text-red-600 border-red-200';
                            warningText = 'Critical Level 3';
                            break;
                          case 'hold':
                            warningBadgeStyle = 'bg-purple-950 text-purple-400 border-purple-900 animate-pulse';
                            warningText = 'Account Hold';
                            break;
                        }
                      }

                      return (
                        <div key={milestone.id} className="bg-brand-navy/[0.04] p-4 rounded-xl border border-brand-navy/10 flex flex-col justify-between gap-3">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-xs text-brand-navy truncate max-w-[130px]">{milestone.label}</h4>
                              <span className={`px-2 py-0.5 rounded text-sm font-bold border ${warningBadgeStyle}`}>
                                {warningText.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[13px] text-brand-navy/50 mt-1">Due Date: {new Date(milestone.dueDate * 1000).toLocaleDateString()}</p>
                          </div>
                          
                          <div className="flex justify-between items-end border-t border-brand-navy/10 pt-2.5">
                            <div>
                              <span className="text-xs text-brand-navy/40 uppercase tracking-widest block leading-none">Milestone Fee</span>
                              <span className="font-mono font-extrabold text-sm text-brand-gold">-₹{(milestone.amount / 100).toFixed(2)}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              milestone.status === 'paid' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {milestone.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {clientMilestones.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-brand-navy/40 bg-brand-navy/[0.03] rounded border border-dashed border-brand-navy/10">
                        No milestone payment schedules exist for this client's agreements.
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone Billing Ledger Table (Precise paise tracking formatted at UI boundaries) */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Billing & Tax Ledger (Paise Precision)</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-brand-navy/[0.04] text-brand-gold font-bold uppercase tracking-wider text-[13px] border-b border-brand-navy/[0.08]">
                          <th className="p-4">Date</th>
                          <th className="p-4">Transaction / Milestone</th>
                          <th className="p-4">Type</th>
                          <th className="p-4">Taxable Amt</th>
                          <th className="p-4">Tax Splits (Paise precision)</th>
                          <th className="p-4 text-right">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {paymentsData?.payments?.map((ledger) => {
                          let typeBadge = '';
                          let amountColor = 'text-brand-navy';
                          
                          switch(ledger.type) {
                            case 'invoice':
                              typeBadge = 'bg-amber-50 text-amber-700 border border-amber-200';
                              amountColor = 'text-amber-700';
                              break;
                            case 'receipt':
                              typeBadge = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                              amountColor = 'text-emerald-700';
                              break;
                            case 'charge':
                              typeBadge = 'bg-rose-50 text-rose-600 border border-rose-200';
                              amountColor = 'text-rose-600';
                              break;
                            case 'refund':
                              typeBadge = 'bg-blue-950 text-blue-400 border border-blue-200';
                              amountColor = 'text-blue-400';
                              break;
                          }

                          const hasTax = ledger.taxableAmount !== null;

                          return (
                            <tr key={ledger.id} className="hover:bg-brand-navy/[0.05] transition">
                              <td className="p-4 text-brand-navy/50">{new Date(ledger.createdAt * 1000).toLocaleDateString()}</td>
                              <td className="p-4">
                                <p className="font-semibold text-brand-navy">{ledger.milestoneName}</p>
                                {ledger.referenceNumber && (
                                  <span className="text-[13px] text-brand-navy/50 font-mono">Ref: {ledger.referenceNumber} ({ledger.method?.toUpperCase()})</span>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-sm font-bold uppercase ${typeBadge}`}>
                                  {ledger.type}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-brand-navy/60">
                                {hasTax ? `₹${(ledger.taxableAmount! / 100).toFixed(2)}` : '₹0.00'}
                              </td>
                              <td className="p-4">
                                {hasTax ? (
                                  <div className="text-[13px] font-mono text-brand-navy/50 space-y-0.5">
                                    {(() => {
                                      const rate = ledger.gstRate || (ledger.taxableAmount ? Math.round((((ledger.cgst || 0) + (ledger.sgst || 0) + (ledger.igst || 0)) / ledger.taxableAmount) * 100) : 18);
                                      const halfRate = rate / 2;
                                      return ledger.isInterstate ? (
                                        <div>IGST ({rate}%): ₹{(ledger.igst! / 100).toFixed(2)}</div>
                                      ) : (
                                        <>
                                          <div>CGST ({halfRate}%): ₹{(ledger.cgst! / 100).toFixed(2)}</div>
                                          <div>SGST ({halfRate}%): ₹{(ledger.sgst! / 100).toFixed(2)}</div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <span className="text-brand-navy/40">Exempt / Non-Taxable</span>
                                )}
                              </td>
                              <td className={`p-4 text-right font-mono font-extrabold ${amountColor}`}>
                                ₹{(ledger.amount / 100).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}

                        {(!paymentsData?.payments || paymentsData.payments.length === 0) && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-xs text-brand-navy/40">
                              No financial ledger items logged for this client profile.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ==========================================
                TAB 4: UMRAH GROUP DEPARTURES
                ========================================== */}
            {activeTab === 'umrah' && (
              <div className="flex flex-col gap-6">
                
                {/* Section A: Client Active Bookings Checklist */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <div className="mb-4">
                    <h3 className="font-display font-bold text-sm text-brand-gold">Passenger Active Bookings & Documents Checklist</h3>
                    <p className="text-xs text-brand-navy/50 mt-0.5">Verify pilgrim passport scans, visa statuses, vaccination clearances, and final boarding passes.</p>
                  </div>

                  {bookingsData?.bookings && bookingsData.bookings.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {bookingsData.bookings.map((booking: any) => {
                        const isSelected = selectedBookingId === booking.id;
                        return (
                          <div key={booking.id} className={`p-4 rounded-xl border transition ${isSelected ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-navy/10 bg-brand-navy/[0.04]'}`}>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div>
                                <h4 className="font-display font-extrabold text-sm text-brand-navy">
                                  Departure Flight: {new Date(booking.departureDate * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </h4>
                                <p className="text-xs text-brand-navy/40 mt-0.5">Package Tier: <span className="uppercase font-bold">{booking.packageTier}</span> | Booked On: {new Date(booking.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[13px] font-bold uppercase ${
                                  booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  booking.status === 'waitlist' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  booking.status === 'cancelled' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-brand-navy/[0.08] text-brand-navy/60'
                                }`}>
                                  {booking.status}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedBookingId(booking.id);
                                  }}
                                  className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy font-bold py-1 px-3 rounded text-sm transition shadow-sm"
                                >
                                  {isSelected ? 'Viewing Checklist' : 'Manage Checklist'}
                                </button>
                              </div>
                            </div>

                            {/* Inner checklist display if selected */}
                            {isSelected && checklistData?.checklist && (
                              <div className="mt-4 pt-4 border-t border-dashed border-brand-navy/10">
                                <h5 className="font-display font-bold text-xs text-brand-navy/70 mb-3">Verification Checklist</h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                  {/* Checkbox 1 */}
                                  <label className="flex items-center gap-2 p-2.5 bg-brand-navy/[0.04] rounded-lg border border-brand-navy/10 cursor-pointer hover:bg-brand-navy/[0.06] transition">
                                    <input
                                      type="checkbox"
                                      checked={!!checklistData.checklist.passportScanned}
                                      onChange={(e) => {
                                        updateChecklistMutation.mutate({
                                          id: checklistData.checklist.id,
                                          passportScanned: e.target.checked
                                        });
                                      }}
                                      className="rounded text-brand-gold focus:ring-brand-gold w-4 h-4"
                                    />
                                    <span className="text-xs text-brand-navy/70 font-medium">Passport Scanned</span>
                                  </label>

                                  {/* Checkbox 2 */}
                                  <label className="flex items-center gap-2 p-2.5 bg-brand-navy/[0.04] rounded-lg border border-brand-navy/10 cursor-pointer hover:bg-brand-navy/[0.06] transition">
                                    <input
                                      type="checkbox"
                                      checked={!!checklistData.checklist.visaIssued}
                                      onChange={(e) => {
                                        updateChecklistMutation.mutate({
                                          id: checklistData.checklist.id,
                                          visaIssued: e.target.checked
                                        });
                                      }}
                                      className="rounded text-brand-gold focus:ring-brand-gold w-4 h-4"
                                    />
                                    <span className="text-xs text-brand-navy/70 font-medium">Visa Issued</span>
                                  </label>

                                  {/* Checkbox 3 */}
                                  <label className="flex items-center gap-2 p-2.5 bg-brand-navy/[0.04] rounded-lg border border-brand-navy/10 cursor-pointer hover:bg-brand-navy/[0.06] transition">
                                    <input
                                      type="checkbox"
                                      checked={!!checklistData.checklist.vaccineCertificate}
                                      onChange={(e) => {
                                        updateChecklistMutation.mutate({
                                          id: checklistData.checklist.id,
                                          vaccineCertificate: e.target.checked
                                        });
                                      }}
                                      className="rounded text-brand-gold focus:ring-brand-gold w-4 h-4"
                                    />
                                    <span className="text-xs text-brand-navy/70 font-medium">Vaccine Cert</span>
                                  </label>

                                  {/* Checkbox 4 */}
                                  <label className="flex items-center gap-2 p-2.5 bg-brand-navy/[0.04] rounded-lg border border-brand-navy/10 cursor-pointer hover:bg-brand-navy/[0.06] transition">
                                    <input
                                      type="checkbox"
                                      checked={!!checklistData.checklist.ticketIssued}
                                      onChange={(e) => {
                                        updateChecklistMutation.mutate({
                                          id: checklistData.checklist.id,
                                          ticketIssued: e.target.checked
                                        });
                                      }}
                                      className="rounded text-brand-gold focus:ring-brand-gold w-4 h-4"
                                    />
                                    <span className="text-xs text-brand-navy/70 font-medium">Flight Ticket</span>
                                  </label>
                                </div>

                                <div className="flex flex-col gap-2">
                                  <span className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block">Pilgrim Travel Notes</span>
                                  <div className="flex gap-2">
                                    <textarea
                                      defaultValue={checklistData.checklist.notes || ''}
                                      placeholder="Add special traveler requests, hotel preferences or visa delays notes..."
                                      onBlur={(e) => {
                                        updateChecklistMutation.mutate({
                                          id: checklistData.checklist.id,
                                          notes: e.target.value
                                        });
                                      }}
                                      className="flex-1 min-h-[40px] text-xs p-2 bg-brand-navy/[0.06] rounded border border-brand-navy/10 focus:outline-none focus:border-brand-gold resize-none"
                                    />
                                  </div>
                                </div>

                                {checklistData.checklist.passportScanned &&
                                 checklistData.checklist.visaIssued &&
                                 checklistData.checklist.vaccineCertificate &&
                                 checklistData.checklist.ticketIssued && (
                                  <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Checklist fully approved! Boarding guidelines & travel kit auto-assigned within 24 hours.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-brand-navy/40 bg-brand-navy/[0.04] rounded border border-dashed border-brand-navy/10">
                      No active Umrah flight bookings registered for this traveler.
                    </div>
                  )}
                </div>

                {/* Section B: Departure Calendars */}
                <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
                  <div className="mb-4">
                    <h3 className="font-display font-bold text-sm text-brand-gold">Umrah Scheduled Group Departure Calendar</h3>
                    <p className="text-xs text-brand-navy/50 mt-0.5">Book clients into specific luxury departure flights and track remaining capacity seat limits.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {departuresData?.departures?.map((dep) => {
                      const remainingSeats = dep.capacity - dep.bookedSeats;
                      
                      let seatBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      if (remainingSeats === 0) {
                        seatBadgeColor = 'bg-red-50 text-red-600 border-red-200';
                      } else if (remainingSeats <= 10) {
                        seatBadgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                      }

                      return (
                        <div key={dep.id} className="bg-brand-navy/[0.04] p-5 rounded-xl border border-brand-navy/10 flex flex-col justify-between gap-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-brand-navy/50 uppercase tracking-widest">Flight Departure Date</span>
                              <h4 className="font-display font-extrabold text-base text-brand-gold mt-0.5">
                                {new Date(dep.departureDate * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[13px] text-brand-navy/50 uppercase font-semibold">Tier: {dep.packageTier}</span>
                                <span className={`px-1.5 py-0.5 rounded text-sm font-extrabold uppercase ${
                                  dep.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                  dep.status === 'cancelled' ? 'bg-red-50 text-red-600' : 'bg-brand-navy/10 text-brand-navy'
                                }`}>
                                  {dep.status}
                                </span>
                              </div>
                            </div>
                            
                            <div className={`px-2.5 py-1 rounded border text-center ${seatBadgeColor}`}>
                              <span className="text-[13px] font-bold block leading-none">{remainingSeats}</span>
                              <span className="text-sm uppercase font-bold tracking-wider">Seats Left</span>
                            </div>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-brand-navy/10 flex justify-between items-center text-xs backdrop-blur-sm">
                            <div>
                              <span className="text-sm text-brand-navy/40 uppercase block">Group Capacity</span>
                              <span className="font-bold text-brand-navy/50 font-mono">{dep.bookedSeats} / {dep.capacity} Booked</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm text-brand-navy/40 uppercase block">Booking Fee</span>
                              <span className="font-bold text-brand-navy/50 font-mono">₹{(dep.bookingFee / 100).toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center flex-wrap gap-2">
                            <span className="font-mono text-xs font-bold text-brand-navy">Price: ₹{(dep.price / 100).toFixed(2)}</span>
                            <div className="flex gap-1.5">
                              {/* Manager status controls */}
                              {(meRole === 'super_admin' || meRole === 'manager') && dep.status === 'open' && (
                                <>
                                  <button
                                    onClick={() => updateDepartureStatusMutation.mutate({ departureId: dep.id, status: 'confirmed' })}
                                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1 px-2.5 rounded text-[13px] transition"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => updateDepartureStatusMutation.mutate({ departureId: dep.id, status: 'cancelled' })}
                                    className="bg-red-700 hover:bg-red-800 text-white font-bold py-1 px-2.5 rounded text-[13px] transition"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => bookUmrahSeatMutation.mutate(dep.id)}
                                disabled={bookUmrahSeatMutation.isPending || dep.status === 'cancelled'}
                                className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold py-1.5 px-4 rounded text-xs transition shadow-md disabled:opacity-50"
                              >
                                {bookUmrahSeatMutation.isPending ? 'Booking...' : (remainingSeats === 0 ? 'Waitlist Seat' : 'Book Seat')}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {(!departuresData?.departures || departuresData.departures.length === 0) && (
                      <div className="col-span-full py-8 text-center text-xs text-brand-navy/40 bg-brand-navy/[0.03] rounded border border-dashed border-brand-navy/10">
                        No Umrah scheduled group departures available.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* ==========================================
                TAB 5: ATTESTATION COURIER TRACKER
                ========================================== */}
            {activeTab === 'courier' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Shipment Registration Form */}
                <div className="bg-brand-navy/[0.06] p-6 rounded-xl border border-brand-navy/10 h-fit shadow-md">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Register Attestation Shipment</h3>
                  
                  <form onSubmit={handleRegisterCourierSubmit} className="space-y-4">
                    <div>
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Courier Partner</label>
                      <select
                        value={courierPartner}
                        onChange={(e) => setCourierPartner(e.target.value as any)}
                        className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                      >
                        <option value="blue-dart">Blue Dart Express</option>
                        <option value="dtdc">DTDC Courier</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Tracking Number</label>
                      <input 
                        type="text" 
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Enter courier reference tracking ID..."
                        className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold"
                      />
                    </div>

                    <div>
                      <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Delivery Destination Address</label>
                      <textarea
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="Enter consignee shipping address details..."
                        rows={3}
                        className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={registerShipmentMutation.isPending}
                      className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold py-2 px-4 rounded text-xs transition shadow-md disabled:opacity-50"
                    >
                      {registerShipmentMutation.isPending ? 'Registering...' : 'Register Tracking ID'}
                    </button>
                  </form>
                </div>

                {/* Shipments List & Progress timelines */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-brand-navy/10 flex flex-col gap-5 justify-between min-h-[400px] backdrop-blur-sm">
                  
                  {/* Track selector header */}
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-gold">Attestation Shipment Timeline</h3>
                    <p className="text-xs text-brand-navy/50 mt-0.5">Select a registered shipment below to query live courier events.</p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {shipments.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedShipmentId(s.id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition duration-200 ${
                            selectedShipmentId === s.id
                              ? 'bg-brand-navy/[0.06] border-brand-gold text-brand-gold'
                              : 'bg-brand-navy/[0.04] border-brand-navy/10 text-brand-navy/50 hover:border-brand-navy/10'
                          }`}
                        >
                          {s.courierPartner === 'blue-dart' ? 'Blue Dart' : 'DTDC'}: {s.trackingNumber}
                        </button>
                      ))}

                      {shipments.length === 0 && (
                        <span className="text-xs text-brand-navy/40">No shipments registered for this client.</span>
                      )}
                    </div>
                  </div>

                  {/* Vertical Progress events timeline */}
                  <div className="flex-1 bg-brand-navy/[0.04] rounded-lg p-5 border border-brand-navy/10 overflow-y-auto">
                    {isLoadingTracking ? (
                      <div className="text-center text-xs text-brand-navy/40 py-12">Loading events from courier API...</div>
                    ) : activeTracking?.success ? (
                      <div className="space-y-6">
                        
                        {/* Summary Header */}
                        <div className="flex justify-between items-center border-b border-brand-navy/10 pb-3 mb-4">
                          <div>
                            <span className="text-sm text-brand-navy/40 uppercase block">Courier Partner</span>
                            <span className="font-bold text-xs text-brand-navy">{activeTracking.partner}</span>
                          </div>
                          <div>
                            <span className="text-sm text-brand-navy/40 uppercase block">Current Status</span>
                            <span className="px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-850 rounded font-bold uppercase tracking-wider text-xs">
                              {activeTracking.currentStatus.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-brand-navy/40 uppercase block">Est Delivery</span>
                            <span className="font-bold text-xs text-brand-navy/80">
                              {activeTracking.estimatedDelivery 
                                ? new Date(activeTracking.estimatedDelivery * 1000).toLocaleDateString()
                                : 'Calculating...'}
                            </span>
                          </div>
                        </div>

                        {/* Event list */}
                        <div className="relative border-l-2 border-brand-navy/10 pl-4 ml-2 space-y-6">
                          {activeTracking.events?.map((ev, i) => (
                            <div key={i} className="relative">
                              {/* Timeline dot */}
                              <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-brand-gold border-2 border-slate-950"></div>
                              
                              <div className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                  <span className="font-bold text-xs text-brand-navy uppercase">{ev.status.replace('_', ' ')}</span>
                                  <span className="text-[13px] text-brand-navy/40">{new Date(ev.timestamp * 1000).toLocaleString()}</span>
                                </div>
                                <p className="text-[13px] text-brand-navy/50">Location: <span className="text-brand-navy/80 font-semibold">{ev.location}</span></p>
                                <p className="text-xs text-brand-navy/60">{ev.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                      </div>
                    ) : (
                      <div className="text-center text-xs text-brand-navy/40 py-12">
                        Select a shipment to track. Mock courier events will fetch on-demand.
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {activeTab === 'study-abroad' && (
              <StudyAbroadTabPanel 
                clientId={clientId} 
                sessionToken={sessionToken} 
                showToast={showToast} 
              />
            )}

            {activeTab === 'visa' && (
              <VisaTabPanel 
                clientId={clientId} 
                sessionToken={sessionToken} 
                showToast={showToast} 
              />
            )}

            {activeTab === 'attestation' && (
              <AttestationTabPanel 
                clientId={clientId} 
                sessionToken={sessionToken} 
                showToast={showToast} 
              />
            )}

            {activeTab === 'manpower' && (
              <ManpowerTabPanel 
                clientId={clientId} 
                sessionToken={sessionToken} 
                showToast={showToast} 
              />
            )}

              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Communication logs & WhatsApp Console */}
          <section className="w-96 border-l border-brand-navy/[0.08] bg-brand-navy/[0.02] flex flex-col justify-between shrink-0 overflow-hidden">
            
            {/* Timeline Filter Header */}
            <div className="p-4 border-b border-brand-navy/[0.08] flex items-center justify-between bg-brand-navy/[0.02]">
              <h3 className="font-display font-bold text-xs text-brand-gold uppercase tracking-wider">Communication Logs</h3>
              <div className="flex gap-1 text-[13px]">
                {(['all', 'whatsapp', 'email', 'system'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setTimelineFilter(tab)}
                    className={`px-2 py-1 rounded transition duration-200 text-xs font-bold ${
                      timelineFilter === tab 
                        ? 'bg-brand-gold text-brand-navy' 
                        : 'hover:bg-brand-navy/[0.05] text-brand-navy/50'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Events Flow */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {client.timeline
                ?.filter((item) => timelineFilter === 'all' || item.channel === timelineFilter)
                .map((item) => {
                  const isWhatsApp = item.channel === 'whatsapp';
                  const isEmail = item.channel === 'email';

                  return (
                    <div key={item.id} className="flex gap-2 text-xs text-brand-navy/50 flex-row">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border select-none ${
                        isWhatsApp 
                          ? 'bg-emerald-600 text-white border-emerald-700' 
                          : isEmail 
                            ? 'bg-sky-600 text-brand-navy border-sky-700' 
                            : 'bg-brand-navy/[0.08] text-brand-navy/60 border-brand-navy/15'
                      }`}>
                        {isWhatsApp ? 'WA' : isEmail ? 'EM' : ''}
                      </div>
                      
                      <div className={`p-3 rounded-lg border flex-1 ${
                        isWhatsApp 
                          ? 'bg-emerald-50 border-emerald-200/60' 
                          : isEmail 
                            ? 'bg-sky-950/20 border-sky-900/60' 
                            : 'bg-brand-navy/[0.06] border-brand-navy/10'
                      }`}>
                        <p className="font-bold text-brand-navy/80">{item.sender || 'System Operator'}</p>
                        {item.subject && (
                          <p className="text-[13px] mt-0.5 text-brand-gold font-semibold">Subj: {item.subject}</p>
                        )}
                        <p className="text-sm mt-1 text-brand-navy/60 whitespace-pre-wrap">{item.body || item.message}</p>
                        <span className="text-xs text-brand-navy/40 block mt-2">
                          {new Date(item.createdAt * 1000).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {(!client.timeline || client.timeline.length === 0) && (
                <div className="p-8 text-center text-xs text-brand-navy/40 border border-dashed border-brand-navy/10 rounded-lg">
                  No Communications Recorded
                </div>
              )}
            </div>

            {/* Timeline Editor Console */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-brand-navy/[0.08] bg-brand-navy/[0.02] flex flex-col gap-3">
              
              {/* Channels Tabs */}
              <div className="flex gap-1 border-b border-brand-navy/10 pb-2">
                {[
                  { id: 'whatsapp', label: 'WhatsApp' },
                  { id: 'email', label: 'Email' },
                  { id: 'note', label: 'Internal Note' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditorTab(tab.id as any)}
                    className={`px-2.5 py-1 rounded text-[13px] font-bold transition duration-200 ${
                      editorTab === tab.id 
                        ? 'bg-brand-gold text-brand-navy' 
                        : 'text-brand-navy/50 hover:bg-brand-navy/[0.05] hover:text-brand-navy'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Subject if email */}
              {editorTab === 'email' && (
                <div>
                  <label className="text-xs text-brand-navy/50 font-bold uppercase block mb-1">Subject</label>
                  <input 
                    type="text" 
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    placeholder="Enter email subject..."
                    className="w-full text-xs p-2 border border-brand-navy/10 bg-brand-navy/[0.06] text-brand-navy rounded focus:ring-1 focus:ring-brand-gold"
                  />
                </div>
              )}

              {/* Quick templates */}
              <div className="flex justify-between items-center">
                <label className="text-xs text-brand-navy/50 font-bold uppercase">Quick Templates</label>
                <select 
                  onChange={handleTemplateChange}
                  className="text-[13px] border border-brand-navy/10 rounded px-2 py-1 bg-brand-navy/[0.06] text-brand-navy focus:ring-1 focus:ring-brand-gold"
                >
                  <option value="custom">-- Custom --</option>
                  <option value="welcome">Welcome Onboarding</option>
                  <option value="docRequest">Request Missing Docs</option>
                  <option value="paymentAlert">Payment Reminder</option>
                </select>
              </div>

              {/* Textarea */}
              <textarea 
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Type ${editorTab} message body...`}
                rows={3} 
                className="w-full text-xs p-2.5 border border-brand-navy/10 bg-brand-navy/[0.06] text-brand-navy rounded focus:ring-1 focus:ring-brand-gold resize-none"
              />

              {/* Submit message */}
              <div className="flex justify-between items-center">
                <span className="text-xs text-emerald-700 flex items-center gap-1 font-semibold">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                  Dynamic consent check: Active
                </span>
                <button 
                  type="submit" 
                  disabled={sendMessageMutation.isPending}
                  className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  <span>Send Message</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                </button>
              </div>

            </form>

          </section>

        </div>

      </main>

      {/* ==========================================
          ESIGN CAPTURE MODAL
          ========================================== */}
      {isSignModalOpen && selectedAgreement && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="border border-brand-navy/10 bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col justify-between overflow-hidden">
            
            <div className="p-6 border-b border-brand-navy/10">
              <h3 className="text-sm font-bold text-brand-gold uppercase tracking-wider">Execute Digital eSign Capture</h3>
              <p className="text-xs text-brand-navy/50 mt-1">Aadhaar/OTP Consent Verification (DPDP compliance audit trail)</p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              
              <div className="bg-brand-navy/[0.04] p-4 border border-brand-navy/10 rounded font-mono text-[13px] text-brand-navy/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {selectedAgreement.content}
              </div>

              <div>
                <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">eSign Verification Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 bg-brand-navy/[0.06] border border-brand-navy/10 p-3 rounded-lg cursor-pointer text-xs">
                    <input 
                      type="radio" 
                      name="esign-method"
                      checked={esignMethod === 'aadhaar'}
                      onChange={() => setEsignMethod('aadhaar')}
                      className="text-brand-gold focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-brand-navy block">Aadhaar eSign</span>
                      <span className="text-[13px] text-brand-navy/50">UIDAI verified</span>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-2 bg-brand-navy/[0.06] border border-brand-navy/10 p-3 rounded-lg cursor-pointer text-xs">
                    <input 
                      type="radio" 
                      name="esign-method"
                      checked={esignMethod === 'otp'}
                      onChange={() => setEsignMethod('otp')}
                      className="text-brand-gold focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-brand-navy block">OTP Signature</span>
                      <span className="text-[13px] text-brand-navy/50">Mobile OTP verified</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-brand-navy/[0.06] border border-brand-navy/10 p-3 rounded-lg">
                <input 
                  type="checkbox" 
                  id="consent-declaration"
                  checked={esignChecked}
                  onChange={(e) => setEsignChecked(e.target.checked)}
                  className="rounded border-brand-navy/10 bg-brand-navy/[0.05] text-brand-gold focus:ring-0 w-4 h-4 mt-0.5"
                />
                <label htmlFor="consent-declaration" className="text-[13px] text-brand-navy/60 font-medium cursor-pointer leading-relaxed">
                  I hereby declare my explicit consent to electronically sign this Service Agreement under the regulations of DPDP Act 2023. I verify that all details mapped here are accurate, and I agree to bind the legal terms of this transaction.
                </label>
              </div>

            </div>

            <div className="p-6 bg-brand-navy/[0.04] border-t border-brand-navy/[0.08] flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsSignModalOpen(false);
                  setEsignChecked(false);
                }}
                className="bg-brand-navy/[0.06] hover:bg-brand-navy/[0.08] border border-brand-navy/10 text-brand-navy/60 px-4 py-2 rounded text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteESign}
                disabled={signAgreementMutation.isPending || !esignChecked}
                className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-5 py-2 rounded text-xs font-bold transition disabled:opacity-50 shadow"
              >
                {signAgreementMutation.isPending ? 'Executing Signature...' : 'Execute Digital Signature'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navy border-l-4 border-brand-gold text-brand-navy text-xs px-4 py-3.5 rounded-lg shadow-2xl transition duration-300 z-50 flex items-center gap-2 border border-brand-navy/10 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        <span className="font-bold text-brand-gold">CLIENT 360:</span>
        <span className="text-brand-navy/80">{toast.msg}</span>
      </div>

    </div>
  );
}

function StudyAbroadTabPanel({ clientId, sessionToken, showToast }: { clientId: string; sessionToken: string; showToast: (msg: string) => void }) {
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShortlistAndMatches = async () => {
    setLoading(true);
    try {
      const sRes = await fetch(`${API}/api/study-abroad/shortlist?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const sData = await sRes.json() as any;
      if (sData.success) setShortlist(sData.shortlist);

      const mRes = await fetch(`${API}/api/study-abroad/universities/match?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const mData = await mRes.json() as any;
      if (mData.success) setMatches(mData.matches);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShortlistAndMatches();
  }, [clientId]);

  const handleShortlist = async (universityId: string) => {
    try {
      const res = await fetch(`${API}/api/study-abroad/shortlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ clientId, universityId })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('University shortlisted successfully.');
      fetchShortlistAndMatches();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleStatusChange = async (entryId: string, status: string) => {
    try {
      const res = await fetch(`${API}/api/study-abroad/shortlist/${entryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(`Status updated to ${status}.`);
      fetchShortlistAndMatches();
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-xs text-brand-navy/40 py-12">Analyzing credentials and querying database...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-brand-navy mb-4">Counselor Shortlist Applications</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 text-brand-navy/50 font-bold uppercase text-[13px]">
                <th className="py-2.5">University</th>
                <th className="py-2.5">Country</th>
                <th className="py-2.5">Intake</th>
                <th className="py-2.5">Application Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shortlist.map((item) => (
                <tr key={item.id} className="border-b border-brand-navy/[0.08] hover:bg-brand-navy/[0.04] transition">
                  <td className="py-3 font-semibold text-brand-navy">{item.universityName}</td>
                  <td className="py-3 text-brand-navy/40">{item.country}</td>
                  <td className="py-3 text-brand-navy/40 font-mono">{item.intake}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      item.status === 'admitted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : item.status === 'rejected' ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : item.status === 'applied' ? 'bg-sky-50 text-sky-600 border border-sky-200'
                      : 'bg-brand-navy/[0.05] text-brand-navy/50 border border-brand-navy/10'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className="rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1 text-[13px] font-bold uppercase text-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold cursor-pointer"
                    >
                      <option value="pending">Pending</option>
                      <option value="applied">Applied</option>
                      <option value="admitted">Admitted</option>
                      <option value="rejected">Rejected</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
              {shortlist.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-brand-navy/50">
                    No shortlisted universities for this student yet. Use the matching desk below to select universities.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-brand-navy mb-1">Eligible University Matches</h3>
        <p className="text-xs text-brand-navy/50 mb-4">Matches based on candidate highest qualification, GPA, and test scores recorded in lead profile.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((uni) => {
            const isAdded = shortlist.some(s => s.universityId === uni.id);
            return (
              <div key={uni.id} className="bg-brand-navy/[0.04] rounded-lg p-4 border border-brand-navy/10 flex flex-col justify-between gap-3 hover:shadow-md transition">
                <div>
                  <span className="text-xs uppercase font-bold text-brand-gold tracking-widest">{uni.country}</span>
                  <h4 className="font-bold text-xs text-brand-navy mt-1">{uni.name}</h4>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-[13px] text-brand-navy/40 font-mono">
                    <div>
                      <span className="block text-sm text-brand-navy/50 uppercase">Min GPA</span>
                      <span>{uni.minGpa}</span>
                    </div>
                    <div>
                      <span className="block text-sm text-brand-navy/50 uppercase">Min IELTS</span>
                      <span>{uni.ieltsMin}</span>
                    </div>
                    <div>
                      <span className="block text-sm text-brand-navy/50 uppercase">Min Budget</span>
                      <span>{uni.budgetLpaMin} LPA</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleShortlist(uni.id)}
                  disabled={isAdded}
                  className={`cursor-pointer w-full text-center py-2 rounded-lg text-[13px] font-bold uppercase tracking-wider transition ${
                    isAdded 
                      ? 'bg-brand-navy/[0.05] text-brand-navy/40 cursor-not-allowed'
                      : 'bg-brand-gold text-brand-navy hover:bg-brand-gold/90'
                  }`}
                >
                  {isAdded ? 'Shortlisted' : 'Add to Shortlist'}
                </button>
              </div>
            );
          })}
          {matches.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-brand-navy/40 bg-brand-navy/[0.04] rounded border border-dashed border-brand-navy/10">
              No matching universities found for the candidate's qualification criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VisaTabPanel({ clientId, sessionToken, showToast }: { clientId: string; sessionToken: string; showToast: (msg: string) => void }) {
  const [applications, setApplications] = useState<any[]>([]);
  const [mockInterviews, setMockInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states - application
  const [country, setCountry] = useState('');
  const [visaType, setVisaType] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentLocation, setAppointmentLocation] = useState('');
  const [notes, setNotes] = useState('');

  // Form states - mock interview
  const [mockTime, setMockTime] = useState('');
  
  // Feedback popup state
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [mockScore, setMockScore] = useState<number>(8);
  const [mockFeedback, setMockFeedback] = useState<string>('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const aRes = await fetch(`${API}/api/visa/applications?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const aData = await aRes.json() as any;
      if (aData.success) setApplications(aData.applications);

      const mRes = await fetch(`${API}/api/visa/mock-interviews?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const mData = await mRes.json() as any;
      if (mData.success) setMockInterviews(mData.interviews);
    } catch (err: any) {
      showToast(`Error fetching Visa info: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const handleAddApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const epochDate = appointmentDate ? Math.floor(new Date(appointmentDate).getTime() / 1000) : null;
      const res = await fetch(`${API}/api/visa/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({
          clientId,
          country,
          visaType,
          appointmentDate: epochDate,
          appointmentLocation: appointmentLocation || null,
          notes: notes || null
        })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Visa application added.');
      setCountry('');
      setVisaType('');
      setAppointmentDate('');
      setAppointmentLocation('');
      setNotes('');
      fetchData();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleStatusChange = async (entryId: string, status: string) => {
    try {
      const res = await fetch(`${API}/api/visa/applications/${entryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(`Visa status changed to ${status}.`);
      fetchData();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleScheduleMock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mockTime) return alert('Select date/time.');
    try {
      const scheduledEpoch = Math.floor(new Date(mockTime).getTime() / 1000);
      const res = await fetch(`${API}/api/visa/mock-interviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ clientId, scheduledAt: scheduledEpoch })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Visa mock interview scheduled.');
      setMockTime('');
      fetchData();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackId) return;
    try {
      const res = await fetch(`${API}/api/visa/mock-interviews/${feedbackId}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ score: mockScore, feedback: mockFeedback })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Mock interview results logged.');
      setFeedbackId(null);
      setMockFeedback('');
      fetchData();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-xs text-brand-navy/40 py-12">Loading Visa Application details...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-brand-navy mb-4">Visa Progress & Documents checklist</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 text-brand-navy/50 font-bold uppercase text-[13px]">
                <th className="py-2.5">Country</th>
                <th className="py-2.5">Visa Type</th>
                <th className="py-2.5">Appointment</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-brand-navy/[0.08] hover:bg-brand-navy/[0.04] transition">
                  <td className="py-3 font-semibold text-brand-navy">{app.country}</td>
                  <td className="py-3 text-brand-navy/40">{app.visaType}</td>
                  <td className="py-3 text-brand-navy/40 font-mono">
                    {app.appointmentDate 
                      ? `${new Date(app.appointmentDate * 1000).toLocaleDateString()} @ ${app.appointmentLocation || 'VFS'}`
                      : 'Not Scheduled'}
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      app.status === 'granted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : app.status === 'rejected' ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : app.status === 'slot_booked' ? 'bg-sky-50 text-sky-600 border border-sky-200'
                      : 'bg-brand-navy/[0.05] text-brand-navy/50 border border-brand-navy/10'
                    }`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusChange(app.id, e.target.value)}
                      className="rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1 text-[13px] font-bold uppercase text-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold cursor-pointer"
                    >
                      <option value="document_prep">Document Prep</option>
                      <option value="slot_booked">Slot Booked</option>
                      <option value="submitted">Submitted</option>
                      <option value="granted">Granted</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-brand-navy/50">
                    No active visa applications log. Create one below to track.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm space-y-4">
          <h3 className="font-display font-bold text-sm text-brand-navy">Create Visa Tracker</h3>
          <form onSubmit={handleAddApplication} className="space-y-3">
            <div>
              <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Target Country</label>
              <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United Kingdom" required className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold focus:bg-brand-navy/[0.06]" />
            </div>
            <div>
              <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Visa Type / Class</label>
              <input type="text" value={visaType} onChange={(e) => setVisaType(e.target.value)} placeholder="e.g. Student Tier 4" required className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold focus:bg-brand-navy/[0.06]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">VFS / consulate Date</label>
                <input type="datetime-local" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold focus:bg-brand-navy/[0.06]" />
              </div>
              <div>
                <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Location</label>
                <input type="text" value={appointmentLocation} onChange={(e) => setAppointmentLocation(e.target.value)} placeholder="e.g. Hyderabad" className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:ring-1 focus:ring-brand-gold focus:bg-brand-navy/[0.06]" />
              </div>
            </div>
            <button type="submit" className="w-full bg-brand-navy text-brand-navy text-xs font-bold uppercase py-2.5 rounded-lg hover:bg-brand-navy/90 transition shadow">
              Initiate Visa Record
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm space-y-4">
          <h3 className="font-display font-bold text-sm text-brand-navy">Visa Mock Prep Desk</h3>
          <div className="space-y-3">
            {mockInterviews.map((m) => (
              <div key={m.id} className="bg-brand-navy/[0.04] border border-brand-navy/[0.08] rounded p-3 flex justify-between items-center text-xs">
                <div>
                  <span className="text-xs uppercase font-bold text-brand-gold block">
                    {new Date(m.scheduledAt * 1000).toLocaleString()}
                  </span>
                  <span className="font-medium text-brand-navy">Mock Prep Session</span>
                  {m.score !== null && (
                    <div className="mt-1 text-[13px] text-brand-navy/40 font-medium">
                      Score: <span className="font-bold text-brand-gold">{m.score}/10</span> - "{m.feedback}"
                    </div>
                  )}
                </div>
                <div>
                  {m.status === 'scheduled' ? (
                    <button
                      onClick={() => setFeedbackId(m.id)}
                      className="cursor-pointer bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold text-[13px] uppercase tracking-wider px-2.5 py-1.5 rounded transition shadow-sm"
                    >
                      Complete & Rate
                    </button>
                  ) : (
                    <span className="text-xs uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      Completed
                    </span>
                  )}
                </div>
              </div>
            ))}

            <form onSubmit={handleScheduleMock} className="pt-2 border-t border-brand-navy/10 flex gap-2">
              <input type="datetime-local" value={mockTime} onChange={(e) => setMockTime(e.target.value)} required className="flex-1 text-xs p-2 rounded bg-white border border-brand-navy/10 text-brand-navy focus:bg-brand-navy/[0.08]" />
              <button type="submit" className="bg-brand-navy text-brand-navy text-[13px] font-bold uppercase tracking-wider px-3 rounded hover:bg-brand-navy/90 transition shadow">
                Schedule Mock
              </button>
            </form>
          </div>
        </div>
      </div>

      {feedbackId && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-brand-navy/10 shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-3">
              <h3 className="font-display font-extrabold text-sm text-brand-navy uppercase tracking-wider">Visa Mock Evaluation Feedback</h3>
              <button onClick={() => setFeedbackId(null)} className="text-brand-navy/50 hover:text-brand-navy/40 text-sm font-bold">✕</button>
            </div>
            <form onSubmit={handleSubmitEvaluation} className="space-y-4">
              <div>
                <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Session score rating (1 - 10)</label>
                <input type="number" min="1" max="10" value={mockScore} onChange={(e) => setMockScore(parseInt(e.target.value) || 8)} required className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy" />
              </div>
              <div>
                <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Counselor assessment notes</label>
                <textarea rows={3} value={mockFeedback} onChange={(e) => setMockFeedback(e.target.value)} placeholder="Provide detailing on mock queries response..." required className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFeedbackId(null)} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy/70 px-4 py-2 rounded-lg text-xs font-bold">
                  Cancel
                </button>
                <button type="submit" className="bg-brand-navy text-brand-navy px-5 py-2 rounded-lg text-xs font-bold hover:bg-brand-navy/90 shadow">
                  Log evaluation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AttestationTabPanel({ clientId, sessionToken, showToast }: { clientId: string; sessionToken: string; showToast: (msg: string) => void }) {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [documentType, setDocumentType] = useState<'degree' | 'diploma' | 'birth_certificate' | 'marriage_certificate' | 'pcc'>('degree');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [notes, setNotes] = useState('');

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/attestation/applications?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const data = await res.json() as any;
      if (data.success) setApplications(data.applications);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [clientId]);

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/attestation/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ clientId, documentType, destinationCountry, notes })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Document legalization workflow initiated.');
      setDestinationCountry('');
      setNotes('');
      fetchApplications();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleUpdate = async (id: string, updates: { currentStep?: string; status?: string }) => {
    try {
      const res = await fetch(`${API}/api/attestation/applications/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Legalization status updated.');
      fetchApplications();
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-xs text-brand-navy/40 py-12">Checking verification records...</div>;
  }

  // Stepper helper
  const steps = [
    { key: 'hrd', label: 'HRD verification' },
    { key: 'mea', label: 'MEA Attestation' },
    { key: 'embassy', label: 'Embassy Legalization' },
    { key: 'apostille', label: 'Apostille Stamping' }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-brand-navy mb-4">Attestation & Document Legalization Progress</h3>
        
        <div className="space-y-6">
          {applications.map((app) => {
            const currentStepIndex = steps.findIndex(s => s.key === app.currentStep);
            
            return (
              <div key={app.id} className="border border-brand-navy/10 rounded-xl bg-white p-5 space-y-4 backdrop-blur-sm">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-bold text-brand-gold uppercase tracking-wider bg-brand-navy/5 px-2 py-0.5 rounded">
                      {app.documentType.replace('_', ' ')}
                    </span>
                    <h4 className="font-bold text-xs text-brand-navy mt-1">
                      Legalization targeting <span className="text-brand-gold font-extrabold">{app.destinationCountry}</span>
                    </h4>
                  </div>
                  
                  <div className="flex gap-2">
                    <select
                      value={app.currentStep}
                      onChange={(e) => handleUpdate(app.id, { currentStep: e.target.value })}
                      className="rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1 text-[13px] font-bold uppercase text-brand-gold focus:outline-none"
                    >
                      {steps.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>

                    <select
                      value={app.status}
                      onChange={(e) => handleUpdate(app.id, { status: e.target.value })}
                      className="rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1 text-[13px] font-bold uppercase text-brand-gold focus:outline-none"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_transit">In Transit</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {steps.map((step, idx) => {
                    const isCompleted = idx < currentStepIndex || app.status === 'completed';
                    const isActive = idx === currentStepIndex && app.status !== 'completed';
                    
                    return (
                      <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center flex-1 relative">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition ${
                            isCompleted ? 'bg-emerald-600 text-white border-emerald-700 font-extrabold'
                            : isActive ? 'bg-brand-gold text-brand-navy border-brand-gold font-extrabold shadow-md animate-pulse'
                            : 'bg-brand-navy/[0.05] text-brand-navy/50 border-brand-navy/10'
                          }`}>
                            {idx + 1}
                          </div>
                          <span className={`text-sm font-bold uppercase mt-1 tracking-wider text-center ${
                            isCompleted ? 'text-emerald-600'
                            : isActive ? 'text-brand-gold font-extrabold'
                            : 'text-brand-navy/50'
                          }`}>
                            {step.label.split(' ')[0]}
                          </span>
                        </div>
                        {idx < steps.length - 1 && (
                          <div className={`flex-1 h-0.5 border-t-2 transition ${
                            idx < currentStepIndex ? 'border-emerald-650' : 'border-brand-navy/10'
                          }`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {app.notes && (
                  <p className="text-[13px] text-brand-navy/40 bg-brand-navy/[0.05] p-2.5 rounded border border-brand-navy/[0.08] font-mono">
                    Notes: {app.notes}
                  </p>
                )}
              </div>
            );
          })}

          {applications.length === 0 && (
            <div className="py-8 text-center text-xs text-brand-navy/50 bg-brand-navy/[0.04] rounded border border-dashed border-brand-navy/10">
              No document legalization requests logged. Initiate below.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm space-y-4 max-w-xl">
        <h3 className="font-display font-bold text-sm text-brand-navy">Initiate Legalization Request</h3>
        <form onSubmit={handleInitiate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Document Category</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:bg-brand-navy/[0.08]"
              >
                <option value="degree">Degree Certificate</option>
                <option value="diploma">Diploma</option>
                <option value="birth_certificate">Birth Certificate</option>
                <option value="marriage_certificate">Marriage Certificate</option>
                <option value="pcc">Police Clearance (PCC)</option>
              </select>
            </div>
            <div>
              <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Target Country</label>
              <input 
                type="text" 
                value={destinationCountry} 
                onChange={(e) => setDestinationCountry(e.target.value)} 
                placeholder="e.g. UAE, Qatar, Saudi Arabia" 
                required 
                className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:bg-brand-navy/[0.08]" 
              />
            </div>
          </div>
          <div>
            <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Details & Remarks</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter special instructions or candidate details..."
              className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:bg-brand-navy/[0.08]"
            />
          </div>
          <button type="submit" className="w-full bg-brand-navy text-brand-navy text-xs font-bold uppercase py-2.5 rounded-lg hover:bg-brand-navy/90 transition shadow">
            Create Legalization Request
          </button>
        </form>
      </div>
    </div>
  );
}

function ManpowerTabPanel({ clientId, sessionToken, showToast }: { clientId: string; sessionToken: string; showToast: (msg: string) => void }) {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const dRes = await fetch(`${API}/api/manpower/deployments?clientId=${encodeURIComponent(clientId)}`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const dData = await dRes.json() as any;
      if (dData.success) setDeployments(dData.deployments);

      const jRes = await fetch(`${API}/api/manpower/jobs`, {
        headers: { 'Cookie': `better-auth.session_token=${sessionToken}` }
      });
      const jData = await jRes.json() as any;
      if (jData.success) setJobs(jData.jobs);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const handleAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId) return;
    try {
      const res = await fetch(`${API}/api/manpower/deployments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify({ clientId, jobId: selectedJobId })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Candidate associated with job posting successfully.');
      setSelectedJobId('');
      fetchData();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleUpdate = async (id: string, field: string, value: string) => {
    try {
      const body: any = {};
      if (field === 'selection') body.selectionStatus = value;
      if (field === 'medical') body.medicalStatus = value;
      if (field === 'visa') body.visaStatus = value;
      if (field === 'flight') body.flightStatus = value;

      const res = await fetch(`${API}/api/manpower/deployments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${sessionToken}`
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(`Status updated successfully.`);
      fetchData();
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-xs text-brand-navy/40 py-12">Loading Candidate Deployments...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-brand-navy mb-4">Overseas Job Deployments Pipeline</h3>
        
        <div className="space-y-6">
          {deployments.map((dep) => (
            <div key={dep.id} className="border border-brand-navy/10 rounded-xl bg-white p-5 space-y-4 backdrop-blur-sm">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-brand-gold uppercase tracking-wider bg-brand-navy/5 px-2 py-0.5 rounded">
                    Deployment Pipeline
                  </span>
                  <h4 className="font-bold text-xs text-brand-navy mt-1">
                    {dep.jobTitle} <span className="text-brand-navy/50 font-normal">in</span> {dep.jobCountry}
                  </h4>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-brand-navy/[0.08] backdrop-blur-sm">
                <div className="space-y-1">
                  <label className="text-sm text-brand-navy/50 font-bold uppercase tracking-wider block">1. Sourcing Selection</label>
                  <select
                    value={dep.selectionStatus}
                    onChange={(e) => handleUpdate(dep.id, 'selection', e.target.value)}
                    className="w-full rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1.5 text-[13px] font-bold uppercase text-brand-gold"
                  >
                    <option value="applied">Applied</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="selected">Selected</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-brand-navy/50 font-bold uppercase tracking-wider block">2. Medical Fitness</label>
                  <select
                    value={dep.medicalStatus}
                    onChange={(e) => handleUpdate(dep.id, 'medical', e.target.value)}
                    className="w-full rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1.5 text-[13px] font-bold uppercase text-brand-gold"
                  >
                    <option value="pending">Pending</option>
                    <option value="fit">Fit</option>
                    <option value="unfit">Unfit</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-brand-navy/50 font-bold uppercase tracking-wider block">3. Visa Endorsement</label>
                  <select
                    value={dep.visaStatus}
                    onChange={(e) => handleUpdate(dep.id, 'visa', e.target.value)}
                    className="w-full rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1.5 text-[13px] font-bold uppercase text-brand-gold"
                  >
                    <option value="pending">Pending</option>
                    <option value="submitted">Submitted</option>
                    <option value="stamped">Stamped</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-brand-navy/50 font-bold uppercase tracking-wider block">4. Travel Flight</label>
                  <select
                    value={dep.flightStatus}
                    onChange={(e) => handleUpdate(dep.id, 'flight', e.target.value)}
                    className="w-full rounded border border-brand-navy/15 bg-brand-navy/[0.05] px-2 py-1.5 text-[13px] font-bold uppercase text-brand-gold"
                  >
                    <option value="pending">Pending</option>
                    <option value="booked">Booked</option>
                    <option value="deployed">Deployed</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          {deployments.length === 0 && (
            <div className="py-8 text-center text-xs text-brand-navy/50 bg-brand-navy/[0.04] rounded border border-dashed border-brand-navy/10">
              Candidate is not currently associated with any job openings.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-brand-navy/10 shadow-md backdrop-blur-sm space-y-4 max-w-xl">
        <h3 className="font-display font-bold text-sm text-brand-navy">Associate with Job Opening</h3>
        <form onSubmit={handleAssociate} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[13px] text-brand-navy/50 font-bold uppercase tracking-wider block mb-1">Select Job Posting</label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10 text-brand-navy focus:bg-brand-navy/[0.08]"
            >
              <option value="">-- Choose Job --</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title} ({j.country})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-brand-navy text-brand-navy text-xs font-bold uppercase py-2.5 px-6 rounded-lg hover:bg-brand-navy/90 transition shadow">
            Associate Candidate
          </button>
        </form>
      </div>
    </div>
  );
}
