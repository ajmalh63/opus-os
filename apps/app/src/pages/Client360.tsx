import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';

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

  // Mock Session Token toggle for testing Segregation of Duties (SoD)
  // Default to token-manager to ensure all operations succeed, but allow switching to counselor
  const [sessionToken, setSessionToken] = useState<string>('token-manager');

  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<'vault' | 'agreements' | 'payments' | 'umrah' | 'courier'>('vault');

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
      const res = await fetch(`/api/clients/${clientId}`, {
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
      const res = await fetch('/api/agreements/templates', {
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
      const res = await fetch('/api/agreements', {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch agreements');
      return res.json();
    }
  });
  const clientAgreements = agreementsData?.agreements?.filter(a => a.clientId === clientId) || [];

  // D. Fetch Milestones List
  const { data: milestonesData, refetch: refetchMilestones } = useQuery<{ milestones: Milestone[] }>({
    queryKey: ['milestones', sessionToken],
    queryFn: async () => {
      const res = await fetch('/api/payments/milestones', {
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
      const res = await fetch(`/api/payments/client/${clientId}`, {
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
      const res = await fetch('/api/umrah/departures', {
        headers: {
          'Cookie': `better-auth.session_token=${sessionToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch group departures');
      return res.json();
    }
  });

  // G. Fetch shipments loaded via localStorage IDs
  const { data: shipments = [], refetch: refetchShipments } = useQuery<TransitShipment[]>({
    queryKey: ['shipments', clientId, shipmentIds, sessionToken],
    queryFn: async () => {
      const list = [];
      for (const id of shipmentIds) {
        try {
          const res = await fetch(`/api/transit/shipments/${id}`, {
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
      const res = await fetch(`/api/transit/shipments/${selectedShipmentId}/track`, {
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
      const res = await fetch('/api/kanban/board/move', {
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
        showToast(`⚠️ Advanced with WIP Limit warning: Column reached capacity limit of ${data.limit}.`);
      } else {
        showToast('Application stage advanced successfully.');
      }
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Advance failed'}`);
    },
  });

  // Send communication log
  const sendMessageMutation = useMutation({
    mutationFn: async (payload: { sender: string; channel: string; subject?: string; message: string }) => {
      // Simulate backend log insertion mapping to communication logs
      return { success: true, log: payload };
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
      const res = await fetch('/api/agreements', {
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
      const res = await fetch(`/api/agreements/${id}/sign`, {
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
      const res = await fetch('/api/payments', {
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
      const res = await fetch('/api/payments/milestones/evaluate-escalations', {
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
      const res = await fetch(`/api/umrah/departures/${departureId}/book`, {
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
    },
    onError: (err: any) => {
      showToast(`Umrah Booking Error: ${err.message}`);
    }
  });

  // Register Attestation Courier shipment
  const registerShipmentMutation = useMutation({
    mutationFn: async (payload: { courierPartner: 'blue-dart' | 'dtdc'; trackingNumber: string; shippingAddress: string }) => {
      const res = await fetch('/api/transit/shipments', {
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      showToast('Message text cannot be empty.');
      return;
    }

    sendMessageMutation.mutate({
      sender: sessionToken === 'token-manager' ? 'Manager Staff' : 'Santhosh Kumar',
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
      const presignedRes = await fetch(`/api/clients/${clientId}/documents/presigned?filename=${encodeURIComponent(file.name)}`, {
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

  return (
    <div className="bg-brand-navy text-slate-100 font-sans min-h-screen flex w-screen overflow-hidden">
      
      {/* LEFT SIDEBAR (Dark themed, brand colors) */}
      <aside className="w-64 bg-slate-950 text-white flex flex-col justify-between shrink-0 shadow-2xl z-20 border-r border-slate-900">
        <div>
          {/* Brand Logo */}
          <div className="p-6 border-b border-slate-900 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-brand-gold flex items-center justify-center font-display font-bold text-brand-navy">O</div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight tracking-wider text-brand-gold">OpusOS</h1>
              <p className="text-[10px] text-brand-gold/70 tracking-widest uppercase">Business Engine</p>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="p-4 space-y-2">
            <Link href="/kanban" className="flex items-center gap-3 px-4 py-3 rounded text-sm text-slate-300 hover:text-white hover:bg-brand-navyLight transition duration-200">
              <svg className="w-5 h-5 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"></path></svg>
              <span>Kanban Board</span>
            </Link>
            <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded text-sm text-slate-300 hover:text-white hover:bg-brand-navyLight transition duration-200">
              <svg className="w-5 h-5 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <span>Public Lead Form</span>
            </Link>
          </nav>
        </div>

        {/* Dynamic Mock Cookie Role Toggle (Dx/Testing help) */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/60">
          <label className="text-[10px] text-brand-gold uppercase tracking-wider block mb-2 font-bold">🧪 Simulate Role Session</label>
          <div className="grid grid-cols-2 gap-1">
            <button 
              onClick={() => setSessionToken('token-manager')}
              className={`px-2 py-1 rounded text-[10px] font-bold border transition ${
                sessionToken === 'token-manager' 
                  ? 'bg-brand-gold text-brand-navy border-brand-gold' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              Manager
            </button>
            <button 
              onClick={() => setSessionToken('token-counselor')}
              className={`px-2 py-1 rounded text-[10px] font-bold border transition ${
                sessionToken === 'token-counselor' 
                  ? 'bg-brand-gold text-brand-navy border-brand-gold' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              Counselor
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-2 leading-tight">
            * Counselor triggers SoD payment block (403). Manager permits writes.
          </p>
        </div>

        {/* Active Profile Footer */}
        <div className="p-4 border-t border-slate-900 flex items-center gap-3 bg-brand-navyLight/20">
          <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center border border-brand-gold text-brand-gold font-semibold">SK</div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold truncate text-white">Santhosh Kumar</p>
            <p className="text-[10px] text-brand-gold uppercase tracking-wider">Senior Counselor</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-16 bg-brand-navyLight border-b border-slate-900 shadow-xl flex items-center justify-between px-8 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-display font-semibold text-lg text-white">
              Client Profile: <span className="text-brand-gold">{client.name}</span>
            </h2>
            <span className="px-3 py-1 bg-brand-navy text-brand-gold border border-brand-gold/30 text-[10px] uppercase font-bold tracking-widest rounded-full">
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
                      isCompleted ? 'text-brand-success font-medium' : isActive ? 'text-brand-gold font-semibold' : 'text-slate-500'
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold border ${
                        isCompleted 
                          ? 'bg-brand-success/15 border-brand-success text-brand-success' 
                          : isActive 
                            ? 'bg-brand-gold/15 border-brand-gold text-brand-gold' 
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}>
                        {isCompleted ? '✓' : step.seq}
                      </span>
                      <span>{step.label}</span>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-8 h-[2px] ${isCompleted ? 'bg-brand-success' : 'bg-slate-800'}`}></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button 
              onClick={handleAdvanceStage} 
              disabled={advanceMutation.isPending || activeEng?.stageKey === 'complete'}
              className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition disabled:opacity-50 shadow-md"
            >
              <span>Advance Stage</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </header>

        {/* CONTENT BODY */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT COLUMN: Profile info, Passports & Consents audit */}
          <section className="w-80 border-r border-slate-900 bg-slate-950 p-6 overflow-y-auto shrink-0 flex flex-col gap-6">
            <div className="text-center pb-6 border-b border-slate-900">
              <div className="w-24 h-24 rounded-full bg-brand-gold/10 border-2 border-brand-gold mx-auto flex items-center justify-center text-brand-gold font-display font-bold text-3xl mb-3 shadow-inner">
                {client.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
              </div>
              <h3 className="font-display font-bold text-base text-white">{client.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Token: {clientId}</p>
            </div>

            {/* Contact details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">Contact Details</h4>
              <div className="space-y-3 text-xs bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Mobile Phone</span>
                  <span className="font-semibold text-slate-200">{client.phone}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Email Address</span>
                  <span className="font-semibold text-slate-200">{client.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Highest Qualification</span>
                  <span className="font-semibold text-slate-200 uppercase">{client.highestQualification}</span>
                </div>
              </div>
            </div>

            {/* Passport details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">PII Passport Vault</h4>
              <div className="space-y-3 text-xs bg-slate-900 p-3 rounded-lg border border-slate-900">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Passport Number (Masked)</span>
                  <span className="font-mono font-bold tracking-widest text-brand-gold">
                    {client.passportNumber || 'Not Uploaded'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Expiry Date</span>
                  <span className="font-semibold text-slate-200">{client.passportExpiry || 'Not Provided'}</span>
                </div>
              </div>
            </div>

            {/* DPDP Consents checklist */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">DPDP-2023 Consents</h4>
              <div className="space-y-3">
                {client.consents?.map((consent) => (
                  <div key={consent.id} className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-[10px] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-brand-gold uppercase">{consent.consentType.replace('-', ' ')}</span>
                      <span className="px-2 py-0.2 bg-emerald-950/80 text-brand-success border border-emerald-500/20 rounded font-bold uppercase tracking-widest text-[8px]">
                        GRANTED
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block leading-none">SHA-256 Digest:</span>
                      <span className="font-mono text-[9px] break-all block mt-1 text-slate-300 font-semibold">{consent.sha256Hash}</span>
                    </div>
                    <span className="text-[8px] text-slate-500 block">IP: {consent.ipAddress} • {new Date(consent.grantedAt * 1000).toLocaleDateString()}</span>
                  </div>
                ))}
                {(!client.consents || client.consents.length === 0) && (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-900/40 rounded border border-dashed border-slate-800">
                    No active consent logs found
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* CENTER COLUMN: Tabs & Integrated Modules */}
          <section className="flex-1 bg-brand-navy p-6 overflow-y-auto flex flex-col gap-6">
            
            {/* Active Engagement & Balance Summary */}
            {activeEng && (
              <div className="bg-brand-navyLight p-5 rounded-xl border border-slate-900 shadow-lg flex flex-wrap justify-between items-center gap-4">
                <div>
                  <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Active Engagement</span>
                  <h3 className="font-display font-extrabold text-base text-white mt-1">{activeEng.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Status: <span className="font-bold text-brand-gold uppercase">{activeEng.status}</span></p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Balance</span>
                  <span className="font-display font-extrabold text-xl text-brand-error block mt-0.5">
                    ₹{(activeEng.outstandingBalance / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* TAB SELECTOR BAR */}
            <div className="flex border-b border-slate-900 gap-1 bg-slate-950 p-1 rounded-lg">
              {[
                { id: 'vault', label: 'Document Vault' },
                { id: 'agreements', label: 'Service Agreements' },
                { id: 'payments', label: 'Milestones & GST' },
                { id: 'umrah', label: 'Umrah Departure' },
                { id: 'courier', label: 'Courier Tracker' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 text-center py-2.5 rounded-md text-xs font-bold transition duration-200 ${
                    activeTab === tab.id
                      ? 'bg-brand-navyLight text-brand-gold shadow-md border border-slate-800/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ==========================================
                TAB 1: DOCUMENT VAULT
                ========================================== */}
            {activeTab === 'vault' && (
              <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-gold">Document Vault</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Storage compliance repository on Cloudflare R2 bucket.</p>
                  </div>

                  <label className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    <span>Upload Document</span>
                    <input 
                      type="file" 
                      onChange={handleDocumentUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-900">
                        <th className="p-4">Document Name</th>
                        <th className="p-4">Version</th>
                        <th className="p-4">Upload Date</th>
                        <th className="p-4">Compliance</th>
                        <th className="p-4">Originals Transit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {client.documents?.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-900/40 transition">
                          <td className="p-4 font-semibold text-white">{doc.fileName}</td>
                          <td className="p-4 text-slate-400 font-mono">{doc.version}</td>
                          <td className="p-4 text-slate-300">{new Date(doc.uploadedAt * 1000).toLocaleDateString()}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                              doc.status === 'verified' 
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {doc.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4">
                            {doc.courierTrackingNumber ? (
                              <span className="px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-900 rounded font-mono text-[10px]">
                                {doc.courierName}: {doc.courierTrackingNumber} ({doc.courierStatus})
                              </span>
                            ) : (
                              <span className="text-slate-500">Not Dispatched</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {(!client.documents || client.documents.length === 0) && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                            No Documents Uploaded in Vault
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 2: SERVICE AGREEMENTS
                ========================================== */}
            {activeTab === 'agreements' && (
              <div className="flex flex-col gap-6">
                
                {/* Generation Block */}
                <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Compile New Service Agreement</h3>
                  
                  <form onSubmit={handleCreateDraftAgreement} className="flex flex-wrap gap-4 items-end bg-slate-950 p-4 rounded-lg border border-slate-900">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Standard Templates</label>
                      <select 
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
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
                  <div className="bg-brand-navyLight p-4 rounded-xl border border-slate-900 h-96 overflow-y-auto flex flex-col gap-3">
                    <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider pb-2 border-b border-slate-900">Generated Agreements</h4>
                    {clientAgreements.map((agreement) => (
                      <button
                        key={agreement.id}
                        onClick={() => setSelectedAgreementId(agreement.id)}
                        className={`text-left p-3 rounded-lg border text-xs flex flex-col gap-1 transition duration-200 ${
                          selectedAgreementId === agreement.id
                            ? 'bg-slate-900 border-brand-gold'
                            : 'bg-slate-950 border-slate-900 hover:border-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-bold text-white truncate max-w-[120px]">ID: {agreement.id.substring(0, 8)}...</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            agreement.status === 'signed' 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {agreement.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">Created: {new Date(agreement.createdAt * 1000).toLocaleDateString()}</p>
                        {agreement.sha256Hash && (
                          <div className="mt-1 bg-slate-900 p-1 rounded font-mono text-[9px] text-slate-300 break-all border border-slate-800">
                            Checksum: {agreement.sha256Hash.substring(0, 16)}...
                          </div>
                        )}
                      </button>
                    ))}

                    {clientAgreements.length === 0 && (
                      <div className="text-center text-xs text-slate-500 py-10">
                        No agreements generated yet.
                      </div>
                    )}
                  </div>

                  {/* Right Side: Preview Clauses Pane */}
                  <div className="lg:col-span-2 bg-brand-navyLight p-5 rounded-xl border border-slate-900 flex flex-col gap-4 justify-between h-96">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider">Agreement Draft Preview</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Merged clauses audit trail.</p>
                      </div>
                      {selectedAgreement && selectedAgreement.status === 'draft' && (
                        <button
                          onClick={() => handleOpenSignModal(selectedAgreement.id)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1 px-3 rounded text-[10px] transition shadow"
                        >
                          eSign Document
                        </button>
                      )}
                    </div>

                    <div className="flex-1 bg-slate-950 border border-slate-900 rounded p-4 overflow-y-auto text-[11px] font-mono whitespace-pre-wrap text-slate-300">
                      {selectedAgreement ? selectedAgreement.content : 'Select an agreement from the list to preview merged clauses.'}
                    </div>

                    {selectedAgreement && selectedAgreement.sha256Hash && (
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <div className="flex-1 font-mono text-[10px] text-slate-300 truncate">
                          <span className="text-slate-400 font-sans font-bold">SHA-256 Consent Hash:</span> {selectedAgreement.sha256Hash}
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
                
                {/* Submit New Billing Log */}
                <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Log Billing Entry (Charges & Invoices)</h3>
                  
                  <form onSubmit={handleLogPaymentSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      
                      {/* Milestone Name */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Milestone / Item Name</label>
                        <input 
                          type="text" 
                          value={paymentMilestoneName}
                          onChange={(e) => setPaymentMilestoneName(e.target.value)}
                          placeholder="e.g. Visa Processing Fee, Onboarding Deposit"
                          className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
                        />
                      </div>

                      {/* Entry Type */}
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Entry Type</label>
                        <select 
                          value={paymentType}
                          onChange={(e) => setPaymentType(e.target.value as any)}
                          className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
                        >
                          <option value="invoice">Invoice (Increase Bal)</option>
                          <option value="charge">Debit Charge (Increase Bal)</option>
                          <option value="receipt">Receipt (Decrease Bal)</option>
                          <option value="refund">Refund (Increase Bal)</option>
                        </select>
                      </div>

                      {/* Amount in Rupees */}
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Amount (Rupees ₹)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={paymentAmountInRupees}
                          onChange={(e) => setPaymentAmountInRupees(e.target.value)}
                          placeholder="0.00"
                          className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
                        />
                      </div>

                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-900">
                      
                      {/* Sub-fields for receipt/refund */}
                      {(paymentType === 'receipt' || paymentType === 'refund') ? (
                        <div className="flex gap-4 items-center">
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Payment Method</label>
                            <select 
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as any)}
                              className="text-xs p-2 rounded bg-slate-900 border border-slate-800 text-white"
                            >
                              <option value="upi">UPI (GPay/PhonePe)</option>
                              <option value="bank_transfer">IMPS/NEFT Bank Transfer</option>
                              <option value="cash">Hard Cash</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Reference Number</label>
                            <input 
                              type="text" 
                              value={paymentRefNumber}
                              onChange={(e) => setPaymentRefNumber(e.target.value)}
                              placeholder="UTR / Ref Number"
                              className="text-xs p-2 rounded bg-slate-900 border border-slate-800 text-white focus:ring-brand-gold w-48"
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
                            className="rounded border-slate-800 bg-slate-900 text-brand-gold focus:ring-0 w-4 h-4"
                          />
                          <label htmlFor="interstate" className="text-xs text-slate-300 font-medium cursor-pointer">
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
                <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-display font-bold text-sm text-brand-gold">Milestone Payment Escalation Warnings</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Real-time outstanding tracking. System auto-escalates aging pending invoices.</p>
                    </div>
                    <button
                      onClick={() => evaluateEscalationsMutation.mutate()}
                      disabled={evaluateEscalationsMutation.isPending}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-850 text-brand-gold px-3.5 py-2 rounded text-xs font-bold transition flex items-center gap-1 shadow"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.23"></path></svg>
                      <span>Run Escalation Check</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clientMilestones.map((milestone) => {
                      const isPending = milestone.status === 'pending';
                      const isOverdue = isPending && milestone.overdueLevel !== 'none';
                      
                      let warningBadgeStyle = 'bg-slate-950 text-slate-400 border-slate-900';
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
                            warningBadgeStyle = 'bg-red-950 text-red-400 border-red-900';
                            warningText = 'Critical Level 3';
                            break;
                          case 'hold':
                            warningBadgeStyle = 'bg-purple-950 text-purple-400 border-purple-900 animate-pulse';
                            warningText = 'Account Hold';
                            break;
                        }
                      }

                      return (
                        <div key={milestone.id} className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex flex-col justify-between gap-3 shadow-inner">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-xs text-white truncate max-w-[130px]">{milestone.label}</h4>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold border ${warningBadgeStyle}`}>
                                {warningText.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Due Date: {new Date(milestone.dueDate * 1000).toLocaleDateString()}</p>
                          </div>
                          
                          <div className="flex justify-between items-end border-t border-slate-900 pt-2.5">
                            <div>
                              <span className="text-[9px] text-slate-500 uppercase tracking-widest block leading-none">Milestone Fee</span>
                              <span className="font-mono font-extrabold text-sm text-brand-gold">₹{(milestone.amount / 100).toFixed(2)}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              milestone.status === 'paid' 
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {milestone.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {clientMilestones.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded border border-dashed border-slate-800">
                        No milestone payment schedules exist for this client's agreements.
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone Billing Ledger Table (Precise paise tracking formatted at UI boundaries) */}
                <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Billing & Tax Ledger (Paise Precision)</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-900">
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
                          let amountColor = 'text-white';
                          
                          switch(ledger.type) {
                            case 'invoice':
                              typeBadge = 'bg-amber-950 text-amber-400 border border-amber-800';
                              amountColor = 'text-amber-400';
                              break;
                            case 'receipt':
                              typeBadge = 'bg-emerald-950 text-emerald-400 border border-emerald-800';
                              amountColor = 'text-emerald-400';
                              break;
                            case 'charge':
                              typeBadge = 'bg-rose-950 text-rose-400 border border-rose-800';
                              amountColor = 'text-rose-400';
                              break;
                            case 'refund':
                              typeBadge = 'bg-blue-950 text-blue-400 border border-blue-800';
                              amountColor = 'text-blue-400';
                              break;
                          }

                          const hasTax = ledger.taxableAmount !== null;

                          return (
                            <tr key={ledger.id} className="hover:bg-slate-900/40 transition">
                              <td className="p-4 text-slate-400">{new Date(ledger.createdAt * 1000).toLocaleDateString()}</td>
                              <td className="p-4">
                                <p className="font-semibold text-white">{ledger.milestoneName}</p>
                                {ledger.referenceNumber && (
                                  <span className="text-[10px] text-slate-400 font-mono">Ref: {ledger.referenceNumber} ({ledger.method?.toUpperCase()})</span>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${typeBadge}`}>
                                  {ledger.type}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-slate-300">
                                {hasTax ? `₹${(ledger.taxableAmount! / 100).toFixed(2)}` : '—'}
                              </td>
                              <td className="p-4">
                                {hasTax ? (
                                  <div className="text-[10px] font-mono text-slate-400 space-y-0.5">
                                    {ledger.isInterstate ? (
                                      <div>IGST (18%): ₹{(ledger.igst! / 100).toFixed(2)}</div>
                                    ) : (
                                      <>
                                        <div>CGST (9%): ₹{(ledger.cgst! / 100).toFixed(2)}</div>
                                        <div>SGST (9%): ₹{(ledger.sgst! / 100).toFixed(2)}</div>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-500">Exempt / Non-Taxable</span>
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
                            <td colSpan={6} className="p-8 text-center text-xs text-slate-500">
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
              <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 shadow-md">
                <div className="mb-4">
                  <h3 className="font-display font-bold text-sm text-brand-gold">Umrah Scheduled Group Departure Calendar</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Book clients into specific luxury departure flights and track remaining capacity seat limits.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {departuresData?.departures?.map((dep) => {
                    const remainingSeats = dep.capacity - dep.bookedSeats;
                    
                    let seatBadgeColor = 'bg-emerald-950 text-emerald-400 border-emerald-900';
                    if (remainingSeats === 0) {
                      seatBadgeColor = 'bg-red-950 text-red-400 border-red-900';
                    } else if (remainingSeats <= 10) {
                      seatBadgeColor = 'bg-amber-950 text-amber-400 border-amber-900';
                    }

                    return (
                      <div key={dep.id} className="bg-slate-950 p-5 rounded-xl border border-slate-900 shadow-inner flex flex-col justify-between gap-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Flight Departure Date</span>
                            <h4 className="font-display font-extrabold text-base text-brand-gold mt-0.5">
                              {new Date(dep.departureDate * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </h4>
                            <p className="text-[10px] text-slate-300 mt-1 uppercase font-semibold">Tier: {dep.packageTier}</p>
                          </div>
                          
                          <div className={`px-2.5 py-1 rounded border text-center ${seatBadgeColor}`}>
                            <span className="text-[10px] font-bold block leading-none">{remainingSeats}</span>
                            <span className="text-[7px] uppercase font-bold tracking-wider">Seats Left</span>
                          </div>
                        </div>

                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex justify-between items-center text-xs">
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block">Group Capacity</span>
                            <span className="font-bold text-slate-200 font-mono">{dep.bookedSeats} / {dep.capacity} Booked</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-slate-500 uppercase block">Booking Fee</span>
                            <span className="font-bold text-slate-200 font-mono">₹{(dep.bookingFee / 100).toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold text-white">Price: ₹{(dep.price / 100).toFixed(2)}</span>
                          <button
                            onClick={() => bookUmrahSeatMutation.mutate(dep.id)}
                            disabled={bookUmrahSeatMutation.isPending || dep.status === 'cancelled'}
                            className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold py-1.5 px-4 rounded text-xs transition shadow-md disabled:opacity-50"
                          >
                            {bookUmrahSeatMutation.isPending ? 'Booking...' : (remainingSeats === 0 ? 'Waitlist Seat' : 'Book Seat')}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(!departuresData?.departures || departuresData.departures.length === 0) && (
                    <div className="col-span-full py-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded border border-dashed border-slate-800">
                      No Umrah scheduled group departures available.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 5: ATTESTATION COURIER TRACKER
                ========================================== */}
            {activeTab === 'courier' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Shipment Registration Form */}
                <div className="bg-brand-navyLight p-6 rounded-xl border border-slate-900 h-fit shadow-md">
                  <h3 className="font-display font-bold text-sm text-brand-gold mb-3">Register Attestation Shipment</h3>
                  
                  <form onSubmit={handleRegisterCourierSubmit} className="space-y-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Courier Partner</label>
                      <select
                        value={courierPartner}
                        onChange={(e) => setCourierPartner(e.target.value as any)}
                        className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
                      >
                        <option value="blue-dart">Blue Dart Express</option>
                        <option value="dtdc">DTDC Courier</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Tracking Number</label>
                      <input 
                        type="text" 
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Enter courier reference tracking ID..."
                        className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Delivery Destination Address</label>
                      <textarea
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="Enter consignee shipping address details..."
                        rows={3}
                        className="w-full text-xs p-2.5 rounded bg-slate-900 border border-slate-800 text-white focus:ring-1 focus:ring-brand-gold resize-none"
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
                <div className="lg:col-span-2 bg-brand-navyLight p-6 rounded-xl border border-slate-900 flex flex-col gap-5 justify-between min-h-[400px]">
                  
                  {/* Track selector header */}
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-gold">Attestation Shipment Timeline</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Select a registered shipment below to query live courier events.</p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {shipments.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedShipmentId(s.id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition duration-200 ${
                            selectedShipmentId === s.id
                              ? 'bg-slate-900 border-brand-gold text-brand-gold'
                              : 'bg-slate-950 border-slate-900 text-slate-400 hover:border-slate-800'
                          }`}
                        >
                          {s.courierPartner === 'blue-dart' ? 'Blue Dart' : 'DTDC'}: {s.trackingNumber}
                        </button>
                      ))}

                      {shipments.length === 0 && (
                        <span className="text-xs text-slate-500">No shipments registered for this client.</span>
                      )}
                    </div>
                  </div>

                  {/* Vertical Progress events timeline */}
                  <div className="flex-1 bg-slate-950 rounded-lg p-5 border border-slate-900 overflow-y-auto">
                    {isLoadingTracking ? (
                      <div className="text-center text-xs text-slate-500 py-12">Loading events from courier API...</div>
                    ) : activeTracking?.success ? (
                      <div className="space-y-6">
                        
                        {/* Summary Header */}
                        <div className="flex justify-between items-center border-b border-slate-900 pb-3 mb-4">
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block">Courier Partner</span>
                            <span className="font-bold text-xs text-white">{activeTracking.partner}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block">Current Status</span>
                            <span className="px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-850 rounded font-bold uppercase tracking-wider text-[9px]">
                              {activeTracking.currentStatus.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-slate-500 uppercase block">Est Delivery</span>
                            <span className="font-bold text-xs text-slate-200">
                              {activeTracking.estimatedDelivery 
                                ? new Date(activeTracking.estimatedDelivery * 1000).toLocaleDateString()
                                : 'Calculating...'}
                            </span>
                          </div>
                        </div>

                        {/* Event list */}
                        <div className="relative border-l-2 border-slate-900 pl-4 ml-2 space-y-6">
                          {activeTracking.events?.map((ev, i) => (
                            <div key={i} className="relative">
                              {/* Timeline dot */}
                              <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-brand-gold border-2 border-slate-950"></div>
                              
                              <div className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                  <span className="font-bold text-xs text-white uppercase">{ev.status.replace('_', ' ')}</span>
                                  <span className="text-[10px] text-slate-500">{new Date(ev.timestamp * 1000).toLocaleString()}</span>
                                </div>
                                <p className="text-[10px] text-slate-400">Location: <span className="text-slate-200 font-semibold">{ev.location}</span></p>
                                <p className="text-xs text-slate-300">{ev.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                      </div>
                    ) : (
                      <div className="text-center text-xs text-slate-500 py-12">
                        Select a shipment to track. Mock courier events will fetch on-demand.
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

          </section>

          {/* RIGHT COLUMN: Communication logs & WhatsApp Console */}
          <section className="w-96 border-l border-slate-900 bg-slate-950 flex flex-col justify-between shrink-0 overflow-hidden">
            
            {/* Timeline Filter Header */}
            <div className="p-4 border-b border-slate-900 flex items-center justify-between bg-slate-900/60">
              <h3 className="font-display font-bold text-xs text-brand-gold uppercase tracking-wider">Communication Logs</h3>
              <div className="flex gap-1 text-[10px]">
                {(['all', 'whatsapp', 'email', 'system'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setTimelineFilter(tab)}
                    className={`px-2 py-1 rounded transition duration-200 text-[9px] font-bold ${
                      timelineFilter === tab 
                        ? 'bg-brand-gold text-brand-navy' 
                        : 'hover:bg-slate-900 text-slate-400'
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
                    <div key={item.id} className="flex gap-2 text-xs text-slate-400 flex-row">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 border select-none ${
                        isWhatsApp 
                          ? 'bg-emerald-600 text-white border-emerald-700' 
                          : isEmail 
                            ? 'bg-sky-600 text-white border-sky-700' 
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {isWhatsApp ? 'WA' : isEmail ? 'EM' : '⚙'}
                      </div>
                      
                      <div className={`p-3 rounded-lg border flex-1 ${
                        isWhatsApp 
                          ? 'bg-emerald-950/20 border-emerald-900/60' 
                          : isEmail 
                            ? 'bg-sky-950/20 border-sky-900/60' 
                            : 'bg-slate-900/40 border-slate-900'
                      }`}>
                        <p className="font-bold text-slate-200">{item.sender || 'System Operator'}</p>
                        {item.subject && (
                          <p className="text-[10px] mt-0.5 text-brand-gold font-semibold">Subj: {item.subject}</p>
                        )}
                        <p className="text-[11px] mt-1 text-slate-300 whitespace-pre-wrap">{item.body || item.message}</p>
                        <span className="text-[9px] text-slate-500 block mt-2">
                          {new Date(item.createdAt * 1000).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {(!client.timeline || client.timeline.length === 0) && (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-900 rounded-lg">
                  No Communications Recorded
                </div>
              )}
            </div>

            {/* Timeline Editor Console */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-900 bg-slate-950/80 flex flex-col gap-3">
              
              {/* Channels Tabs */}
              <div className="flex gap-1 border-b border-slate-900 pb-2">
                {[
                  { id: 'whatsapp', label: 'WhatsApp' },
                  { id: 'email', label: 'Email' },
                  { id: 'note', label: 'Internal Note' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditorTab(tab.id as any)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition duration-200 ${
                      editorTab === tab.id 
                        ? 'bg-brand-gold text-brand-navy' 
                        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Subject if email */}
              {editorTab === 'email' && (
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Subject</label>
                  <input 
                    type="text" 
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    placeholder="Enter email subject..."
                    className="w-full text-xs p-2 border border-slate-900 bg-slate-900 text-white rounded focus:ring-1 focus:ring-brand-gold"
                  />
                </div>
              )}

              {/* Quick templates */}
              <div className="flex justify-between items-center">
                <label className="text-[9px] text-slate-400 font-bold uppercase">Quick Templates</label>
                <select 
                  onChange={handleTemplateChange}
                  className="text-[10px] border border-slate-900 rounded px-2 py-1 bg-slate-900 text-white focus:ring-1 focus:ring-brand-gold"
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
                className="w-full text-xs p-2.5 border border-slate-900 bg-slate-900 text-white rounded focus:ring-1 focus:ring-brand-gold resize-none"
              />

              {/* Submit message */}
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-semibold">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-navyLight border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full flex flex-col justify-between overflow-hidden">
            
            <div className="p-6 border-b border-slate-900">
              <h3 className="text-sm font-bold text-brand-gold uppercase tracking-wider">Execute Digital eSign Capture</h3>
              <p className="text-xs text-slate-400 mt-1">Aadhaar/OTP Consent Verification (DPDP compliance audit trail)</p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              
              <div className="bg-slate-950 p-4 border border-slate-900 rounded font-mono text-[10px] text-slate-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {selectedAgreement.content}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">eSign Verification Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-lg cursor-pointer text-xs">
                    <input 
                      type="radio" 
                      name="esign-method"
                      checked={esignMethod === 'aadhaar'}
                      onChange={() => setEsignMethod('aadhaar')}
                      className="text-brand-gold focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">Aadhaar eSign</span>
                      <span className="text-[10px] text-slate-400">UIDAI verified</span>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-lg cursor-pointer text-xs">
                    <input 
                      type="radio" 
                      name="esign-method"
                      checked={esignMethod === 'otp'}
                      onChange={() => setEsignMethod('otp')}
                      className="text-brand-gold focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">OTP Signature</span>
                      <span className="text-[10px] text-slate-400">Mobile OTP verified</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <input 
                  type="checkbox" 
                  id="consent-declaration"
                  checked={esignChecked}
                  onChange={(e) => setEsignChecked(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-brand-gold focus:ring-0 w-4 h-4 mt-0.5"
                />
                <label htmlFor="consent-declaration" className="text-[10px] text-slate-300 font-medium cursor-pointer leading-relaxed">
                  I hereby declare my explicit consent to electronically sign this Service Agreement under the regulations of DPDP Act 2023. I verify that all details mapped here are accurate, and I agree to bind the legal terms of this transaction.
                </label>
              </div>

            </div>

            <div className="p-6 bg-slate-950/60 border-t border-slate-900 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsSignModalOpen(false);
                  setEsignChecked(false);
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-4 py-2 rounded text-xs font-bold transition"
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
        className={`fixed right-6 bottom-6 bg-slate-950 border-l-4 border-brand-gold text-white text-xs px-4 py-3.5 rounded-lg shadow-2xl transition duration-300 z-50 flex items-center gap-2 border border-slate-800 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        <span className="font-bold text-brand-gold">CLIENT 360:</span>
        <span className="text-slate-200">{toast.msg}</span>
      </div>

    </div>
  );
}
