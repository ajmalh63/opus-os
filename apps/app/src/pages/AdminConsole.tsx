import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import PartnerAdminPanel from '../components/PartnerAdminPanel';
import AlertsVisibility from '../components/AlertsVisibility';
import AiGovernanceTab from '../components/admin/AiGovernanceTab';
import DeveloperApiSettingsTab from '../components/admin/DeveloperApiSettingsTab';
import DivisionControlsTab from '../components/admin/DivisionControlsTab';
import ClientWorkspaceControlsTab from '../components/admin/ClientWorkspaceControlsTab';
import FeedbackModerationTab from '../components/admin/FeedbackModerationTab';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// Real session-driven auth — the live cookie, never a forged token.

type AdminTab = 'directory' | 'onboard' | 'divisions' | 'clientControls' | 'feedback' | 'partners' | 'alerts' | 'ai' | 'developer';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: 'super_admin' | 'manager' | 'counselor' | 'receptionist' | 'coordinator';
  userDivisions: string; // JSON array of division keys
  createdAt: number;
  updatedAt: number;
}

const DIVISIONS = [
  { key: 'study-abroad', label: 'Study Abroad' },
  { key: 'visa', label: 'Visa Processing' },
  { key: 'umrah', label: 'Umrah Packages' },
  { key: 'attestation', label: 'Document Attestation' },
  { key: 'manpower', label: 'Manpower Recruitment' },
  { key: 'clients', label: 'Clients Directory' },
  { key: 'kanban', label: 'Pipeline Board' },
  { key: 'billing', label: 'Billing & GST' },
  { key: 'taxes', label: 'Taxes & Compliance' },
  { key: 'analytics', label: 'Flow Analytics' },
  { key: 'audit', label: 'Security Logs' }
];

const ROLES = [
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'manager', label: 'Manager' },
  { key: 'counselor', label: 'Counselor' },
  { key: 'receptionist', label: 'Receptionist' },
  { key: 'coordinator', label: 'Coordinator' }
];

