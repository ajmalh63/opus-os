import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface Permission { code: string; family: string; label: string; ownerOnly: boolean; }
interface Role { id: string; name: string; code: string; description: string | null; permissionsJson: string; system: boolean; editable: boolean; color: string; }

// A-5: session-driven auth Ã¢â‚¬- read the live better-auth cookie; no forged admin token.
const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

export default function RolesTab() {
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  // Create-role form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Permission catalog
  const { data: permData } = useQuery<{ permissions: Permission[] }>({
    queryKey: ['rbacPermissions'],
    queryFn: async () => {
      const r = await fetch('/api/admin/rbac/permissions', { headers: AUTH });
      if (!r.ok) throw new Error('Failed to load permissions');
      return r.json();
    }
  });
  const permissions = permData?.permissions || [];

  // Roles list
  const { data: roleData, refetch: refetchRoles } = useQuery<{ roles: Role[] }>({
    queryKey: ['rbacRoles'],
    queryFn: async () => {
      const r = await fetch('/api/admin/rbac/roles', { headers: AUTH });
      if (!r.ok) throw new Error('Failed to load roles');
      return r.json();
    }
  });
  const roles = roleData?.roles || [];

  const createRole = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ name, code: code.toLowerCase().replace(/\s+/g, '_'), description: desc, permissions: selectedPerms })
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Failed to create role'); }
      return r.json();
    },
    onSuccess: (d) => {
      flash(d.message || 'Role created');
      setName(''); setCode(''); setDesc(''); setSelectedPerms([]);
      refetchRoles();
    },
    onError: (e: any) => flash(e.message, 'err'),
  });

  const togglePerm = (code: string) => {
    setSelectedPerms(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const families = [...new Set(permissions.map(p => p.family))];

  return (
    <div className="space-y-8">
      {toast && (
        <div className={`p-3 rounded-lg text-xs font-semibold ${toast.type === 'ok' ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-400' : 'bg-rose-950/40 border border-rose-800 text-rose-400'}`}>
          {toast.msg}
        </div>
      )}

      {/* CREATE ROLE BUILDER */}
      <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-display font-bold text-sm text-brand-gold">Create a Custom Role</h3>
          <p className="text-xs text-slate-500 mt-0.5">Assemble a role by ticking atomic permissions. Owner-only permissions (finance/compliance/audit/rbac) can never be added here.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Role name Ã¢â‚¬- e.g. Visa Specialist"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder-slate-600 focus:border-brand-gold focus:outline-none" />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code Ã¢â‚¬- e.g. visa_specialist"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder-slate-600 focus:border-brand-gold focus:outline-none" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description (optional)"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder-slate-600 focus:border-brand-gold focus:outline-none" />
        </div>

        <div className="space-y-4">
          {families.map(fam => (
            <div key={fam}>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-2">{fam}</span>
              <div className="flex flex-wrap gap-2">
                {permissions.filter(p => p.family === fam && !p.ownerOnly).map(p => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => togglePerm(p.code)}
                    className={`px-3 py-1.5 rounded-md border text-[10px] font-semibold transition cursor-pointer ${
                      selectedPerms.includes(p.code)
                        ? 'bg-brand-gold text-brand-navy border-brand-gold'
                        : 'bg-white text-slate-700 border-brand-navy/10 hover:border-brand-gold/50'
                    }`}
                    title={p.label}
                  >
                    {p.code}
                  </button>
                ))}
                {permissions.filter(p => p.family === fam && p.ownerOnly).map(p => (
                  <span key={p.code} className="px-3 py-1.5 rounded-md border border-brand-navy/10 text-[10px] text-slate-600 line-through" title="Owner-only - locked">{p.code} Ã°Å¸-’</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => createRole.mutate()}
          disabled={!name.trim() || !code.trim() || createRole.isPending}
          className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-6 py-2.5 rounded text-xs font-bold transition disabled:opacity-40 cursor-pointer"
        >
          {createRole.isPending ? 'Creating...' : 'Create Role'}
        </button>
      </div>

      {/* EXISTING ROLES TABLE */}
      <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-navy/10">
          <h3 className="font-display font-bold text-sm text-brand-navy">Role Inventory</h3>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-white text-slate-500 uppercase tracking-wider text-[10px] border-b border-brand-navy/10">
              <th className="p-4">Role</th>
              <th className="p-4">Code</th>
              <th className="p-4">Permissions</th>
              <th className="p-4">Type</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => {
              let perms: string[] = [];
              try { perms = JSON.parse(r.permissionsJson || '[]'); } catch { perms = []; }
              return (
                <tr key={r.id} className="border-b border-brand-navy/10/60 hover:bg-slate-900/40">
                  <td className="p-4 font-semibold text-brand-navy">{r.name}</td>
                  <td className="p-4 text-slate-500 font-mono">{r.code}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {perms.slice(0, 8).map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-white border border-brand-navy/10 text-slate-700 text-[9px]">{p}</span>
                      ))}
                      {perms.length > 8 && <span className="text-[9px] text-slate-600">+{perms.length - 8} more</span>}
                      {perms.length === 0 && <span className="text-[9px] text-slate-600">No permissions</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${r.system ? 'bg-white text-slate-700' : 'bg-brand-gold/15 text-brand-gold'}`}>
                      {r.system ? 'System' : 'Custom'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-slate-600">No roles yet. Use a role creation above, or seed defaults via the staff flow.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
