import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

interface Permission { code: string; family: string; label: string; ownerOnly: boolean; }
interface Role { id: string; name: string; code: string; description: string | null; permissionsJson: string; system: boolean; editable: boolean; color: string; }

// A-5: session-driven auth €â‚¬- read the live better-auth cookie; no forged admin token.


export default function RolesTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
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
      const r = await fetch(`${API}/api/admin/rbac/permissions`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load permissions');
      return r.json();
    }
  });
  const permissions = permData?.permissions || [];

  // Roles list
  const { data: roleData, refetch: refetchRoles } = useQuery<{ roles: Role[] }>({
    queryKey: ['rbacRoles'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/admin/rbac/roles`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load roles');
      return r.json();
    }
  });
  const roles = roleData?.roles || [];

  const createRole = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/admin/rbac/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
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
    <div ref={rootRef} className="space-y-8">
      {toast && (
        <div className={`p-3 rounded-lg text-xs font-semibold ${toast.type === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* CREATE ROLE BUILDER */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-gold">Create a Custom Role</h3>
          </div>
          <p className="text-xs text-brand-navy/40 mt-0.5">Assemble a role by ticking atomic permissions. Owner-only permissions (finance/compliance/audit/rbac) can never be added here.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Role name €â‚¬- e.g. Visa Specialist"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code €â‚¬- e.g. visa_specialist"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description (optional)"
            className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
        </div>

        <div className="space-y-4">
          {families.map(fam => (
            <div key={fam}>
              <span className="text-[13px] uppercase tracking-wider text-brand-navy/40 font-bold block mb-2">{fam}</span>
              <div className="flex flex-wrap gap-2">
                {permissions.filter(p => p.family === fam && !p.ownerOnly).map(p => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => togglePerm(p.code)}
                    className={`px-3 py-1.5 rounded-md border text-[13px] font-semibold transition cursor-pointer ${
                      selectedPerms.includes(p.code)
                        ? 'bg-brand-gold text-brand-navy border-brand-gold'
                        : 'bg-brand-navy/[0.06] text-brand-navy/70 border-brand-navy/10 hover:border-brand-gold/50'
                    }`}
                    title={p.label}
                  >
                    {p.code}
                  </button>
                ))}
                {permissions.filter(p => p.family === fam && p.ownerOnly).map(p => (
                  <span key={p.code} className="px-3 py-1.5 rounded-md border border-brand-navy/10 text-[13px] text-brand-navy/40 line-through" title="Owner-only - locked">{p.code} 📊-’</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => createRole.mutate()}
          disabled={!name.trim() || !code.trim() || createRole.isPending}
          className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-6 py-2.5 rounded text-xs font-bold transition disabled:opacity-40 cursor-pointer"
        >
          {createRole.isPending ? 'Creating...' : 'Create Role'}
        </button>
      </div>

      {/* EXISTING ROLES TABLE */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-navy/[0.08]">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">Role Inventory</h3>
          </div>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[13px] uppercase tracking-wider text-brand-gold">
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
                <tr key={r.id} className="border-b border-brand-navy/[0.08] hover:bg-brand-navy/[0.04]">
                  <td className="p-4 font-semibold text-brand-navy">{r.name}</td>
                  <td className="p-4 text-brand-navy/40 font-mono">{r.code}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {perms.slice(0, 8).map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-brand-navy/[0.06] border border-brand-navy/10 text-brand-navy/70 text-xs">{p}</span>
                      ))}
                      {perms.length > 8 && <span className="text-xs text-brand-navy/40">+{perms.length - 8} more</span>}
                      {perms.length === 0 && <span className="text-xs text-brand-navy/40">No permissions</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${r.system ? 'bg-brand-navy/[0.06] text-brand-navy/70' : 'bg-brand-gold/15 text-brand-gold'}`}>
                      {r.system ? 'System' : 'Custom'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-brand-navy/40">No roles yet. Use a role creation above, or seed defaults via the staff flow.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
