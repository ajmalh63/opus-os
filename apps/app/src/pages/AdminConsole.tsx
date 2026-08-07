import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';

// API interfaces matching Drizzle schemas & Zod validators
interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityName: string;
  entityId: string;
  beforeState: string | null;
  afterState: string | null;
  ipAddress: string | null;
  createdAt: number;
}

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
  { key: 'manpower', label: 'Manpower Recruitment' }
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
  const [activeTab, setActiveTab] = useState<'directory' | 'onboard' | 'audit'>('directory');
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

  // Audit Log Filter/Search State
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actorSearch, setActorSearch] = useState('');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);

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
      const res = await fetch('/api/admin/staff', {
        headers: {
          'Cookie': 'better-auth.session_token=token-admin'
        }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch staff directory');
      }
      return res.json();
    }
  });

  const { data: auditData, isLoading: loadingAudit, isError: auditError } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['adminAuditLogs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs', {
        headers: {
          'Cookie': 'better-auth.session_token=token-admin'
        }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch audit log history');
      }
      return res.json();
    }
  });

  // Mutations
  const registerMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; role: string; userDivisions: string[] }) => {
      const res = await fetch('/api/admin/register-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'better-auth.session_token=token-admin'
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
      const res = await fetch(`/api/admin/staff/${id}/scope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'better-auth.session_token=token-admin'
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

  // Client-side filtering of audit logs
  const getFilteredLogs = () => {
    if (!auditData?.logs) return [];
    
    // Sort descending by default
    const sorted = [...auditData.logs].sort((a, b) => b.createdAt - a.createdAt);

    return sorted.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entityName !== entityFilter) return false;
      if (actorSearch.trim()) {
        const search = actorSearch.toLowerCase();
        const actorMatch = log.actorId?.toLowerCase().includes(search);
        const actionMatch = log.action.toLowerCase().includes(search);
        const entityIdMatch = log.entityId.toLowerCase().includes(search);
        if (!actorMatch && !actionMatch && !entityIdMatch) return false;
      }
      return true;
    });
  };

  // Helper to extract unique actions and entities for filters
  const uniqueActions = Array.from(new Set(auditData?.logs?.map(l => l.action) || []));
  const uniqueEntities = Array.from(new Set(auditData?.logs?.map(l => l.entityName) || []));

  // Role Badge Styling
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-950/80 text-purple-300 border border-purple-800';
      case 'manager':
        return 'bg-blue-950/80 text-blue-300 border border-blue-800';
      case 'counselor':
        return 'bg-emerald-950/80 text-emerald-300 border border-emerald-800';
      case 'receptionist':
        return 'bg-amber-950/80 text-amber-300 border border-amber-800';
      case 'coordinator':
        return 'bg-cyan-950/80 text-cyan-300 border border-cyan-800';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  // Helper to format UNIX timestamps
  const formatTime = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts * 1000).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-[#0B132B] text-slate-100 font-sans min-h-screen flex w-screen overflow-hidden">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-[#1C2541] text-white flex flex-col justify-between shrink-0 shadow-2xl z-20 border-r border-slate-800">
        <div>
          {/* Brand Logo */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-brand-gold flex items-center justify-center font-display font-bold text-[#0B132B]">O</div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight tracking-wider">OpusOS</h1>
              <p className="text-[10px] text-brand-gold tracking-widest uppercase font-semibold">Business Engine</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-2">
            <Link href="/kanban" className="flex items-center gap-3 px-4 py-3 rounded text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 transition duration-200">
              <svg className="w-5 h-5 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"></path>
              </svg>
              <span>Kanban Board</span>
            </Link>
            <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 transition duration-200">
              <svg className="w-5 h-5 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>Public Lead Form</span>
            </Link>
            <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded text-sm text-white bg-slate-800/80 border-l-4 border-brand-gold font-medium transition duration-200">
              <svg className="w-5 h-5 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
              </svg>
              <span>Admin Console</span>
            </Link>
          </nav>
        </div>

        {/* Active Profile Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center gap-3 bg-slate-900/30">
          <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center border border-brand-gold/30 text-brand-gold font-semibold">AD</div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold truncate text-white">Admin Owner</p>
            <p className="text-[10px] text-brand-gold uppercase tracking-wider font-semibold">Super Admin</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-[#070b19]">
        
        {/* TOP STATUS BAR */}
        <header className="h-20 border-b border-slate-800 px-8 flex items-center justify-between shrink-0 bg-[#0b132b]/80 backdrop-blur-md z-10">
          <div>
            <h2 className="font-display font-bold text-xl text-white tracking-wide">System Control Console</h2>
            <p className="text-xs text-slate-400">Manage staff access controls, scope limits, and system-wide write logs</p>
          </div>

          <div className="flex gap-4">
            {/* Quick Stats Panel */}
            <div className="flex items-center gap-6 bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Staff Count</span>
                <span className="text-brand-gold font-bold text-sm">{staffData?.staff?.length || 0}</span>
              </div>
              <div className="border-l border-slate-800 h-6"></div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Audit Logs</span>
                <span className="text-brand-gold font-bold text-sm">{auditData?.logs?.length || 0}</span>
              </div>
            </div>
          </div>
        </header>

        {/* TOAST SYSTEM */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 border text-xs font-semibold transition-all duration-300 ${
            toast.type === 'success' ? 'bg-emerald-950 border-emerald-800 text-emerald-300' :
            toast.type === 'error' ? 'bg-rose-950 border-rose-800 text-rose-300' :
            'bg-amber-950 border-amber-800 text-amber-300'
          }`}>
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : '⚠️'}</span>
            <span>{toast.msg}</span>
          </div>
        )}

        {/* SUBHEADER TABS */}
        <div className="px-8 border-b border-slate-800 bg-[#0B132B]/30 flex justify-between items-center shrink-0">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('directory')}
              className={`py-4 text-xs font-semibold uppercase tracking-wider border-b-2 px-1 transition duration-200 cursor-pointer ${
                activeTab === 'directory' ? 'border-brand-gold text-brand-gold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Staff Directory & Scoping
            </button>
            <button
              onClick={() => setActiveTab('onboard')}
              className={`py-4 text-xs font-semibold uppercase tracking-wider border-b-2 px-1 transition duration-200 cursor-pointer ${
                activeTab === 'onboard' ? 'border-brand-gold text-brand-gold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Onboard New Staff
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`py-4 text-xs font-semibold uppercase tracking-wider border-b-2 px-1 transition duration-200 cursor-pointer ${
                activeTab === 'audit' ? 'border-brand-gold text-brand-gold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              System Audit Logs
            </button>
          </div>
        </div>

        {/* TAB WORKSPACE CONTENT */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* TAB 1: STAFF DIRECTORY & SCOPING */}
          {activeTab === 'directory' && (
            <div className="space-y-6">
              {loadingStaff ? (
                <div className="p-12 text-center text-xs text-slate-400">Retrieving secure staff roster...</div>
              ) : staffError ? (
                <div className="p-12 text-center text-xs text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-lg">
                  ⚠️ Failed to retrieve staff records. Please check that you have active super-admin credentials.
                </div>
              ) : (
                <div className="bg-[#1C2541]/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0b132b] border-b border-slate-800 text-[10px] text-brand-gold uppercase tracking-wider font-semibold">
                        <th className="p-4">Staff Member</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Division Scopes</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {staffData?.staff?.map((user) => {
                        const userScopes = parseDivisions(user.userDivisions);
                        return (
                          <tr key={user.id} className="hover:bg-slate-800/20 transition duration-150">
                            <td className="p-4">
                              <div className="font-semibold text-white">{user.name}</div>
                              <div className="text-[10px] text-slate-400">{user.email}</div>
                              <div className="text-[9px] text-slate-500 mt-0.5">UID: {user.id}</div>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${getRoleBadgeStyle(user.role)}`}>
                                {user.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4">
                              {userScopes.length === 0 ? (
                                <span className="text-slate-500 italic text-[10px]">No active scopes</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {userScopes.map(scopeKey => {
                                    const match = DIVISIONS.find(d => d.key === scopeKey);
                                    return (
                                      <span key={scopeKey} className="px-2 py-0.5 bg-slate-900 text-slate-300 border border-slate-800 rounded text-[9px] font-medium">
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
                                className="px-3 py-1.5 bg-[#1C2541] hover:bg-slate-800 border border-slate-700 text-brand-gold text-[10px] uppercase font-semibold tracking-wider rounded transition duration-150 cursor-pointer"
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

          {/* TAB 2: REGISTER NEW STAFF */}
          {activeTab === 'onboard' && (
            <div className="max-w-2xl mx-auto bg-[#1C2541]/40 border border-slate-800 p-8 rounded-xl shadow-2xl">
              <h3 className="font-display font-semibold text-white text-base mb-6 border-b border-slate-800 pb-3 text-brand-gold">
                System Staff Onboarding & Scoping
              </h3>
              
              <form onSubmit={handleRegisterSubmit} className="space-y-6 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-[#0B132B]/80 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      placeholder="name@opusoverseas.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-[#0B132B]/80 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-semibold mb-1.5 tracking-wider">
                    Role Privilege Group *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full bg-[#0B132B]/80 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                  >
                    {ROLES.map(role => (
                      <option key={role.key} value={role.key} className="bg-[#0B132B] text-white">
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Defines API access limits and global menu operations in accordance with RBAC policies.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-semibold mb-2 tracking-wider">
                    Permitted Division Scopes (Employee Scoping)
                  </label>
                  <div className="bg-[#0B132B]/80 border border-slate-800 rounded p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DIVISIONS.map(div => {
                      const isChecked = newScopes.includes(div.key);
                      return (
                        <div
                          key={div.key}
                          onClick={() => toggleScope(div.key, false)}
                          className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer select-none transition-all duration-150 ${
                            isChecked
                              ? 'bg-slate-900 border-brand-gold/60 text-brand-gold'
                              : 'bg-transparent border-slate-800 text-slate-300 hover:border-slate-700'
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
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    For role types like Counselor or Coordinator, their work queue and client data access will be strictly sandboxed within selected divisions.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    type="submit"
                    disabled={registerMutation.isPending}
                    className="px-6 py-2.5 bg-brand-gold hover:bg-brand-goldHover text-[#0B132B] uppercase text-xs font-bold tracking-wider rounded transition duration-200 disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {registerMutation.isPending ? 'Registering Staff...' : 'Register and Scope Staff User'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: SYSTEM AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              
              {/* FILTERS & SEARCH ROW */}
              <div className="bg-[#1C2541]/40 border border-slate-800 p-4 rounded-xl flex flex-wrap gap-4 items-end text-xs">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Search logs
                  </label>
                  <input
                    type="text"
                    placeholder="Search Action, Entity, Actor ID..."
                    value={actorSearch}
                    onChange={(e) => setActorSearch(e.target.value)}
                    className="w-full bg-[#0B132B]/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Action Type
                  </label>
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="bg-[#0B132B]/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="all">All Actions</option>
                    {uniqueActions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Entity Table
                  </label>
                  <select
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                    className="bg-[#0B132B]/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="all">All Entities</option>
                    {uniqueEntities.map(ent => (
                      <option key={ent} value={ent}>{ent}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => {
                    setActionFilter('all');
                    setEntityFilter('all');
                    setActorSearch('');
                  }}
                  className="px-3 py-1.5 bg-[#0B132B] hover:bg-slate-800 text-slate-400 hover:text-white rounded border border-slate-800 cursor-pointer font-medium"
                >
                  Reset
                </button>
              </div>

              {/* AUDIT LOG TABLE */}
              {loadingAudit ? (
                <div className="p-12 text-center text-xs text-slate-400">Loading system write log pipeline...</div>
              ) : auditError ? (
                <div className="p-12 text-center text-xs text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-lg">
                  ⚠️ Failed to fetch audit log trail. Please verify DB status and Admin session permissions.
                </div>
              ) : (
                <div className="bg-[#1C2541]/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0b132b] border-b border-slate-800 text-[10px] text-brand-gold uppercase tracking-wider font-semibold">
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">Action</th>
                        <th className="p-4">Entity Mapped</th>
                        <th className="p-4">Actor ID</th>
                        <th className="p-4">IP Address</th>
                        <th className="p-4 text-right">Data Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {getFilteredLogs().length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                            No write audit records matched the filter query.
                          </td>
                        </tr>
                      ) : (
                        getFilteredLogs().map((log) => (
                          <tr key={log.id} className="hover:bg-slate-800/20 transition duration-150">
                            <td className="p-4 text-slate-300 font-mono whitespace-nowrap">
                              {formatTime(log.createdAt)}
                            </td>
                            <td className="p-4 font-mono font-bold text-white tracking-wider">
                              <span className="px-1.5 py-0.5 rounded bg-slate-900/80 text-brand-gold border border-brand-gold/10">
                                {log.action}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="font-semibold text-white">{log.entityName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{log.entityId}</div>
                            </td>
                            <td className="p-4 font-mono text-slate-400">
                              {log.actorId || <span className="text-slate-500 italic text-[10px]">guest_user</span>}
                            </td>
                            <td className="p-4 font-mono text-slate-400">
                              {log.ipAddress || 'unknown'}
                            </td>
                            <td className="p-4 text-right">
                              {(log.beforeState || log.afterState) ? (
                                <button
                                  onClick={() => setSelectedLogDetail(log)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-brand-gold text-[10px] font-semibold rounded cursor-pointer transition"
                                >
                                  Inspect State
                                </button>
                              ) : (
                                <span className="text-slate-600 text-[10px] italic">No State Changes</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODAL / DRAWER: EDIT STAFF SCOPE */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C2541] border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6">
            <div>
              <h3 className="font-display font-bold text-white text-base">Modify Division Scopes</h3>
              <p className="text-xs text-slate-400 mt-1">
                Updating scopes for <span className="text-brand-gold font-semibold">{editingStaff.name}</span> ({editingStaff.email})
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                Select Permitted Divisions
              </label>
              <div className="space-y-2 bg-[#0B132B] p-4 border border-slate-800 rounded-lg max-h-60 overflow-y-auto">
                {DIVISIONS.map(div => {
                  const isChecked = editScopes.includes(div.key);
                  return (
                    <div
                      key={div.key}
                      onClick={() => toggleScope(div.key, true)}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer select-none transition ${
                        isChecked ? 'bg-[#1C2541]/80 text-brand-gold' : 'text-slate-300 hover:bg-slate-800/40'
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

            <div className="flex justify-end gap-3 text-xs pt-4 border-t border-slate-800/60">
              <button
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 border border-slate-700 text-slate-300 hover:text-white rounded hover:bg-slate-800 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScope}
                disabled={updateScopeMutation.isPending}
                className="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-[#0B132B] rounded font-bold cursor-pointer transition disabled:opacity-50"
              >
                {updateScopeMutation.isPending ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STATE DIFF INSPECTOR */}
      {selectedLogDetail && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C2541] border border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-brand-gold px-1.5 py-0.5 rounded bg-slate-900 border border-brand-gold/20">
                  {selectedLogDetail.action}
                </span>
                <h3 className="font-display font-bold text-white text-base mt-2">
                  Audit State Inspector
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  Entity: <span className="text-white font-mono">{selectedLogDetail.entityName}</span> (ID: <span className="text-white font-mono">{selectedLogDetail.entityId}</span>) | Actor: <span className="text-white font-mono">{selectedLogDetail.actorId || 'guest_user'}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-slate-400 hover:text-white text-xl p-1 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content & State Comparison */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 min-h-0">
              
              {/* Visual State Diffs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                
                {/* Before State */}
                <div className="flex flex-col space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    - State Before Change
                  </div>
                  <div className="bg-[#0B132B] border border-slate-800 rounded-lg p-4 font-mono text-[11px] overflow-x-auto overflow-y-auto max-h-80 text-rose-300">
                    {selectedLogDetail.beforeState ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(selectedLogDetail.beforeState);
                          return <pre className="whitespace-pre">{JSON.stringify(parsed, null, 2)}</pre>;
                        } catch {
                          return <pre className="whitespace-pre">{selectedLogDetail.beforeState}</pre>;
                        }
                      })()
                    ) : (
                      <span className="italic text-slate-500">None (Creation Event)</span>
                    )}
                  </div>
                </div>

                {/* After State */}
                <div className="flex flex-col space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-emerald-400">
                    + State After Change
                  </div>
                  <div className="bg-[#0B132B] border border-slate-800 rounded-lg p-4 font-mono text-[11px] overflow-x-auto overflow-y-auto max-h-80 text-emerald-300">
                    {selectedLogDetail.afterState ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(selectedLogDetail.afterState);
                          return <pre className="whitespace-pre">{JSON.stringify(parsed, null, 2)}</pre>;
                        } catch {
                          return <pre className="whitespace-pre">{selectedLogDetail.afterState}</pre>;
                        }
                      })()
                    ) : (
                      <span className="italic text-slate-500">None (Deletion Event)</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Structured Field changes if both exist */}
              {selectedLogDetail.beforeState && selectedLogDetail.afterState && (
                <div className="bg-[#0B132B]/50 border border-slate-800 rounded-lg p-4 text-xs space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-brand-gold tracking-wider">
                    Detected Value Modifications
                  </h4>
                  <div className="space-y-2 font-mono text-[11px]">
                    {(() => {
                      try {
                        const beforeObj = JSON.parse(selectedLogDetail.beforeState);
                        const afterObj = JSON.parse(selectedLogDetail.afterState);
                        const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
                        
                        const changedFields: React.ReactNode[] = [];
                        
                        allKeys.forEach(key => {
                          const valBefore = JSON.stringify(beforeObj[key]);
                          const valAfter = JSON.stringify(afterObj[key]);
                          
                          if (valBefore !== valAfter) {
                            changedFields.push(
                              <div key={key} className="border-b border-slate-800/80 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-slate-300 font-semibold">{key}</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-400 line-through max-w-[200px] truncate">
                                    {valBefore === undefined ? 'undefined' : valBefore}
                                  </span>
                                  <span className="text-slate-500">→</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 max-w-[200px] truncate">
                                    {valAfter === undefined ? 'undefined' : valAfter}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                        });
                        
                        return changedFields.length > 0 ? (
                          <div className="divide-y divide-slate-800/40">{changedFields}</div>
                        ) : (
                          <div className="text-slate-500 italic">No direct property differences found (nested object similarity).</div>
                        );
                      } catch {
                        return <div className="text-slate-500 italic">Binary or unparseable state data. Unable to compute diff.</div>;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800/60 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded font-semibold text-xs cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}
