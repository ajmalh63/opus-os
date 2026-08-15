import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ROLES = ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'];
const TYPES = ['visa_inquiry', 'visa_application', 'visa_sale', 'manpower_application', 'membership_sale', 'document_upload', 'resume_upload'];

const DEFAULTS: Record<string, string[]> = {
  super_admin: ['*'],
  manager: ['visa_sale', 'visa_application', 'visa_inquiry', 'manpower_application', 'membership_sale'],
  counselor: ['visa_application', 'visa_inquiry', 'manpower_application'],
  receptionist: ['visa_inquiry', 'manpower_application'],
  coordinator: ['visa_application', 'manpower_application'],
};

// Superadmin control: which staff roles see which client sales/requests in the
// live activity feed (header bell + dashboard panel).
export default function AlertsVisibility() {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ success: boolean; visibility: Record<string, string[]> | null; types: string[] }>({
    queryKey: ['alertVisibility'],
    queryFn: async () => { const r = await fetch('/api/staff/alerts/visibility'); if (!r.ok) throw new Error('visibility'); return r.json(); },
  });
  const [vis, setVis] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (data?.visibility) setVis(data.visibility);
    else if (data) setVis(DEFAULTS);
  }, [data]);

  const save = useMutation({
    mutationFn: async (v: Record<string, string[]>) => {
      const r = await fetch('/api/staff/alerts/visibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: v }) });
      if (!r.ok) throw new Error('Failed to save');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['alertVisibility'] }); alert('Visibility saved.'); },
    onError: (e: any) => alert(e.message),
  });

  const toggle = (role: string, type: string) => {
    setVis((prev) => {
      const cur = prev[role] || [];
      const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
      return { ...prev, [role]: next };
    });
  };

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 text-xs">
      <div>
        <h3 className="font-display font-extrabold text-brand-navy text-sm">Staff Alert Visibility</h3>
        <p className="text-[10px] text-brand-navy/50 mt-1">Control which staff roles see which client sales/requests in the live activity feed (header bell + dashboard).</p>
      </div>
      <div className="overflow-x-auto border border-brand-navy/10 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-navy/[0.04] text-[10px] uppercase font-bold text-brand-gold border-b border-brand-navy/[0.08]">
            <tr>
              <th className="px-4 py-3">Role</th>
              {TYPES.map((t) => <th key={t} className="px-3 py-3 text-center">{t.replace('_', ' ')}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-navy/[0.08] text-brand-navy/70">
            {ROLES.map((role) => (
              <tr key={role} className="hover:bg-brand-navy/[0.04]">
                <td className="px-4 py-3 font-bold text-brand-navy capitalize">{role.replace('_', ' ')}</td>
                {TYPES.map((t) => (
                  <td key={t} className="px-3 py-3 text-center">
                    <input type="checkbox" checked={(vis[role] || []).includes(t)} onChange={() => toggle(role, t)} className="rounded border-brand-navy/20 accent-brand-gold cursor-pointer" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button onClick={() => save.mutate(vis)} disabled={save.isPending} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[10px] font-bold px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save Visibility'}
        </button>
      </div>
    </div>
  );
}
