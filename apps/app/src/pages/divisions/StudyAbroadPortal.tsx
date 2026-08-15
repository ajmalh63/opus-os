import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
  highestQualification: string;
  intakeContext?: string; // stringified JSON
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

interface ShortlistEntry {
  id: string;
  clientId: string;
  universityId: string;
  status: 'pending' | 'applied' | 'admitted' | 'rejected' | 'cancelled';
  notes: string | null;
  universityName?: string;
  country?: string;
  intake?: string;
}

export default function StudyAbroadPortal() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'profiles' | 'kanban'>('profiles');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses' | 'shortlist' | 'docs' | 'apps'>('overview');
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
  const [portalPassword, setPortalPassword] = useState('');
  const [casLetterStatus, setCasLetterStatus] = useState('Awaiting Document');

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
        setPortalPassword(parsed.portalPassword || '');
        setCasLetterStatus(parsed.casLetterStatus || 'Awaiting Document');
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
        setPortalPassword('');
        setCasLetterStatus('Awaiting Document');
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
      setPortalPassword('');
      setCasLetterStatus('Awaiting Document');
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

  // Shortlist queries
  const { data: shortlistData } = useQuery<{ shortlist: ShortlistEntry[] }>({
    queryKey: ['shortlist', selectedStudent?.id],
    queryFn: async () => {
      if (!selectedStudent) return { shortlist: [] };
      const r = await fetch(`/api/study-abroad/shortlist?clientId=${selectedStudent.id}`);
      if (!r.ok) throw new Error('Shortlist fetch failed');
      return r.json();
    },
    enabled: !!selectedStudent
  });

  // Global shortlist query (for the Kanban board cards)
  const { data: globalShortlistData } = useQuery<{ shortlist: ShortlistEntry[] }>({
    queryKey: ['globalShortlist'],
    queryFn: async () => {
      const r = await fetch('/api/study-abroad/shortlist');
      if (!r.ok) throw new Error('Global shortlist fetch failed');
      return r.json();
    }
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

  const { data: matchingUnisData } = useQuery<{ matches: University[] }>({
    queryKey: ['uniMatches', selectedStudent?.id],
    queryFn: async () => {
      if (!selectedStudent) return { matches: [] };
      const r = await fetch(`/api/study-abroad/universities/match?clientId=${selectedStudent.id}`);
      if (!r.ok) throw new Error('Uni matches failed');
      return r.json();
    },
    enabled: !!selectedStudent
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

  const deleteShortlistMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/study-abroad/shortlist/${id}`, {
        method: 'DELETE'
      });
      if (!r.ok) throw new Error('Failed to delete shortlist entry');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalShortlist'] });
    }
  });

  const updateShortlistStatusMutation = useMutation({
    mutationFn: async ({ entryId, status }: { entryId: string; status: string }) => {
      const r = await fetch(`/api/study-abroad/shortlist/${entryId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Failed to update status');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist', selectedStudent?.id] });
      queryClient.invalidateQueries({ queryKey: ['globalShortlist'] });
      queryClient.invalidateQueries({ queryKey: ['kanbanCards'] });
    }
  });

  // Kanban Board Columns (aligned to the backend enum status constraints)
  const kanbanColumns = [
    { key: 'shortlisted', title: 'Shortlisted' },
    { key: 'docs_uploaded', title: 'Docs Uploaded' },
    { key: 'submitted', title: 'Submitted' },
    { key: 'offer_letter', title: 'Offer Letter' },
    { key: 'enrolled', title: 'Enrolled' }
  ];

  const getStudentGPA = (s: Student) => {
    if (!s.intakeContext) return 'N/A';
    try {
      const parsed = JSON.parse(s.intakeContext);
      return parsed.cgpa || 'N/A';
    } catch {
      return 'N/A';
    }
  };

  const getStudentEnglishScore = (s: Student) => {
    if (!s.intakeContext) return 'N/A';
    try {
      const parsed = JSON.parse(s.intakeContext);
      return `${parsed.englishTest || 'IELTS'}: ${parsed.englishScore || 'N/A'}`;
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
                      onClick={() => setActiveTab('courses')}
                      title="Eligibility calculator"
                      className="p-2 border border-brand-navy/10 rounded-xl hover:border-brand-gold hover:bg-brand-navy/[0.06] transition-all cursor-pointer"
                    >
                      🎓
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
                    { key: 'courses', label: 'Course Search' },
                    { key: 'shortlist', label: 'Shortlist Courses' },
                    { key: 'docs', label: 'Documents' },
                    { key: 'apps', label: 'Applications' }
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
                                  portalPassword,
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
                                {['IELTS', 'TOEFL', 'PTE'].map(t => (
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
                  )}

                  {activeTab === 'courses' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Eligible Course Matches</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {matchingUnisData?.matches?.map((uni) => (
                          <div key={uni.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm flex justify-between items-start hover:border-brand-gold/60 transition-all">
                            <div className="space-y-1">
                              <div className="font-bold text-brand-navy">{uni.name}</div>
                              <div className="text-[10px] text-brand-navy/50">{uni.country} • Intake: {uni.intake}</div>
                              <div className="text-[10px] font-semibold text-brand-navy/40">Min GPA: {uni.minGpa} • IELTS: {uni.ieltsMin}</div>
                            </div>
                            <button
                              onClick={() => shortlistMutation.mutate({ universityId: uni.id })}
                              className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
                            >
                              Shortlist
                            </button>
                          </div>
                        ))}
                        {matchingUnisData?.matches?.length === 0 && (
                          <p className="text-brand-navy/50 italic py-6">No matching universities found for this profile criteria.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'shortlist' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-brand-navy uppercase tracking-wider text-[10px]">Student Shortlisted Courses</h4>
                      <div className="rounded-xl border border-brand-navy/10 divide-y divide-brand-navy/[0.08] bg-brand-navy/[0.04]">
                        {shortlistData?.shortlist?.map((entry) => (
                          <div key={entry.id} className="p-3.5 flex justify-between items-center hover:bg-brand-navy/[0.04]">
                            <div>
                              <div className="font-bold text-brand-navy">{entry.universityName}</div>
                              <div className="text-[10px] text-brand-navy/50 mt-0.5">{entry.country} • Intake: {entry.intake}</div>
                            </div>
                            <div className="flex gap-2 items-center">
                              <select
                                value={entry.status}
                                onChange={(e) => updateShortlistStatusMutation.mutate({ entryId: entry.id, status: e.target.value })}
                                className="border border-brand-navy/10 bg-white rounded px-2.5 py-1 text-[11px] font-semibold text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                              >
                                <option value="shortlisted">Shortlisted</option>
                                <option value="docs_uploaded">Docs Uploaded</option>
                                <option value="submitted">Submitted</option>
                                <option value="offer_letter">Offer Letter</option>
                                <option value="enrolled">Enrolled</option>
                                <option value="rejected">Rejected</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                          </div>
                        ))}
                        {shortlistData?.shortlist?.length === 0 && (
                          <p className="text-brand-navy/50 italic py-6 text-center">No shortlisted universities yet. Go to Course Search to add.</p>
                        )}
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
                              portalPassword,
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
                          <label className="font-semibold text-brand-navy/40">Portal Password</label>
                          <input
                            type="text"
                            placeholder="Portal Password"
                            value={portalPassword}
                            onChange={(e) => setPortalPassword(e.target.value)}
                            className="w-full rounded border border-brand-navy/10 bg-white px-3 py-1.5 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
                          />
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
        /* Kanban board view implementation (representing shortlist entries) */
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {kanbanColumns.map(col => {
            const colEntries = (globalShortlistData?.shortlist || []).filter(item => item.status === col.key);
            return (
              <div key={col.key} className="bg-brand-navy/[0.04] border border-brand-navy/10 rounded-2xl p-4 flex flex-col gap-3 min-w-[240px] max-h-[600px] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                  <h3 className="font-bold text-brand-navy text-xs">{col.title} ({colEntries.length})</h3>
                  <button
                    onClick={() => setShowAddCard(col.key)}
                    className="h-5 w-5 bg-brand-navy/[0.05] border border-brand-navy/10 hover:border-brand-gold text-brand-navy/50 hover:text-brand-navy rounded grid place-items-center text-xs cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <div className="space-y-3 flex-1">
                  {colEntries.map(entry => {
                    const student = students.find(s => s.id === entry.clientId);
                    if (!student) return null;
                    return (
                      <div
                        key={entry.id}
                        className="bg-white border border-brand-navy/10 rounded-xl p-4 shadow-sm hover:border-brand-gold/60 transition-all space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-brand-navy text-[11px] line-clamp-1">{student.name}</span>
                            <span className="text-[9px] text-brand-navy/50 font-mono">#{student.id.split('-').pop()}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete/deprecate this shortlisted course card?')) {
                                deleteShortlistMutation.mutate(entry.id);
                              }
                            }}
                            title="Delete Card"
                            className="text-[10px] text-brand-navy/40 hover:text-rose-500 font-bold shrink-0 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                        
                        <div className="space-y-1 bg-brand-navy/[0.04] p-2 rounded-lg border border-brand-navy/10">
                          <div className="font-bold text-brand-navy text-[10px] leading-tight">{entry.universityName}</div>
                          <div className="text-[9px] text-brand-navy/40">{entry.country} • {entry.intake}</div>
                        </div>

                        <div className="flex flex-wrap gap-1 text-[9px] font-semibold">
                          <span className="bg-brand-navy/[0.06] text-brand-navy/60 rounded px-1.5 py-0.5 border border-brand-navy/10">{getStudentEnglishScore(student)}</span>
                          <span className="bg-brand-navy/[0.06] text-brand-navy/60 rounded px-1.5 py-0.5 border border-brand-navy/10">GPA: {getStudentGPA(student)}</span>
                        </div>

                        <div className="flex justify-between items-center border-t border-brand-navy/[0.08] pt-2.5 mt-2">
                          <button
                            onClick={() => {
                              handleStudentSelect(student);
                              setViewMode('profiles');
                            }}
                            className="text-[10px] font-bold text-brand-gold hover:underline cursor-pointer"
                          >
                            View Details ➔
                          </button>
                          <select
                            value={col.key}
                            onChange={(e) => updateShortlistStatusMutation.mutate({ entryId: entry.id, status: e.target.value })}
                            className="border border-brand-navy/10 bg-white rounded px-1.5 py-0.5 text-[9px] text-brand-navy outline-none cursor-pointer font-bold [&>option]:bg-white"
                          >
                            {kanbanColumns.map(c => (
                              <option key={c.key} value={c.key}>{c.title}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {colEntries.length === 0 && (
                    <p className="text-[10px] text-brand-navy/50 italic py-6 text-center">No cards in column.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                <select
                  value={newStudentNation}
                  onChange={(e) => setNewStudentNation(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                >
                  <option value="India 🇮🇳">India 🇮🇳</option>
                  <option value="UAE 🇦🇪">UAE 🇦🇪</option>
                  <option value="Oman 🇴🇲">Oman 🇴🇲</option>
                  <option value="Qatar 🇶🇦">Qatar 🇶🇦</option>
                </select>
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