export default function AdminConsole() {
  const queryClient = useQueryClient();
  const { me } = useSession();
  const isOwner = me?.role === 'super_admin';
  const initialTab = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null) as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(
    initialTab && ['directory', 'onboard', 'divisions', 'clientControls', 'partners', 'alerts', 'ai', 'developer'].includes(initialTab)
      ? initialTab
      : 'directory'
  );
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' | 'warning' }>({
    show: false,
    msg: '',
    type: 'success'
  });

  // Modal / Editing State for Staff Division Scope
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [editScopes, setEditScopes] = useState<string[]>([]);

  // Onboarding Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'super_admin' | 'manager' | 'counselor' | 'receptionist' | 'coordinator'>('counselor');
  const [newScopes, setNewScopes] = useState<string[]>([]);

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4000);
  };

  // Helper: Safely parse division array from DB string
  const parseDivisions = (divisionsStr: string | null | undefined): string[] => {
    if (!divisionsStr) return [];
    try {
      const parsed = JSON.parse(divisionsStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Queries
  const { data: staffData, isLoading: loadingStaff, isError: staffError } = useQuery<{ staff: StaffUser[] }>({
    queryKey: ['adminStaff'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/admin/staff`);
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch staff directory');
      }
      return res.json();
    }
  });

  const { data: divisionsData } = useQuery<{ enabled: Record<string, boolean> }>({
    queryKey: ['adminDivisions'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/admin/divisions`);
      if (!res.ok) return { enabled: {} };
      return res.json();
    },
    staleTime: 30000,
  });

  const activeDivisionsCount = Object.values(divisionsData?.enabled || {}).filter(Boolean).length;

  // Mutations
  const registerMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; role: string; userDivisions: string[] }) => {
      const res = await fetch(`${API}/api/admin/register-staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to register staff member');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showToast(data.message || 'Staff member registered successfully.', 'success');
      // Reset form
      setNewName('');
      setNewEmail('');
      setNewRole('counselor');
      setNewScopes([]);
      // Refresh directory and audit logs
      queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      queryClient.invalidateQueries({ queryKey: ['adminAuditLogs'] });
      setActiveTab('directory');
    },
    onError: (err: any) => {
      showToast(`Registration Error: ${err.message}`, 'error');
    }
  });

  const updateScopeMutation = useMutation({
    mutationFn: async ({ id, userDivisions }: { id: string; userDivisions: string[] }) => {
      const res = await fetch(`${API}/api/admin/staff/${id}/scope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ userDivisions })
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to update division scopes');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showToast(data.message || 'Division scopes updated successfully.', 'success');
      setEditingStaff(null);
      queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      queryClient.invalidateQueries({ queryKey: ['adminAuditLogs'] });
    },
    onError: (err: any) => {
      showToast(`Scope Update Error: ${err.message}`, 'error');
    }
  });

  // Action Handlers
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }
    registerMutation.mutate({
      name: newName,
      email: newEmail,
      role: newRole,
      userDivisions: newScopes
    });
  };

  const handleOpenEditScope = (user: StaffUser) => {
    setEditingStaff(user);
    setEditScopes(parseDivisions(user.userDivisions));
  };

  const handleSaveScope = () => {
    if (!editingStaff) return;
    updateScopeMutation.mutate({
      id: editingStaff.id,
      userDivisions: editScopes
    });
  };

  const toggleScope = (scopeKey: string, isEditing: boolean) => {
    const list = isEditing ? editScopes : newScopes;
    const setList = isEditing ? setEditScopes : setNewScopes;

    if (list.includes(scopeKey)) {
      setList(list.filter(s => s !== scopeKey));
    } else {
      setList([...list, scopeKey]);
    }
  };

  // Role Badge Styling
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-950/80 text-purple-300 border border-purple-800';
      case 'manager':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'counselor':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'receptionist':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'coordinator':
        return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-brand-navy/15';
    }
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden text-brand-navy font-sans">
      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent">
        {/* TOP STATUS BAR */}
        <header className="h-20 border-b border-brand-navy/10 px-8 flex items-center justify-between shrink-0 bg-white/85 backdrop-blur-xl z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="gold-dot" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Super Admin · Control</span>
            </div>
            <h2 className="mt-1 font-display font-extrabold text-xl text-brand-navy tracking-wide">System Control Console</h2>
            <p className="text-sm text-brand-navy/50">Manage staff access controls, scope limits, and master administrative desks</p>
          </div>

          <div className="flex gap-4">
            {/* Quick Stats Panel */}
            <div className="flex items-center gap-6 bg-white border border-brand-navy/10 rounded-lg px-4 py-2 text-xs shadow-[0_8px_24px_-14px_rgba(10,45,80,0.25)]">
              <div>
                <span className="text-brand-navy/40 block text-xs uppercase tracking-wider font-semibold">Staff Count</span>
                <span className="text-brand-gold font-bold text-sm">{staffData?.staff?.length || 0}</span>
              </div>
              <div className="border-l border-brand-navy/10 h-6"></div>
              <div>
                <span className="text-brand-navy/40 block text-xs uppercase tracking-wider font-semibold">Division Desks</span>
                <span className="text-brand-gold font-bold text-sm">{activeDivisionsCount} / 5 Live</span>
              </div>
            </div>
          </div>
        </header>

        {/* TOAST SYSTEM */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 border text-xs font-semibold transition-all duration-300 ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' :
            'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span>{toast.type === 'success' ? '✓ Done' : toast.type === 'error' ? '✕ Failed' : 'ℹ Notice'}</span>
            <span>{toast.msg}</span>
          </div>
        )}

        {/* SUBHEADER TABS - DEDICATED MASTER ADMIN CONTROLS ONLY */}
        <div className="px-8 border-b border-brand-navy/10 bg-white/80 backdrop-blur-md flex justify-between items-center shrink-0">
          <div className="flex gap-2 py-3">
            {[
              { key: 'directory', label: 'Staff Directory & Scoping', icon: '👥' },
              { key: 'divisions', label: 'Division Go-Live', icon: '⚡' },
              { key: 'clientControls', label: 'Client Workspace Controls', icon: '🎛️' },
              { key: 'feedback', label: 'Reviews & CSAT', icon: '⭐' },
              { key: 'onboard', label: 'Onboard New Staff', icon: '➕' },
              { key: 'partners', label: 'Partner Network', icon: '🤝' },
              { key: 'alerts', label: 'Staff Broadcast Alerts', icon: '📢' },
              { key: 'ai', label: 'AI & Models', icon: '✨' },
              { key: 'developer', label: 'Developer & REST API', icon: '🔑' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as AdminTab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === t.key
                    ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-xs'
                    : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* TAB WORKSPACE CONTENT */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          
          {/* TAB 1: STAFF DIRECTORY & SCOPING */}
          {activeTab === 'directory' && (
            <div className="space-y-6">
              {loadingStaff ? (
                <div className="p-12 text-center text-xs text-slate-400">Retrieving secure staff roster...</div>
              ) : staffError ? (
                <div className="p-12 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200/50 rounded-lg">
                  ⚠ Error – Failed to retrieve staff records. Please check that you have active super-admin credentials.
                </div>
              ) : (
                <div className="bg-white border border-brand-navy/10 rounded-xl overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0b132b] border-b border-brand-navy/10 text-[13px] text-brand-gold uppercase tracking-wider font-semibold">
                        <th className="p-4">Staff Member</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Division Scopes</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-navy/[0.08]">
                      {staffData?.staff?.map((user) => {
                        const userScopes = parseDivisions(user.userDivisions);
                        return (
                          <tr key={user.id} className="hover:bg-brand-navy/[0.04] transition duration-150">
                            <td className="p-4">
                              <div className="font-semibold text-brand-navy">{user.name}</div>
                              <div className="text-[13px] text-slate-400">{user.email}</div>
                              <div className="text-xs text-slate-500 mt-0.5">UID: {user.id}</div>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${getRoleBadgeStyle(user.role)}`}>
                                {user.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4">
                              {userScopes.length === 0 ? (
                                <span className="text-slate-500 italic text-[13px]">No active scopes</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {userScopes.map(scopeKey => {
                                    const match = DIVISIONS.find(d => d.key === scopeKey);
                                    return (
                                      <span key={scopeKey} className="px-2 py-0.5 bg-brand-navy/[0.06] text-brand-navy/70 border border-brand-navy/10 rounded text-xs font-medium">
                                        {match?.label || scopeKey}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleOpenEditScope(user)}
                                className="px-3 py-1.5 bg-brand-navy/[0.05] hover:bg-brand-navy/[0.06] border border-brand-navy/15 text-brand-gold text-[13px] uppercase font-semibold tracking-wider rounded transition duration-150 cursor-pointer"
                              >
                                Edit Scope
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: DIVISION GO-LIVE & KILL-SWITCH */}
          {activeTab === 'divisions' && isOwner && <DivisionControlsTab />}

          {/* TAB: CLIENT WORKSPACE CONTROLS — every client form/field/dropdown/button mirrored */}
          {activeTab === 'clientControls' && isOwner && <ClientWorkspaceControlsTab />}

          {/* TAB 2: REGISTER NEW STAFF */}
          {activeTab === 'onboard' && (
            <div className="max-w-2xl mx-auto bg-white border border-brand-navy/10 p-8 rounded-xl shadow-2xl">
              <h3 className="font-display font-semibold text-brand-navy text-base mb-6 border-b border-brand-navy/10 pb-3 text-brand-gold">
                System Staff Onboarding & Scoping
              </h3>
              
              <form onSubmit={handleRegisterSubmit} className="space-y-6 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[13px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      placeholder="name@opusoverseas.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                    Role Privilege Group *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                  >
                    {ROLES.map(role => (
                      <option key={role.key} value={role.key} className="bg-white text-brand-navy">
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[13px] text-slate-400 mt-1">
                    Defines API access limits and global menu operations in accordance with RBAC policies.
                  </p>
                </div>

                <div>
                  <label className="block text-[13px] uppercase text-slate-400 font-semibold mb-2 tracking-wider">
                    Permitted Division Scopes (Employee Scoping)
                  </label>
                  <div className="bg-white border border-brand-navy/10 rounded p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DIVISIONS.map(div => {
                      const isChecked = newScopes.includes(div.key);
                      return (
                        <div
                          key={div.key}
                          onClick={() => toggleScope(div.key, false)}
                          className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer select-none transition-all duration-150 ${
                            isChecked
                              ? 'bg-brand-navy/[0.06] border-brand-gold/60 text-brand-gold'
                              : 'bg-transparent border-brand-navy/10 text-brand-navy/70 hover:border-brand-navy/15'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="w-4 h-4 accent-brand-gold cursor-pointer"
                          />
                          <span className="font-semibold text-xs">{div.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[13px] text-slate-400 mt-1.5">
                    For role types like Counselor or Coordinator, their work queue and client data access will be strictly sandboxed within selected divisions.
                  </p>
                </div>

                <div className="pt-4 border-t border-brand-navy/10 flex justify-end">
                  <button
                    type="submit"
                    disabled={registerMutation.isPending}
                    className="px-6 py-2.5 bg-brand-gold hover:bg-brand-goldHover text-brand-navy uppercase text-xs font-bold tracking-wider rounded transition duration-200 disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {registerMutation.isPending ? 'Registering Staff...' : 'Register and Scope Staff User'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: REVIEWS & CSAT FEEDBACK MODERATION */}
          {activeTab === 'feedback' && isOwner && <FeedbackModerationTab />}

          {/* TAB 4: PARTNER NETWORK */}
          {activeTab === 'partners' && isOwner && <PartnerAdminPanel />}

          {/* TAB 5: STAFF BROADCAST ALERTS */}
          {activeTab === 'alerts' && isOwner && <AlertsVisibility />}

          {/* TAB 6: AI & MODEL GOVERNANCE */}
          {activeTab === 'ai' && isOwner && <AiGovernanceTab />}

          {/* TAB 7: DEVELOPER & REST API */}
          {activeTab === 'developer' && isOwner && <DeveloperApiSettingsTab />}
        </div>
      </main>

      {/* MODAL / DRAWER: EDIT STAFF SCOPE */}
      {editingStaff && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/10 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6">
            <div>
              <h3 className="font-display font-bold text-brand-navy text-base">Modify Division Scopes</h3>
              <p className="text-xs text-slate-400 mt-1">
                Updating scopes for <span className="text-brand-gold font-semibold">{editingStaff.name}</span> ({editingStaff.email})
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-[13px] uppercase text-slate-400 font-bold tracking-wider">
                Select Permitted Divisions
              </label>
              <div className="space-y-2 bg-brand-navy/[0.04] p-4 border border-brand-navy/10 rounded-lg max-h-60 overflow-y-auto">
                {DIVISIONS.map(div => {
                  const isChecked = editScopes.includes(div.key);
                  return (
                    <div
                      key={div.key}
                      onClick={() => toggleScope(div.key, true)}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer select-none transition ${
                        isChecked ? 'bg-brand-navy/[0.06] text-brand-gold' : 'text-brand-navy/70 hover:bg-brand-navy/[0.04]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="w-4 h-4 accent-brand-gold cursor-pointer"
                      />
                      <span className="text-xs font-semibold">{div.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 text-xs pt-4 border-t border-brand-navy/10">
              <button
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 border border-brand-navy/15 text-brand-navy/70 hover:text-brand-navy rounded hover:bg-brand-navy/[0.06] cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScope}
                disabled={updateScopeMutation.isPending}
                className="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-brand-navy rounded font-bold cursor-pointer transition disabled:opacity-50"
              >
                {updateScopeMutation.isPending ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
