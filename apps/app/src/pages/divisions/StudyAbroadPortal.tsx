import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StudyAbroadApplicationModal, { ApplicationSnapshot, MatchResult, StudentProfile } from '../../components/StudyAbroadApplicationModal';
import StudentProfileWizard, { profileCompleteness } from '../../components/StudentProfileWizard';

interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
  highestQualification: string;
  intakeContext?: string; // stringified JSON
  notes?: string | null; // internal agent notes (staff-only)
  status: string;
}

interface University {
  id: string;
  name: string;
  country: string;
  intake: string;
  minGpa: number;
  ieltsMin: number;
  budgetLpaMin: number;
}

// ── Phase 4: application snapshot model ──
interface Application {
  id: string;
  clientId: string;
  status: string;
  university: ApplicationSnapshot;
  match: MatchResult;
  docsChecklist: Record<string, string>;
  offer: {
    offerLetterKey: string | null;
    offerType: string | null;
    offerConditions: string[];
    offerDecision: string;
    acceptanceDeadline: number | null;
    depositAmountPaise: number | null;
    depositDeadline: number | null;
    depositPaid: boolean;
  };
  rejectionReason: string | null;
  decisionDate: number | null;
  submittedAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PipelineAggregate {
  counts: Record<string, number>;
  stuck: { id: string; clientId: string; status: string; university: string; updatedAt: number }[];
  decisionsPending: { id: string; clientId: string; university: string; acceptanceDeadline: number | null }[];
  deadlinesSoon: { id: string; clientId: string; university: string; deadline: number; kind: string }[];
  total: number;
}

// Application lifecycle columns (mirrors the backend no-jump machine)
const APP_COLUMNS: { key: string; title: string; color: string }[] = [
  { key: 'shortlisted', title: 'Shortlisted', color: 'bg-brand-navy/[0.06] text-brand-navy/60' },
  { key: 'docs_ready', title: 'Docs Ready', color: 'bg-blue-500/15 text-blue-700' },
  { key: 'submitted', title: 'Submitted', color: 'bg-indigo-500/15 text-indigo-700' },
  { key: 'under_review', title: 'Under Review', color: 'bg-amber-500/15 text-amber-700' },
  { key: 'offer_letter', title: 'Offer Letter', color: 'bg-emerald-500/15 text-emerald-700' },
  { key: 'deposit_paid', title: 'Deposit Paid', color: 'bg-teal-500/15 text-teal-700' },
  { key: 'enrolled', title: 'Enrolled', color: 'bg-emerald-600/15 text-emerald-800' },
  { key: 'rejected', title: 'Rejected', color: 'bg-rose-500/15 text-rose-600' },
];
const APP_STATUS_LABEL: Record<string, string> = Object.fromEntries(APP_COLUMNS.map(c => [c.key, c.title]));
const DOC_KEYS = ['transcript', 'cv', 'sop', 'lor1', 'lor2', 'ielts', 'passport', 'finance', 'portfolio'];
const DOC_LABEL: Record<string, string> = { transcript: 'Transcripts', cv: 'CV/Resume', sop: 'SOP', lor1: 'LOR 1', lor2: 'LOR 2', ielts: 'Test scores', passport: 'Passport', finance: 'Financial proof', portfolio: 'Portfolio' };
const TIER_STYLE: Record<string, string> = { match: 'bg-emerald-500/15 text-emerald-700', reach: 'bg-amber-500/15 text-amber-700', safe: 'bg-blue-500/15 text-blue-700' };
const TIER_LABEL: Record<string, string> = { match: '✓ Match', reach: '⚠ Reach', safe: '★ Safe' };
const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

export default function StudyAbroadPortal() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'profiles' | 'kanban'>('profiles');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'shortlist' | 'docs' | 'apps'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentQual, setNewStudentQual] = useState('undergrad');
  const [newStudentNation, setNewStudentNation] = useState('India 🇮🇳');

  // Edit Academic Context state
  const [isEditingAcademic, setIsEditingAcademic] = useState(false);
  const [cgpa, setCgpa] = useState('7.5');
  const [englishTest, setEnglishTest] = useState('IELTS');
  const [englishScore, setEnglishScore] = useState('6.5');
  const [targetIntake, setTargetIntake] = useState('Fall 2026');
  const [targetCountry, setTargetCountry] = useState('UK');
  const [tuitionBudget, setTuitionBudget] = useState('15');

  // Bound Application Portal Credentials
  const [appRefNo, setAppRefNo] = useState('');
  const [portalEmail, setPortalEmail] = useState('');
  const [casLetterStatus, setCasLetterStatus] = useState('Awaiting Document');

  // Phase 4: application modal + pipeline filters
  const [showAppModal, setShowAppModal] = useState(false);
  const [showIntakeWizard, setShowIntakeWizard] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [studentNotes, setStudentNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [noteChannel, setNoteChannel] = useState<'whatsapp' | 'email' | 'note'>('note');
  const [appFilter, setAppFilter] = useState<{ country: string; intake: string; tier: string }>({ country: '', intake: '', tier: '' });

  // Kanban Card quick modal
  const [showAddCard, setShowAddCard] = useState<string | null>(null);
  const [selectedClientForCard, setSelectedClientForCard] = useState('');
  const [selectedUniForCard, setSelectedUniForCard] = useState('');

  // Queries
  const { data: clientsData } = useQuery<{ clients: Student[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch('/api/clients');
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  const students = (clientsData?.clients || []).filter(c => c.primaryDivision === 'study-abroad');
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedStudent = filteredStudents.find(s => s.id === selectedStudentId) || filteredStudents[0];

  // Set academic edit defaults on student select
  const handleStudentSelect = (student: Student) => {
    setSelectedStudentId(student.id);
    setIsEditingAcademic(false);
    if (student.intakeContext) {
      try {
        const parsed = JSON.parse(student.intakeContext);
        setCgpa(parsed.cgpa || '7.5');
        setEnglishTest(parsed.englishTest || 'IELTS');
        setEnglishScore(parsed.englishScore || '6.5');
        setTargetIntake(parsed.targetIntake || 'Fall 2026');
        setTargetCountry(parsed.targetCountry || 'UK');
        setTuitionBudget(parsed.tuitionBudget || '15');
        setAppRefNo(parsed.appRefNo || '');
        setPortalEmail(parsed.portalEmail || '');
        setCasLetterStatus(parsed.casLetterStatus || 'Awaiting Document');
        setStudentNotes(student.notes || '');
        setNotesDirty(false);
      } catch {
        // Fallback defaults
        setCgpa('7.5');
        setEnglishTest('IELTS');
        setEnglishScore('6.5');
        setTargetIntake('Fall 2026');
        setTargetCountry('UK');
        setTuitionBudget('15');
        setAppRefNo('');
        setPortalEmail('');
        setCasLetterStatus('Awaiting Document');
        setStudentNotes(student.notes || '');
        setNotesDirty(false);
      }
    } else {
      setCgpa('7.5');
      setEnglishTest('IELTS');
      setEnglishScore('6.5');
      setTargetIntake('Fall 2026');
      setTargetCountry('UK');
      setTuitionBudget('15');
      setAppRefNo('');
      setPortalEmail('');
      setCasLetterStatus('Awaiting Document');
      setStudentNotes(student.notes || '');
      setNotesDirty(false);
    }
  };

  // Mutations
  const createStudentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || 'Failed to create student');
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      setShowAddStudent(false);
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentPhone('');
    },
    onError: (err: any) => {
      alert(err.message);
    }
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to update student');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      queryClient.invalidateQueries({ queryKey: ['clientDetails'] });
      setIsEditingAcademic(false);
    }
  });

  const logNoteMutation = useMutation({
    mutationFn: async ({ channel, body }: { channel: string; body: string }) => {
      const r = await fetch(`/api/clients/${selectedStudent?.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, direction: 'internal', body })
      });
      if (!r.ok) throw new Error('Failed to log note');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientDetails', selectedStudent?.id] });
      setNoteText('');
    },
    onError: (e: any) => alert(e.message)
  });

  const reviewDocMutation = useMutation({
    mutationFn: async ({ docId, status }: { docId: string; status: 'verified' | 'rejected' }) => {
      const r = await fetch(`/api/clients/${selectedStudent?.id}/documents/${docId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Review failed');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientDetails', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['studyApps', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalStudyApps'] });
    },
    onError: (e: any) => alert(e.message)
  });

  // Client details (document list & profile timeline)
  const { data: clientDetails, refetch: refetchClientDetails } = useQuery<any>({
    queryKey: ['clientDetails', selectedStudent?.id],
    queryFn: async () => {
      if (!selectedStudent) return null;
      const r = await fetch(`/api/clients/${selectedStudent.id}`);
      if (!r.ok) throw new Error('Failed to fetch client details');
      return r.json();
    },
    enabled: !!selectedStudent
  });

  // Master universities list (for manual card select list)
  const { data: universitiesData } = useQuery<{ universities: University[] }>({
    queryKey: ['allUniversities'],
    queryFn: async () => {
      const r = await fetch('/api/study-abroad/universities');
      if (!r.ok) throw new Error('Failed to fetch master universities');
      return r.json();
    }
  });

  const shortlistMutation = useMutation({
    mutationFn: async (payload: { clientId?: string; universityId: string; status?: string; notes?: string }) => {
      const targetClientId = payload.clientId || selectedStudent?.id;
      const r = await fetch('/api/study-abroad/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId: targetClientId, 
          universityId: payload.universityId, 
          status: payload.status || 'shortlisted',
          notes: payload.notes 
        })
      });
      if (!r.ok) throw new Error('Failed to add university to shortlist');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalShortlist'] });
    }
  });

  // ── Phase 4: applications (snapshot model) ──
  const { data: appsData } = useQuery<{ applications: Application[] }>({
    queryKey: ['studyApps', selectedStudent?.id],
    queryFn: async () => {
      const q = selectedStudent ? `?clientId=${selectedStudent.id}` : '';
      const r = await fetch(`/api/study-abroad/applications${q}`);
      if (!r.ok) throw new Error('Applications fetch failed');
      return r.json();
    },
    enabled: !!selectedStudent
  });

  const { data: globalAppsData } = useQuery<{ applications: Application[] }>({
    queryKey: ['globalStudyApps'],
    queryFn: async () => {
      const r = await fetch('/api/study-abroad/applications');
      if (!r.ok) throw new Error('Applications fetch failed');
      return r.json();
    }
  });

  const { data: pipelineData } = useQuery<PipelineAggregate>({
    queryKey: ['studyPipeline'],
    queryFn: async () => {
      const r = await fetch('/api/study-abroad/applications/pipeline');
      if (!r.ok) throw new Error('Pipeline fetch failed');
      return r.json();
    }
  });

  const createAppMutation = useMutation({
    mutationFn: async (snapshot: ApplicationSnapshot) => {
      const r = await fetch('/api/study-abroad/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedStudent?.id, university: snapshot })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Application creation failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyApps', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalStudyApps'] });
      queryClient.invalidateQueries({ queryKey: ['studyPipeline'] });
      setShowAppModal(false);
    },
    onError: (e: any) => alert(e.message)
  });

  const updateAppStatusMutation = useMutation({
    mutationFn: async ({ id, status, rejectionReason }: { id: string; status: string; rejectionReason?: string }) => {
      const r = await fetch(`/api/study-abroad/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Status update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyApps', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalStudyApps'] });
      queryClient.invalidateQueries({ queryKey: ['studyPipeline'] });
    },
    onError: (e: any) => alert(e.message)
  });

  const updateAppOfferMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/study-abroad/applications/${id}/offer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Offer update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyApps', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalStudyApps'] });
      queryClient.invalidateQueries({ queryKey: ['studyPipeline'] });
    },
    onError: (e: any) => alert(e.message)
  });

  const updateAppDocsMutation = useMutation({
    mutationFn: async ({ id, docs }: { id: string; docs: Record<string, string> }) => {
      const r = await fetch(`/api/study-abroad/applications/${id}/docs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Docs update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyApps', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalStudyApps'] });
    },
    onError: (e: any) => alert(e.message)
  });

  // Allowed next statuses (mirror of the backend no-jump machine)
  const NEXT_STATUSES: Record<string, string[]> = {
    shortlisted: ['docs_ready', 'withdrawn'],
    docs_ready: ['submitted', 'shortlisted', 'withdrawn'],
    submitted: ['under_review', 'withdrawn'],
    under_review: ['offer_letter', 'rejected', 'withdrawn'],
    offer_letter: ['deposit_paid', 'rejected', 'withdrawn'],
    deposit_paid: ['enrolled', 'withdrawn'],
    enrolled: [],
    rejected: [],
    withdrawn: [],
  };

  const studentCompleteness = (s: Student | undefined) => profileCompleteness(studentProfile(s));

  const studentProfile = (s: Student | undefined): StudentProfile => {
    if (!s?.intakeContext) return {};
    try {
      const p = JSON.parse(s.intakeContext);
      return {
        cgpa: p.cgpa ? Number(p.cgpa) : null,
        englishScore: p.englishScore ? Number(p.englishScore) : null,
        englishTest: p.englishTest || null,
        tuitionBudget: p.tuitionBudget ? Number(p.tuitionBudget) : null,
        targetCountry: p.targetCountry || null,
        preferredCourse: p.preferredCourse || null,
      };
    } catch { return {}; }
  };

  const fmtDate = (ts: number | null | undefined) => ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const daysLeft = (ts: number | null | undefined) => ts ? Math.ceil((ts - Date.now() / 1000) / 86400) : null;
  const deadlineChip = (ts: number | null | undefined) => {
    const d = daysLeft(ts);
    if (d === null) return null;
    if (d < 0) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[9px] font-bold">⏰ {Math.abs(d)}d overdue</span>;
    if (d <= 7) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[9px] font-bold">🔥 {d}d left</span>;
    if (d <= 14) return <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 text-[9px] font-bold">⏳ {d}d left</span>;
    return <span className="px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/50 text-[9px] font-bold">{d}d left</span>;
  };

  const getStudentGPA = (s: Student) => {
    if (!s.intakeContext) return 'N/A';
    try {
      const parsed = JSON.parse(s.intakeContext);
      return parsed.cgpa || 'N/A';
    } catch {
      return 'N/A';
    }
  };

  const getStudentCountry = (s: Student) => {
    if (!s.intakeContext) return 'N/A';
    try {
      const parsed = JSON.parse(s.intakeContext);
      return parsed.targetCountry || 'N/A';
    } catch {
      return 'N/A';
    }
  };

  // Derived checklist files from database
  const docsList = clientDetails?.documents || [];
  const matchedDocs: Record<string, any> = {
    transcript: docsList.find((d: any) => d.fileName.toLowerCase().includes('transcript')),
    cv: docsList.find((d: any) => d.fileName.toLowerCase().includes('cv') || d.fileName.toLowerCase().includes('resume')),
    sop: docsList.find((d: any) => d.fileName.toLowerCase().includes('sop')),
    lor1: docsList.find((d: any) => d.fileName.toLowerCase().includes('lor1')),
    lor2: docsList.find((d: any) => d.fileName.toLowerCase().includes('lor2')),
    finance: docsList.find((d: any) => d.fileName.toLowerCase().includes('finance'))
  };

  const handleUploadDoc = async (key: string, file: File) => {
    if (!selectedStudent) return;
    const cleanName = selectedStudent.name.replace(/\s+/g, '-').toLowerCase();
    const customFileName = `${cleanName}-${key}-${file.name}`;

    try {
      const presignedRes = await fetch(`/api/clients/${selectedStudent.id}/documents/presigned?filename=${encodeURIComponent(customFileName)}`);
      if (!presignedRes.ok) throw new Error('Failed to generate presigned upload URL');
      const { url } = await presignedRes.json();

      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: await file.arrayBuffer(),
      });
      if (!uploadRes.ok) throw new Error('Failed to upload file bytes');

      refetchClientDetails();
      alert(`Successfully uploaded document: ${file.name}`);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Toggle bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/[0.08] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Study Abroad Counseling Desk</h1>
          <p className="text-xs text-brand-navy/40 font-medium">Coordinate admissions checklists, university shortlists, and counseling flows.</p>
        </div>
        <div className="flex items-center gap-2 bg-brand-navy/[0.05] p-1.5 rounded-xl border border-brand-navy/10 text-xs font-bold text-brand-navy/60">
          <button
            onClick={() => setViewMode('profiles')}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${viewMode === 'profiles' ? 'bg-brand-gold text-brand-navy shadow-xs border border-brand-gold/40' : 'hover:text-brand-navy'}`}
          >
            🗂️ Student Profiles
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${viewMode === 'kanban' ? 'bg-brand-gold text-brand-navy shadow-xs border border-brand-gold/40' : 'hover:text-brand-navy'}`}
          >
            📊 Kanban Pipeline
          </button>
        </div>
      </div>

      {viewMode === 'profiles' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar Student Directory */}
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 flex flex-col gap-4 shadow-sm h-[600px] backdrop-blur-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-xs uppercase font-bold text-brand-navy/50 tracking-wider">Student Registry</h3>
              <button
                onClick={() => setShowAddStudent(true)}
                className="bg-brand-gold text-brand-navy text-[10px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
              >
                + Add Student
              </button>
            </div>

            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredStudents.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStudentSelect(s)}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1.5 ${selectedStudent?.id === s.id ? 'border-brand-gold bg-brand-gold/10 shadow-xs' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="font-bold text-brand-navy line-clamp-1">{s.name}</span>
                    <span className="text-[10px] text-brand-navy/50 font-mono shrink-0">{s.id}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-brand-navy/40 font-medium w-full">
                    <span>GPA: {getStudentGPA(s)}</span>
                    <span className="text-brand-gold uppercase">{getStudentCountry(s)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded bg-brand-navy/[0.08] overflow-hidden"><div className="h-full bg-brand-gold" style={{ width: `${studentCompleteness(s).pct}%` }} /></div>
                    <span className={`text-[8px] font-bold ${studentCompleteness(s).pct === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>{studentCompleteness(s).pct}%</span>
                    {s.notes && <span title="Has notes" className="text-[9px]">📝</span>}
                  </div>
                </button>
              ))}
              {filteredStudents.length === 0 && (
                <p className="text-xs text-brand-navy/50 italic text-center py-6">No students matched.</p>
              )}
            </div>
          </div>

          {/* Right main Student Profile workspace */}
          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm flex flex-col gap-6 backdrop-blur-sm">
            {selectedStudent ? (
              <>
                {/* Profile Header Block matching example.png */}
                <div className="flex items-center justify-between border-b border-brand-navy/10 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy/[0.05] border border-brand-navy/10 text-brand-gold font-display font-bold text-xl">
                      {selectedStudent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-extrabold text-brand-navy">{selectedStudent.name}</h2>
                        <span className="text-sm">🇮🇳</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-brand-navy/50 font-mono text-[10px] mt-1 font-semibold">
                        <span className="text-emerald-700 font-bold">#{selectedStudent.id.split('-').pop()}</span>
                        <span>•</span>
                        <span>{selectedStudent.email}</span>
                        <span>•</span>
                        <span>{selectedStudent.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Bar Quick Action Icons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowIntakeWizard(true)}
                      title="Intake wizard (agent-assisted profile)"
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] transition-all cursor-pointer"
                    >
                      📝
                    </button>
                    <button
                      onClick={() => {
                        const rows = [
                          ['Field', 'Value'],
                          ['Student', selectedStudent.name],
                          ['ID', selectedStudent.id],
                          ['Email', selectedStudent.email],
                          ['Phone', selectedStudent.phone],
                          ['CGPA', cgpa],
                          ['English Test', `${englishTest}: ${englishScore}`],
                          ['Target Intake', targetIntake],
                          ['Target Country', targetCountry],
                          ['Tuition Budget (LPA)', tuitionBudget],
                          ['Application Ref', appRefNo],
                          ['Portal Email', portalEmail],
                          ['CAS Letter Status', casLetterStatus],
                          ['Transcript', matchedDocs.transcript ? 'Uploaded' : 'Missing'],
                          ['CV/Resume', matchedDocs.cv ? 'Uploaded' : 'Missing'],
                          ['SOP', matchedDocs.sop ? 'Uploaded' : 'Missing'],
                          ['LOR 1', matchedDocs.lor1 ? 'Uploaded' : 'Missing'],
                          ['LOR 2', matchedDocs.lor2 ? 'Uploaded' : 'Missing'],
                          ['Financial Proofs', matchedDocs.finance ? 'Uploaded' : 'Missing'],
                        ];
                        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${selectedStudent.name.replace(/\s+/g, '-').toLowerCase()}-checklist.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      title="Export checklist summary"
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] transition-all cursor-pointer"
                    >
                      📄
                    </button>
                    <button
                      onClick={() => setActiveTab('shortlist')}
                      title="College shortlists"
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] transition-all cursor-pointer"
                    >
                      🏛️
                    </button>
                  </div>
                </div>

                {/* Sub Navigation tabs */}
                <div className="flex border-b border-brand-navy/[0.08] text-xs font-semibold gap-6 pb-2.5">
                  {[
                    { key: 'overview', label: 'Overview' },
                    { key: 'shortlist', label: 'Applications' },
                    { key: 'docs', label: 'Documents' },
                    { key: 'apps', label: 'Portal Tracking' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${activeTab === tab.key ? 'border-brand-gold text-brand-navy font-bold' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content panels */}
                <div className="text-xs">
                  {activeTab === 'overview' && (
                    <>
                      {/* Applications summary strip */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-3">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">Applications</div>
                          <div className="font-display font-extrabold text-brand-navy text-lg mt-0.5">{appsData?.applications?.length || 0}</div>
                        </div>
                        <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-3">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">In Progress</div>
                          <div className="font-display font-extrabold text-brand-navy text-lg mt-0.5">{(appsData?.applications || []).filter(a => !['enrolled', 'rejected', 'withdrawn'].includes(a.status)).length}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">Offers</div>
                          <div className="font-display font-extrabold text-emerald-700 text-lg mt-0.5">{(appsData?.applications || []).filter(a => a.status === 'offer_letter').length}</div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-rose-600">Next Deadline</div>
                          <div className="font-display font-extrabold text-rose-600 text-sm mt-0.5">
                            {(() => {
                              const deadlines = (appsData?.applications || [])
                                .map(a => ({ uni: a.university.name, d: a.university.deadline }))
                                .filter(x => x.d && x.d > Date.now() / 1000)
                                .sort((a, b) => a.d! - b.d!);
                              return deadlines.length ? fmtDate(deadlines[0].d) : '—';
                            })()}
                          </div>
                          {(() => {
                            const deadlines = (appsData?.applications || [])
                              .map(a => ({ uni: a.university.name, d: a.university.deadline }))
                              .filter(x => x.d && x.d > Date.now() / 1000)
                              .sort((a, b) => a.d! - b.d!);
                            return deadlines.length ? <div className="text-[9px] text-rose-600/70 mt-0.5 line-clamp-1">{deadlines[0].uni}</div> : null;
                          })()}
                        </div>
                      </div>
                    {/* Communication timeline — anyone can pick up the case */}
                    <div className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">💬 Communication Log</h4>
                        <div className="flex gap-1.5">
                          <select value={noteChannel} onChange={(e) => setNoteChannel(e.target.value as any)} className="border border-brand-navy/10 bg-white rounded px-1.5 py-1 text-[9px] text-brand-navy outline-none cursor-pointer font-bold [&>option]:bg-white">
                            <option value="note">Note</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="email">Email</option>
                          </select>
                          <input
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && noteText.trim()) logNoteMutation.mutate({ channel: noteChannel, body: noteText.trim() }); }}
                            placeholder="Log a call / note… (Enter to save)"
                            className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-[10px] text-brand-navy outline-none focus:border-brand-gold w-56"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {(clientDetails?.timeline || []).slice(0, 8).map((c: any) => (
                          <div key={c.id} className="flex items-start gap-2 text-[10px]">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${c.channel === 'whatsapp' ? 'bg-emerald-500/15 text-emerald-700' : c.channel === 'email' ? 'bg-blue-500/15 text-blue-700' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{c.channel}</span>
                            <span className="text-brand-navy/70 flex-1">{c.body}</span>
                            <span className="text-brand-navy/30 shrink-0">{c.senderName || 'client'} · {new Date(c.createdAt * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          </div>
                        ))}
                        {(clientDetails?.timeline || []).length === 0 && (
                          <p className="text-[10px] text-brand-navy/40 italic">No communication logged yet. Log your first call above.</p>
                        )}
                      </div>
                    </div>

                    {/* Internal notes — staff-only */}
                    <div className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">📝 Internal Notes</h4>
                        <button
                          onClick={() => {
                            if (notesDirty) {
                              updateStudentMutation.mutate({ id: selectedStudent.id, payload: { notes: studentNotes } });
                              setNotesDirty(false);
                            }
                          }}
                          disabled={!notesDirty}
                          className={`text-[9px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${notesDirty ? 'bg-brand-gold text-brand-navy hover:bg-brand-gold/90' : 'bg-brand-navy/[0.04] text-brand-navy/30 cursor-not-allowed'}`}
                        >
                          {notesDirty ? 'Save Notes ✓' : 'Saved'}
                        </button>
                      </div>
                      <textarea
                        value={studentNotes}
                        onChange={(e) => { setStudentNotes(e.target.value); setNotesDirty(true); }}
                        rows={3}
                        placeholder="Special notes about this student — preferences, concerns, family context, anything the team should know. (Visible to staff only, never to the student.)"
                        className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold resize-y"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5">
                        <div className="flex justify-between items-center border-b border-brand-navy/[0.08] pb-2">
                          <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Academic Profile</h4>
                          <button
                            onClick={() => {
                              if (isEditingAcademic) {
                                // Save
                                const existingContext = selectedStudent.intakeContext ? JSON.parse(selectedStudent.intakeContext) : {};
                                const updatedContext = {
                                  ...existingContext,
                                  cgpa,
                                  englishTest,
                                  englishScore,
                                  targetIntake,
                                  targetCountry,
                                  tuitionBudget,
                                  appRefNo,
                                  portalEmail,
                                  casLetterStatus,
                                  kanbanState: existingContext.kanbanState || 'shortlisted'
                                };
                                updateStudentMutation.mutate({
                                  id: selectedStudent.id,
                                  payload: { intakeContext: JSON.stringify(updatedContext) }
                                });
                              } else {
                                setIsEditingAcademic(true);
                              }
                            }}
                            className="text-brand-navy hover:text-brand-gold font-bold transition-all cursor-pointer"
                          >
                            {isEditingAcademic ? 'Save Changes ✓' : 'Edit Profile ✎'}
                          </button>
                        </div>

                        <div className="space-y-3.5">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">Highest Qualification:</span>
                            <span className="font-bold text-brand-navy uppercase">{selectedStudent.highestQualification}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">CGPA (Scale 10.0):</span>
                            {isEditingAcademic ? (
                              <input
                                type="text"
                                value={cgpa}
                                onChange={(e) => setCgpa(e.target.value)}
                                className="border border-brand-navy/10 rounded px-2.5 py-1 text-right w-20 bg-white text-brand-navy outline-none focus:border-brand-gold"
                              />
                            ) : (
                              <span className="font-bold text-brand-navy">{cgpa}</span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">English Test Choice:</span>
                            {isEditingAcademic ? (
                              <div className="flex gap-2">
                                {['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Cambridge'].map(t => (
                                  <label key={t} className="flex items-center gap-1 font-semibold cursor-pointer">
                                    <input
                                      type="radio"
                                      name="englishTest"
                                      checked={englishTest === t}
                                      onChange={() => setEnglishTest(t)}
                                      className="h-3.5 w-3.5 accent-brand-gold"
                                    />
                                    {t}
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <span className="font-bold text-brand-navy">{englishTest}</span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">Test Band / Score:</span>
                            {isEditingAcademic ? (
                              <input
                                type="text"
                                value={englishScore}
                                onChange={(e) => setEnglishScore(e.target.value)}
                                className="border border-brand-navy/10 rounded px-2.5 py-1 text-right w-24 bg-white text-brand-navy outline-none focus:border-brand-gold"
                              />
                            ) : (
                              <span className="font-bold text-brand-navy">{englishScore}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-5">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px] border-b border-brand-navy/[0.08] pb-2">Target Preferences</h4>
                        
                        <div className="space-y-3.5">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">Target Intake Term:</span>
                            {isEditingAcademic ? (
                              <select
                                value={targetIntake}
                                onChange={(e) => setTargetIntake(e.target.value)}
                                className="border border-brand-navy/10 rounded px-2.5 py-1 bg-white text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                              >
                                <option value="Fall 2026">Fall 2026</option>
                                <option value="Spring 2027">Spring 2027</option>
                                <option value="Fall 2027">Fall 2027</option>
                              </select>
                            ) : (
                              <span className="font-bold text-brand-navy">{targetIntake}</span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">Primary Country Interest:</span>
                            {isEditingAcademic ? (
                              <select
                                value={targetCountry}
                                onChange={(e) => setTargetCountry(e.target.value)}
                                className="border border-brand-navy/10 rounded px-2.5 py-1 bg-white text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                              >
                                <option value="UK">United Kingdom</option>
                                <option value="US">United States</option>
                                <option value="Canada">Canada</option>
                                <option value="Germany">Germany</option>
                              </select>
                            ) : (
                              <span className="font-bold text-brand-navy">{targetCountry}</span>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/40">Annual Tuition Budget (Lakhs):</span>
                            {isEditingAcademic ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  value={tuitionBudget}
                                  onChange={(e) => setTuitionBudget(e.target.value)}
                                  className="border border-brand-navy/10 rounded px-2.5 py-1 text-right w-20 bg-white text-brand-navy outline-none focus:border-brand-gold"
                                />
                                <span className="font-bold text-brand-navy/50">LPA</span>
                              </div>
                            ) : (
                              <span className="font-bold text-brand-gold">₹{tuitionBudget} LPA</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                  )}

                  {activeTab === 'shortlist' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Applications ({appsData?.applications?.length || 0})</h4>
                        <button
                          onClick={() => setShowAppModal(true)}
                          className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
                        >
                          + New Application
                        </button>
                      </div>

                      {/* Per-student mini-pipeline: this student's applications across the lifecycle */}
                      <div className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40 mb-2">🎯 {selectedStudent?.name.split(' ')[0]}'s Pipeline</div>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                          {APP_COLUMNS.map(col => {
                            const count = (appsData?.applications || []).filter(a => a.status === col.key).length;
                            return (
                              <div key={col.key} className={`rounded-lg border p-2 text-center ${count > 0 ? 'border-brand-gold/50 bg-brand-gold/[0.06]' : 'border-brand-navy/[0.06] bg-brand-navy/[0.02]'}`}>
                                <div className={`text-[8px] font-bold uppercase tracking-wider ${count > 0 ? 'text-brand-navy' : 'text-brand-navy/30'}`}>{col.title}</div>
                                <div className={`font-display font-extrabold text-sm mt-0.5 ${count > 0 ? 'text-brand-gold' : 'text-brand-navy/30'}`}>{count}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {appsData?.applications?.length === 0 && (
                        <div className="rounded-xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
                          No applications yet. Create one with the application modal — fill the university snapshot and the compatibility badge updates live.
                        </div>
                      )}

                      <div className="space-y-3">
                        {(appsData?.applications || []).map(app => {
                          const next = NEXT_STATUSES[app.status] || [];
                          const docs = app.docsChecklist || {};
                          const docsDone = Object.values(docs).filter(v => v === 'verified' || v === 'received').length;
                          const docsTotal = Object.keys(docs).length;
                          return (
                            <div key={app.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3">
                              {/* Header */}
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-brand-navy text-sm">{app.university.name}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${TIER_STYLE[app.match.tier]}`}>{TIER_LABEL[app.match.tier]} {app.match.score}</span>
                                  </div>
                                  <div className="text-[10px] text-brand-navy/40 mt-0.5">
                                    {app.university.country}{app.university.city ? ` · ${app.university.city}` : ''} · {app.university.program} · {app.university.degreeLevel} · {app.university.intake}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {deadlineChip(app.university.deadline)}
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${APP_COLUMNS.find(c => c.key === app.status)?.color || 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{APP_STATUS_LABEL[app.status] || app.status}</span>
                                </div>
                              </div>

                              {/* Match reasons */}
                              {app.match.reasons.length > 0 && (
                                <div className="text-[9px] text-brand-navy/50 bg-brand-navy/[0.03] rounded-lg px-2.5 py-1.5">{app.match.reasons.join(' · ')}</div>
                              )}

                              {/* Docs checklist */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">Document checklist {docsTotal > 0 && `(${docsDone}/${docsTotal})`}</span>
                                  {docsTotal > 0 && <div className="flex-1 h-1 rounded bg-brand-navy/[0.08] overflow-hidden ml-3"><div className="h-full bg-brand-gold" style={{ width: `${Math.round((docsDone / docsTotal) * 100)}%` }} /></div>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {DOC_KEYS.map(k => (
                                    <button
                                      key={k}
                                      onClick={() => {
                                        const cur = docs[k] || 'missing';
                                        const nextState = cur === 'missing' ? 'received' : cur === 'received' ? 'verified' : 'missing';
                                        updateAppDocsMutation.mutate({ id: app.id, docs: { [k]: nextState } });
                                      }}
                                      title={`${DOC_LABEL[k]}: ${docs[k] || 'missing'} — click to cycle`}
                                      className={`px-2 py-0.5 rounded text-[9px] font-bold border cursor-pointer transition-all ${(docs[k] || 'missing') === 'verified' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-200' : (docs[k] || 'missing') === 'received' ? 'bg-blue-500/15 text-blue-700 border-blue-200' : 'bg-brand-navy/[0.04] text-brand-navy/40 border-brand-navy/10'}`}
                                    >
                                      {DOC_LABEL[k]}: {docs[k] || 'missing'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Offer panel */}
                              {app.status === 'offer_letter' && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">📬 Offer Letter</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${app.offer.offerDecision === 'accepted' ? 'bg-emerald-500/15 text-emerald-700' : app.offer.offerDecision === 'declined' ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-700'}`}>{app.offer.offerDecision}</span>
                                  </div>
                                  <div className="text-[10px] text-brand-navy/70 space-y-0.5">
                                    <div>Type: <b>{app.offer.offerType || '—'}</b>{app.offer.offerLetterKey && <span className="ml-2 text-brand-gold font-bold">📄 uploaded</span>}</div>
                                    {app.offer.offerConditions.length > 0 && <div>Conditions: {app.offer.offerConditions.join('; ')}</div>}
                                    <div className="flex flex-wrap gap-x-4">
                                      <span>Accept by: <b>{fmtDate(app.offer.acceptanceDeadline)}</b> {deadlineChip(app.offer.acceptanceDeadline)}</span>
                                      <span>Deposit: <b>{app.offer.depositAmountPaise ? INR(app.offer.depositAmountPaise) : '—'}</b> by {fmtDate(app.offer.depositDeadline)}</span>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => updateAppOfferMutation.mutate({ id: app.id, payload: { offerDecision: 'accepted' } })}
                                      disabled={app.offer.offerDecision !== 'pending'}
                                      className="bg-emerald-600 text-white text-[9px] font-bold px-3 py-1.5 rounded hover:bg-emerald-700 transition-all cursor-pointer disabled:opacity-40"
                                    >
                                      ✓ Accept Offer
                                    </button>
                                    <button
                                      onClick={() => updateAppOfferMutation.mutate({ id: app.id, payload: { offerDecision: 'declined' } })}
                                      disabled={app.offer.offerDecision !== 'pending'}
                                      className="border border-rose-300 text-rose-600 text-[9px] font-bold px-3 py-1.5 rounded hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40"
                                    >
                                      ✕ Decline
                                    </button>
                                  </div>
                                </div>
                              )}

                              {app.status === 'rejected' && app.rejectionReason && (
                                <div className="rounded-lg bg-rose-500/10 border border-rose-200 p-2.5 text-[10px] text-rose-700">
                                  <b>Rejected:</b> {app.rejectionReason}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center justify-between border-t border-brand-navy/[0.08] pt-2.5">
                                <div className="text-[9px] text-brand-navy/40">
                                  {app.university.applicationFeePaise ? `Fee ${INR(app.university.applicationFeePaise)}` : ''}
                                  {app.university.portalUrl ? ` · Portal: ${app.university.portalUrl}` : ''}
                                </div>
                                <div className="flex items-center gap-2">
                                  {app.status === 'offer_letter' && app.offer.offerDecision === 'pending' && (
                                    <button
                                      onClick={() => {
                                        const type = prompt('Offer type (conditional/unconditional):', 'conditional');
                                        if (!type) return;
                                        const conditions = prompt('Conditions (comma separated):', '') || '';
                                        const days = prompt('Acceptance deadline (days from now):', '14');
                                        updateAppOfferMutation.mutate({
                                          id: app.id,
                                          payload: {
                                            offerType: type === 'unconditional' ? 'unconditional' : 'conditional',
                                            offerConditions: conditions.split(',').map(s => s.trim()).filter(Boolean),
                                            acceptanceDeadline: days ? Math.floor(Date.now() / 1000) + Number(days) * 86400 : undefined,
                                          }
                                        });
                                      }}
                                      className="text-[9px] font-bold text-brand-gold hover:underline cursor-pointer"
                                    >
                                      📄 Record offer details
                                    </button>
                                  )}
                                  {next.length > 0 && (
                                    <select
                                      value={app.status}
                                      onChange={(e) => {
                                        const target = e.target.value;
                                        if (target === 'rejected') {
                                          const reason = prompt('Rejection reason:');
                                          updateAppStatusMutation.mutate({ id: app.id, status: target, rejectionReason: reason || undefined });
                                        } else {
                                          updateAppStatusMutation.mutate({ id: app.id, status: target });
                                        }
                                      }}
                                      className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-[9px] text-brand-navy outline-none cursor-pointer font-bold [&>option]:bg-white"
                                    >
                                      <option value={app.status}>{APP_STATUS_LABEL[app.status] || app.status}</option>
                                      {next.map(n => <option key={n} value={n}>{APP_STATUS_LABEL[n] || n}</option>)}
                                    </select>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'docs' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Admission Checklist / Vault</h4>
                      <div className="rounded-xl border border-brand-navy/10 divide-y divide-brand-navy/[0.08] bg-brand-navy/[0.04]">
                        {[
                          { key: 'transcript', label: '10th, 12th & Degree Transcripts' },
                          { key: 'cv', label: 'Structured Resume / CV' },
                          { key: 'sop', label: 'Statement of Purpose (SOP)' },
                          { key: 'lor1', label: 'Letter of Recommendation 1' },
                          { key: 'lor2', label: 'Letter of Recommendation 2' },
                          { key: 'finance', label: 'Financial Proofs & Statements' }
                        ].map(doc => {
                          const docObj = matchedDocs[doc.key];
                          return (
                            <div key={doc.key} className="p-3.5 flex flex-wrap justify-between items-center gap-2">
                              <div>
                                <span className="font-semibold text-brand-navy/70 block">{doc.label}</span>
                                {docObj && (
                                  <span className="text-[9px] text-brand-navy/50 block font-mono">{docObj.fileName}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {docObj ? (
                                  <>
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                      Uploaded ✓
                                    </span>
                                    <a
                                      href={`/api/clients/${selectedStudent.id}/documents/${docObj.id}/download`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] text-brand-gold hover:underline font-bold"
                                    >
                                      Download 📥
                                    </a>
                                    {docObj.status === 'pending' && (
                                      <div className="flex gap-1.5">
                                        <button
                                          onClick={() => reviewDocMutation.mutate({ docId: docObj.id, status: 'verified' })}
                                          className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-1 rounded hover:bg-emerald-700 transition-all cursor-pointer"
                                        >
                                          ✓ Approve
                                        </button>
                                        <button
                                          onClick={() => { if (confirm('Reject this document?')) reviewDocMutation.mutate({ docId: docObj.id, status: 'rejected' }); }}
                                          className="border border-rose-300 text-rose-600 text-[9px] font-bold px-2 py-1 rounded hover:bg-rose-50 transition-all cursor-pointer"
                                        >
                                          ✕ Reject
                                        </button>
                                      </div>
                                    )}
                                    {docObj.status === 'verified' && (
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">✓ Verified</span>
                                    )}
                                    {docObj.status === 'rejected' && (
                                      <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">✕ Rejected</span>
                                    )}
                                  </>
                                ) : (
                                  <input
                                    type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadDoc(doc.key, file);
                                    }}
                                    className="text-[10px] text-brand-navy/40 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-brand-gold/15 file:text-brand-navy hover:file:bg-brand-gold/25 cursor-pointer"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'apps' && (
                    <div className="space-y-4 rounded-xl border border-brand-navy/10 bg-white p-5 backdrop-blur-sm">
                      <div className="flex justify-between items-center pb-2 border-b border-brand-navy/10">
                        <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Admission Portal Tracking</h4>
                        <button
                          onClick={() => {
                            const existingContext = selectedStudent.intakeContext ? JSON.parse(selectedStudent.intakeContext) : {};
                            const updatedContext = {
                              ...existingContext,
                              appRefNo,
                              portalEmail,
                              casLetterStatus
                            };
                            updateStudentMutation.mutate({
                              id: selectedStudent.id,
                              payload: { intakeContext: JSON.stringify(updatedContext) }
                            });
                            alert('Credentials saved successfully!');
                          }}
                          className="bg-brand-gold text-brand-navy font-bold hover:bg-brand-gold/90 px-3 py-1 rounded-lg transition-colors cursor-pointer text-[10px]"
                        >
                          Save Credentials ✓
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="font-semibold text-brand-navy/40">Application Reference No.</label>
                          <input
                            type="text"
                            placeholder="e.g. UCAS-849102"
                            value={appRefNo}
                            onChange={(e) => setAppRefNo(e.target.value)}
                            className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-semibold text-brand-navy/40">Portal Login Email</label>
                          <input
                            type="text"
                            placeholder="jilnar009@gmail.com"
                            value={portalEmail}
                            onChange={(e) => setPortalEmail(e.target.value)}
                            className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-semibold text-brand-navy/40">Portal Credentials</label>
                          <div className="rounded border border-brand-navy/10 bg-brand-navy/[0.03] px-3 py-1.5 text-[10px] text-brand-navy/50">
                            🔒 Passwords stay in your partner tools — never stored in OpusOS.
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-semibold text-brand-navy/40">Visa CAS Letter Status</label>
                          <select
                            value={casLetterStatus}
                            onChange={(e) => setCasLetterStatus(e.target.value)}
                            className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold cursor-pointer"
                          >
                            <option value="Awaiting Document">Awaiting Document</option>
                            <option value="CAS Draft Reviewed">CAS Draft Reviewed</option>
                            <option value="CAS Issued">CAS Issued</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic text-center py-12">No students registered. Click "+ Add Student" to start.</p>
            )}
          </div>
        </div>
      ) : (
        /* ── Application Pipeline (Phase 4) ── */
        <div className="space-y-4">
          {/* Pipeline Health strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">Total Applications</div>
              <div className="font-display font-extrabold text-brand-navy text-xl mt-1">{pipelineData?.total ?? 0}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-widest text-amber-700">🪨 Stuck (&gt;7d)</div>
              <div className="font-display font-extrabold text-amber-700 text-xl mt-1">{pipelineData?.stuck.length ?? 0}</div>
              {pipelineData && pipelineData.stuck.length > 0 && (
                <div className="text-[9px] text-amber-700/70 mt-1 line-clamp-1">{pipelineData.stuck.map(s => s.university).join(', ')}</div>
              )}
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">📬 Decisions Pending</div>
              <div className="font-display font-extrabold text-emerald-700 text-xl mt-1">{pipelineData?.decisionsPending.length ?? 0}</div>
              {pipelineData && pipelineData.decisionsPending.length > 0 && (
                <div className="text-[9px] text-emerald-700/70 mt-1 line-clamp-1">{pipelineData.decisionsPending.map(d => d.university).join(', ')}</div>
              )}
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-widest text-rose-600">🔥 Deadlines This Week</div>
              <div className="font-display font-extrabold text-rose-600 text-xl mt-1">{pipelineData?.deadlinesSoon.length ?? 0}</div>
              {pipelineData && pipelineData.deadlinesSoon.length > 0 && (
                <div className="text-[9px] text-rose-600/70 mt-1 line-clamp-1">{pipelineData.deadlinesSoon.map(d => `${d.university} (${d.kind})`).join(', ')}</div>
              )}
            </div>
          </div>

          {/* Filters + New Application */}
          <div className="flex flex-wrap items-center gap-2">
            <input value={appFilter.country} onChange={e => setAppFilter(f => ({ ...f, country: e.target.value }))} placeholder="🌍 Filter country…" className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[10px] text-brand-navy outline-none focus:border-brand-gold w-36" />
            <input value={appFilter.intake} onChange={e => setAppFilter(f => ({ ...f, intake: e.target.value }))} placeholder="🎓 Filter intake…" className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[10px] text-brand-navy outline-none focus:border-brand-gold w-36" />
            <select value={appFilter.tier} onChange={e => setAppFilter(f => ({ ...f, tier: e.target.value }))} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[10px] text-brand-navy outline-none cursor-pointer">
              <option value="">All tiers</option>
              <option value="match">✓ Match</option>
              <option value="reach">⚠ Reach</option>
              <option value="safe">★ Safe</option>
            </select>
            <button
              onClick={() => { if (!selectedStudent) { alert('Select a student first (Student Profiles tab).'); return; } setShowAppModal(true); }}
              className="ml-auto bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
            >
              + New Application
            </button>
          </div>

          {/* Columns */}
          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-3 overflow-x-auto pb-4">
            {APP_COLUMNS.map(col => {
              const colApps = (globalAppsData?.applications || []).filter(a => {
                if (a.status !== col.key) return false;
                if (appFilter.country && !(a.university.country || '').toLowerCase().includes(appFilter.country.toLowerCase())) return false;
                if (appFilter.intake && !(a.university.intake || '').toLowerCase().includes(appFilter.intake.toLowerCase())) return false;
                if (appFilter.tier && a.match.tier !== appFilter.tier) return false;
                return true;
              });
              return (
                <div key={col.key} className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-2xl p-3 flex flex-col gap-2.5 min-w-[220px] max-h-[640px] overflow-y-auto">
                  <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                    <h3 className={`font-bold text-[10px] px-2 py-0.5 rounded ${col.color}`}>{col.title}</h3>
                    <span className="text-[9px] font-bold text-brand-navy/40">{colApps.length}</span>
                  </div>
                  <div className="space-y-2.5 flex-1">
                    {colApps.map(app => {
                      const student = students.find(s => s.id === app.clientId);
                      const next = NEXT_STATUSES[app.status] || [];
                      const docsDone = Object.values(app.docsChecklist || {}).filter(v => v === 'verified' || v === 'received').length;
                      const docsTotal = Object.keys(app.docsChecklist || {}).length;
                      return (
                        <div key={app.id} className="bg-white border border-brand-navy/10 rounded-xl p-3 shadow-sm hover:border-brand-gold/60 transition-all space-y-2">
                          <div className="flex justify-between items-start gap-1">
                            <div className="min-w-0">
                              <div className="font-bold text-brand-navy text-[10px] leading-tight line-clamp-1">{app.university.name}</div>
                              <div className="text-[9px] text-brand-navy/40">{app.university.country} · {app.university.intake}</div>
                            </div>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold ${TIER_STYLE[app.match.tier]}`}>{TIER_LABEL[app.match.tier]} {app.match.score}</span>
                          </div>
                          <div className="text-[9px] text-brand-navy/60 font-semibold line-clamp-1">{app.university.program}</div>
                          <div className="flex flex-wrap items-center gap-1">
                            {student && <span className="px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/60 text-[8px] font-bold line-clamp-1 max-w-[110px]">{student.name}</span>}
                            {deadlineChip(app.university.deadline)}
                            {app.offer.offerDecision === 'pending' && app.status === 'offer_letter' && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 text-[8px] font-bold">📬 decision</span>}
                          </div>
                          {docsTotal > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 rounded bg-brand-navy/[0.08] overflow-hidden"><div className="h-full bg-brand-gold" style={{ width: `${Math.round((docsDone / docsTotal) * 100)}%` }} /></div>
                              <span className="text-[8px] text-brand-navy/40 font-bold">{docsDone}/{docsTotal} docs</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center border-t border-brand-navy/[0.08] pt-2">
                            <button
                              onClick={() => { if (student) handleStudentSelect(student); setViewMode('profiles'); setActiveTab('apps'); }}
                              className="text-[9px] font-bold text-brand-gold hover:underline cursor-pointer"
                            >
                              View ➔
                            </button>
                            {next.length > 0 ? (
                              <select
                                value={app.status}
                                onChange={(e) => {
                                  const target = e.target.value;
                                  if (target === 'rejected') {
                                    const reason = prompt('Rejection reason:');
                                    updateAppStatusMutation.mutate({ id: app.id, status: target, rejectionReason: reason || undefined });
                                  } else {
                                    updateAppStatusMutation.mutate({ id: app.id, status: target });
                                  }
                                }}
                                className="border border-brand-navy/10 bg-white rounded px-1.5 py-0.5 text-[8px] text-brand-navy outline-none cursor-pointer font-bold [&>option]:bg-white"
                              >
                                <option value={app.status}>{APP_STATUS_LABEL[app.status] || app.status}</option>
                                {next.map(n => <option key={n} value={n}>{APP_STATUS_LABEL[n] || n}</option>)}
                              </select>
                            ) : (
                              <span className="text-[8px] font-bold text-brand-navy/30 uppercase">{app.status}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {colApps.length === 0 && <p className="text-[9px] text-brand-navy/40 italic py-4 text-center">No applications.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent-assisted intake wizard */}
      {showIntakeWizard && selectedStudent && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8">
            <StudentProfileWizard
              initial={studentProfile(selectedStudent)}
              highestQualification={selectedStudent.highestQualification}
              title={`📝 Intake Wizard — ${selectedStudent.name}`}
              onClose={() => setShowIntakeWizard(false)}
              onSave={(profile) => {
                const existing = selectedStudent.intakeContext ? JSON.parse(selectedStudent.intakeContext) : {};
                updateStudentMutation.mutate({
                  id: selectedStudent.id,
                  payload: { intakeContext: JSON.stringify({ ...existing, ...profile }) }
                });
                setShowIntakeWizard(false);
              }}
              saving={updateStudentMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* New Application modal (snapshot model) */}
      {showAppModal && selectedStudent && (
        <StudyAbroadApplicationModal
          profile={studentProfile(selectedStudent)}
          onClose={() => setShowAppModal(false)}
          onCreate={(snapshot) => createAppMutation.mutate(snapshot)}
          creating={createAppMutation.isPending}
        />
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-250">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs animate-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Add New Student Profile</h3>
              <button onClick={() => setShowAddStudent(false)} className="text-brand-navy/50 hover:text-brand-navy/40 text-lg cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Saurabh Sen"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. saurabh@gmail.com"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={newStudentPhone}
                  onChange={(e) => setNewStudentPhone(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:border-brand-gold bg-brand-navy/[0.04]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Highest Qualification</label>
                <select
                  value={newStudentQual}
                  onChange={(e) => setNewStudentQual(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                >
                  <option value="high_school">High School Diploma</option>
                  <option value="undergrad">Undergraduate Degree</option>
                  <option value="postgrad">Postgraduate Degree</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40">Nationality / Region</label>
                <input
                  list="nationalities"
                  value={newStudentNation}
                  onChange={(e) => setNewStudentNation(e.target.value)}
                  placeholder="Type or pick — India, UAE, Nigeria…"
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold"
                />
                <datalist id="nationalities">
                  {['India 🇮🇳', 'UAE 🇦🇪', 'Oman 🇴🇲', 'Qatar 🇶🇦', 'Saudi Arabia 🇸🇦', 'Kuwait 🇰🇼', 'Bahrain 🇧🇭', 'Nepal 🇳🇵', 'Bangladesh 🇧🇩', 'Sri Lanka 🇱🇰', 'Pakistan 🇵🇰', 'Nigeria 🇳🇬', 'Kenya 🇰🇪', 'Ethiopia 🇪🇹', 'Egypt 🇪🇬', 'South Africa 🇿🇦', 'Philippines 🇵🇭', 'Indonesia 🇮🇩', 'Vietnam 🇻🇳', 'Malaysia 🇲🇾', 'Singapore 🇸🇬', 'China 🇨🇳', 'Brazil 🇧🇷', 'Mexico 🇲🇽', 'Other 🌍'].map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddStudent(false)}
                className="flex-1 bg-brand-navy/[0.06] border border-brand-navy/10 hover:bg-brand-navy/[0.06] py-2 rounded-lg font-bold text-brand-navy/40 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  createStudentMutation.mutate({
                    name: newStudentName,
                    email: newStudentEmail,
                    phone: newStudentPhone,
                    highestQualification: newStudentQual,
                    primaryDivision: 'study-abroad',
                    intakeContext: JSON.stringify({
                      nationality: newStudentNation,
                      kanbanState: 'Shortlisted'
                    })
                  });
                }}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-250">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-80 shadow-lg space-y-4 text-xs animate-in zoom-in-95 duration-250">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Add Kanban Card</h3>
              <button onClick={() => { setShowAddCard(null); setSelectedClientForCard(''); setSelectedUniForCard(''); }} className="text-brand-navy/50 hover:text-brand-navy/40 text-lg cursor-pointer">✕</button>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-brand-navy/40">Select Student</label>
              <select
                value={selectedClientForCard}
                onChange={(e) => setSelectedClientForCard(e.target.value)}
                className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
              >
                <option value="">-- Choose student --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-brand-navy/40">Select University / Course</label>
              <select
                value={selectedUniForCard}
                onChange={(e) => setSelectedUniForCard(e.target.value)}
                className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
              >
                <option value="">-- Choose university --</option>
                {(universitiesData?.universities || []).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.country})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowAddCard(null); setSelectedClientForCard(''); setSelectedUniForCard(''); }}
                className="flex-1 bg-brand-navy/[0.06] border border-brand-navy/10 hover:bg-brand-navy/[0.06] py-2 rounded-lg font-bold text-brand-navy/40 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedClientForCard && selectedUniForCard && showAddCard) {
                    shortlistMutation.mutate({
                      clientId: selectedClientForCard,
                      universityId: selectedUniForCard,
                      status: showAddCard,
                      notes: 'Added from Kanban Board'
                    });
                    setShowAddCard(null);
                    setSelectedClientForCard('');
                    setSelectedUniForCard('');
                  }
                }}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all"
                disabled={!selectedClientForCard || !selectedUniForCard}
              >
                Place Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
