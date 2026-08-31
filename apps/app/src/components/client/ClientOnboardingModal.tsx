import React, { useState, useEffect } from 'react';

const API = (import.meta as any).env?.VITE_API_URL || '';

export interface ClientOnboardingModalProps {
  token: string;
  initialStepKey?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STEP_TABS = [
  { key: 'profile', label: '1. Personal Profile', subtitle: 'Name, phone & location' },
  { key: 'passport', label: '2. Passport Details', subtitle: 'Number & validity' },
  { key: 'education', label: '3. Education', subtitle: 'Degree & qualifications' },
  { key: 'intent', label: '4. Destination & Goals', subtitle: 'Target country & intake' },
];

export const ClientOnboardingModal: React.FC<ClientOnboardingModalProps> = ({
  token,
  initialStepKey = 'profile',
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeStep, setActiveStep] = useState<string>(initialStepKey);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Record<string, any>>({
    // Step 1
    name: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    dob: '',
    gender: '',
    // Step 2
    passportStatus: 'valid',
    passportNumber: '',
    passportExpiry: '',
    placeOfIssue: '',
    // Step 3
    highestQualification: 'Bachelor\'s Degree',
    degree: '',
    university: '',
    yearOfPassing: '',
    grade: '',
    // Step 4
    primaryDivision: 'study-abroad',
    intentDivisions: ['study-abroad'],
    targetCountry: '',
    targetIntake: '',
  });

  const [onboardingMeta, setOnboardingMeta] = useState<{
    pct: number;
    steps: Array<{ key: string; label: string; done: boolean }>;
  }>({
    pct: 0,
    steps: [],
  });

  // Load existing profile fields
  useEffect(() => {
    if (!isOpen || !token) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/api/public/portal/onboarding/profile`, {
      headers: { 'X-Portal-Token': token },
    })
      .then((res) => res.json())
      .then((data: any) => {
        if (data.success && data.client) {
          setFormData((prev) => ({
            ...prev,
            ...data.client,
          }));
          if (data.onboarding) {
            setOnboardingMeta(data.onboarding);
          }
        }
      })
      .catch((_err) => {
        setError('Failed to load profile data. Please refresh.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, token]);

  useEffect(() => {
    if (initialStepKey && initialStepKey !== 'welcome') {
      setActiveStep(initialStepKey);
    }
  }, [initialStepKey]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveStep = async (isNext = true) => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);

    let stepPayload: Record<string, any> = {};

    if (activeStep === 'profile') {
      stepPayload = {
        name: formData.name,
        phone: formData.phone,
        city: formData.city,
        state: formData.state,
        dob: formData.dob,
        gender: formData.gender,
      };
    } else if (activeStep === 'passport') {
      stepPayload = {
        status: formData.passportStatus,
        passportNumber: formData.passportStatus === 'valid' || formData.passportStatus === 'in_renewal' ? formData.passportNumber : '',
        passportExpiry: formData.passportStatus === 'valid' ? formData.passportExpiry : '',
        placeOfIssue: formData.placeOfIssue,
      };
    } else if (activeStep === 'education') {
      stepPayload = {
        highestQualification: formData.highestQualification,
        degree: formData.degree,
        university: formData.university,
        yearOfPassing: formData.yearOfPassing,
        grade: formData.grade,
      };
    } else if (activeStep === 'intent') {
      stepPayload = {
        primaryDivision: formData.primaryDivision,
        intentDivisions: formData.intentDivisions,
        targetCountry: formData.targetCountry,
        targetIntake: formData.targetIntake,
      };
    }

    try {
      const res = await fetch(`${API}/api/public/portal/onboarding/save-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Portal-Token': token,
        },
        body: JSON.stringify({
          step: activeStep,
          data: stepPayload,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save onboarding details.');
      }

      if (json.onboarding) {
        setOnboardingMeta(json.onboarding);
      }

      setSaveMessage('✓ Step saved in real-time');
      setTimeout(() => setSaveMessage(null), 3000);

      onSuccess();

      if (isNext) {
        const stepKeys = ['profile', 'passport', 'education', 'intent'];
        const currentIndex = stepKeys.indexOf(activeStep);
        if (currentIndex < stepKeys.length - 1) {
          setActiveStep(stepKeys[currentIndex + 1]);
        } else {
          // Finished all steps
          setTimeout(() => {
            onClose();
          }, 1000);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error saving step.');
    } finally {
      setSaving(false);
    }
  };

  const isStepDone = (key: string) => {
    return !!onboardingMeta.steps.find((s) => s.key === key)?.done;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl border border-brand-gold/30 shadow-2xl overflow-hidden max-w-2xl w-full mx-auto my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0a2d50] via-[#0d3b66] to-[#0a2d50] p-6 text-white relative flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-5 right-5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              ⚡ Real-time Profile Onboarding
            </span>
            <span className="text-white/60 text-xs font-mono">• CRM Synchronized</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">
            Complete Your Journey Profile
          </h2>
          <p className="text-white/80 text-xs sm:text-sm mt-1">
            Fill in your details to activate your profile, calculate visa eligibility, and notify your dedicated counselor.
          </p>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between items-center text-xs text-white/90 mb-1.5 font-medium">
              <span>Overall Progress</span>
              <span className="font-bold text-amber-300">{onboardingMeta.pct}% Complete</span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${onboardingMeta.pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-100 border-b border-slate-200 text-xs font-medium flex-shrink-0">
          {STEP_TABS.map((tab) => {
            const isActive = activeStep === tab.key;
            const isDone = isStepDone(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStep(tab.key)}
                className={`p-3 text-left transition border-b-2 cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'border-[#0a2d50] bg-white text-[#0a2d50] font-bold shadow-sm'
                    : 'border-transparent text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{tab.label}</span>
                  {isDone && <span className="text-emerald-600 font-bold ml-1">✓</span>}
                </div>
                <span className="text-[10px] text-slate-400 font-normal truncate mt-0.5">{tab.subtitle}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <span className="font-bold">✕</span> {error}
            </div>
          )}

          {saveMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
              <span>{saveMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <svg className="animate-spin h-6 w-6 text-brand-navy mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading your profile data...
            </div>
          ) : (
            <>
              {/* STEP 1: PERSONAL PROFILE */}
              {activeStep === 'profile' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Phone Number (+91) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Current City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={(e) => handleChange('city', e.target.value)}
                        placeholder="e.g. Mumbai / Bangalore / Calicut"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        State / Province
                      </label>
                      <input
                        type="text"
                        value={formData.state || ''}
                        onChange={(e) => handleChange('state', e.target.value)}
                        placeholder="e.g. Maharashtra / Kerala"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.dob || ''}
                        onChange={(e) => handleChange('dob', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Gender
                      </label>
                      <select
                        value={formData.gender || ''}
                        onChange={(e) => handleChange('gender', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent bg-white"
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other / Prefer not to say</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: PASSPORT DETAILS */}
              {activeStep === 'passport' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Passport Status
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: 'valid', label: 'Valid Passport' },
                        { key: 'in_renewal', label: 'In Renewal' },
                        { key: 'applied', label: 'Applied / New' },
                        { key: 'no_passport', label: 'No Passport Yet' },
                      ].map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          onClick={() => handleChange('passportStatus', item.key)}
                          className={`p-3 rounded-xl border text-xs font-medium cursor-pointer transition ${
                            formData.passportStatus === item.key
                              ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(formData.passportStatus === 'valid' || formData.passportStatus === 'in_renewal') && (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Passport Number <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.passportNumber || ''}
                            onChange={(e) => handleChange('passportNumber', e.target.value.toUpperCase())}
                            placeholder="e.g. Z1234567"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent uppercase"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Passport Expiry Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={formData.passportExpiry || ''}
                            onChange={(e) => handleChange('passportExpiry', e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Place / Authority of Issue
                        </label>
                        <input
                          type="text"
                          value={formData.placeOfIssue || ''}
                          onChange={(e) => handleChange('placeOfIssue', e.target.value)}
                          placeholder="e.g. RPO Mumbai"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}

                  {formData.passportStatus === 'no_passport' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                      ℹ️ <strong>Note:</strong> You can still explore courses, jobs, and travel packages. Our team will assist you with Indian Tatkaal/Normal passport application guidelines.
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: EDUCATION & QUALIFICATIONS */}
              {activeStep === 'education' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Highest Qualification <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.highestQualification || ''}
                      onChange={(e) => handleChange('highestQualification', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent bg-white"
                    >
                      <option value="High School">High School / 12th Standard</option>
                      <option value="Diploma">Diploma / Vocational</option>
                      <option value="Bachelor's Degree">Bachelor's Degree (B.Tech, B.Sc, B.Com, B.A, etc.)</option>
                      <option value="Master's Degree">Master's Degree (M.Tech, M.Sc, MBA, M.A, etc.)</option>
                      <option value="Doctorate">Doctorate / PhD</option>
                      <option value="Other">Other Certificate</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Course / Major / Specialization
                      </label>
                      <input
                        type="text"
                        value={formData.degree || ''}
                        onChange={(e) => handleChange('degree', e.target.value)}
                        placeholder="e.g. Computer Science, Mechanical, Nursing"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        College / University Name
                      </label>
                      <input
                        type="text"
                        value={formData.university || ''}
                        onChange={(e) => handleChange('university', e.target.value)}
                        placeholder="e.g. Mumbai University"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Year of Passing / Completion
                      </label>
                      <input
                        type="text"
                        value={formData.yearOfPassing || ''}
                        onChange={(e) => handleChange('yearOfPassing', e.target.value)}
                        placeholder="e.g. 2024 / Pursuing"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Percentage / CGPA / Grade
                      </label>
                      <input
                        type="text"
                        value={formData.grade || ''}
                        onChange={(e) => handleChange('grade', e.target.value)}
                        placeholder="e.g. 78% or 8.2 CGPA"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: DESTINATION GOALS & INTENT */}
              {activeStep === 'intent' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Primary Service Goal <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.primaryDivision || 'study-abroad'}
                      onChange={(e) => handleChange('primaryDivision', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent bg-white"
                    >
                      <option value="study-abroad">🎓 Study Abroad & International Admissions</option>
                      <option value="manpower">💼 Overseas Employment & Recruitment</option>
                      <option value="visa">🛂 Visa Processing & Mock Interviews</option>
                      <option value="attestation">🧾 Certificate Attestation & Apostille</option>
                      <option value="umrah">🧳 Tours & Travels (Pilgrimage / Holidays)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Preferred Destination Country <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.targetCountry || ''}
                        onChange={(e) => handleChange('targetCountry', e.target.value)}
                        placeholder="e.g. United Kingdom, Germany, UAE, Canada"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Preferred Intake / Travel Timeline
                      </label>
                      <input
                        type="text"
                        value={formData.targetIntake || ''}
                        onChange={(e) => handleChange('targetIntake', e.target.value)}
                        placeholder="e.g. Fall 2026 / Spring 2027 / Immediate"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/80 transition cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => handleSaveStep(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#0a2d50] bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              Save Draft
            </button>

            <button
              type="button"
              disabled={saving || loading}
              onClick={() => handleSaveStep(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0a2d50] hover:bg-[#0d3b66] text-white shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Saving to CRM...</span>
                </>
              ) : (
                <span>{activeStep === 'intent' ? 'Save & Complete ✓' : 'Save & Continue →'}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
