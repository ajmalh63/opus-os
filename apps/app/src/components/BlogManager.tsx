import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSyncClient } from '../lib/syncClient';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const DIVISIONS = ['general','study-abroad','visa-services','attestation','umrah-travel','manpower'] as const;

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 85 ? 'bg-emerald-500/15 text-emerald-700' : score >= 70 ? 'bg-amber-500/15 text-amber-700' : score >= 50 ? 'bg-rose-500/15 text-rose-600' : 'bg-red-500/15 text-red-600';
  return <span className={`px-2 py-0.5 rounded-full text-[13px] font-bold ${cls}`}>{score}/100</span>;
}

export default function BlogManager() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [audit, setAudit] = useState<any>(null);

  // Realtime sync — staff plane: any blog publish/update/delete from another manager instantly refreshes this list + public /blog
  useEffect(() => {
    const enabled = (import.meta as any).env?.VITE_SYNC_ENABLED !== 'false';
    if (!enabled) return;
    const c = createSyncClient({
      plane: 'staff',
      channels: ['public:blog', 'staff:global:blog'],
      enabled,
      onEvent: (e) => {
        if (e.type.startsWith('BLOG_')) {
          qc.invalidateQueries({ queryKey: ['adminBlogPosts'] });
          qc.invalidateQueries({ queryKey: ['publicBlogPosts'] });
          qc.invalidateQueries({ queryKey: ['publicBlogPost'] });
        }
      },
    });
    c.connect();
    return () => c.disconnect();
  }, [qc]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['adminBlogPosts', q, statusFilter, divisionFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (statusFilter) p.set('status', statusFilter);
      if (divisionFilter) p.set('division', divisionFilter);
      const r = await fetch(`${API}/api/blog/admin/posts?${p.toString()}`, { credentials: 'include' });
      if (!r.ok) throw new Error('load');
      return r.json();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const isEdit = !!editing?.id;
      const url = isEdit ? `/api/blog/admin/posts/${editing.id}` : '/api/blog/admin/posts';
      const method = isEdit ? 'PATCH' : 'POST';
      const payload = {
        slug: form.slug?.trim().toLowerCase(),
        title: form.title,
        tldr: form.tldr,
        excerpt: form.excerpt,
        contentMarkdown: form.contentMarkdown,
        division: form.division || 'general',
        category: form.category || undefined,
        primaryKeyword: form.primaryKeyword || undefined,
        secondaryKeywords: form.secondaryKeywords ? form.secondaryKeywords.split(',').map((s:string)=>s.trim()).filter(Boolean) : undefined,
        pillarSlug: form.pillarSlug || undefined,
        metaTitle: form.metaTitle || undefined,
        metaDescription: form.metaDescription || undefined,
        ogImage: form.ogImage || undefined,
        authorName: form.authorName || undefined,
        status: form.status || 'draft',
        featured: !!form.featured,
      };
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'save failed');
      return j;
    },
    onSuccess: () => { setEditing(null); setForm({}); setAudit(null); qc.invalidateQueries({ queryKey: ['adminBlogPosts'] }); },
    onError: (e:any) => alert(e.message),
  });

  const publish = useMutation({
    mutationFn: async (id:string) => {
      const r = await fetch(`${API}/api/blog/admin/posts/${id}/publish`, { method: 'POST', credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'publish failed');
      return j;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminBlogPosts'] }),
    onError: (e:any) => alert(e.message),
  });
  const del = useMutation({
    mutationFn: async (id:string) => { const r = await fetch(`${API}/api/blog/admin/posts/${id}`, { method: 'DELETE', credentials: 'include' }); if (!r.ok) throw new Error('delete failed'); return r.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminBlogPosts'] }),
  });
  const auditOne = async (id:string) => {
    const r = await fetch(`${API}/api/blog/admin/audit/${id}`, { credentials: 'include' });
    const j = await r.json();
    setAudit(j.audit);
  };

  const openNew = () => { setEditing({}); setForm({ division:'general', status:'draft', featured:false }); setAudit(null); };
  const openEdit = async (row:any) => {
    setEditing(row);
    setForm({
      slug: row.slug, title: row.title, tldr: row.tldr || '', excerpt: row.excerpt || '',
      contentMarkdown: row.contentMarkdown, division: row.division, category: row.category || '',
      primaryKeyword: row.primaryKeyword || '', secondaryKeywords: row.secondaryKeywords ? JSON.parse(row.secondaryKeywords).join(', ') : '',
      pillarSlug: row.pillarSlug || '', metaTitle: row.metaTitle || '', metaDescription: row.metaDescription || '',
      ogImage: row.ogImage || '', authorName: row.authorName || '', status: row.status, featured: !!row.featured,
    });
    // fetch fresh audit
    const r = await fetch(`${API}/api/blog/admin/audit/${row.id}`, { credentials: 'include' });
    const j = await r.json();
    setAudit(j.audit);
  };

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading Blog Studio…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search title / slug / keyword" className="flex-1 bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs" />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs">
            <option value="">All status</option><option value="draft">draft</option><option value="published">published</option><option value="scheduled">scheduled</option><option value="archived">archived</option>
          </select>
          <select value={divisionFilter} onChange={e=>setDivisionFilter(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs">
            <option value="">All divisions</option>{DIVISIONS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={openNew} className="bg-brand-navy text-white px-4 py-2 rounded text-xs font-bold hover:bg-brand-navy/90">+ New Post</button>
        <a href="/blog" target="_blank" className="border border-brand-navy/10 px-3 py-2 rounded text-xs font-bold">View /blog →</a>
      </div>

      <div className="rounded-2xl border border-brand-navy/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-brand-navy/[0.04] text-[13px] uppercase text-brand-navy/50">
              <tr><th className="p-3 text-left">Post</th><th className="p-3">Division</th><th className="p-3">Keyword</th><th className="p-3">Score</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {(data?.posts || []).map((p:any)=>(
                <tr key={p.id} className="border-t border-brand-navy/5 hover:bg-brand-navy/[0.02]">
                  <td className="p-3">
                    <div className="font-bold text-brand-navy truncate max-w-[260px]">{p.title}</div>
                    <div className="text-brand-navy/40 font-mono text-[13px]">/blog/{p.slug}</div>
                    {p.tldr && <div className="text-[13px] text-brand-navy/50 line-clamp-1 mt-1">{p.tldr.slice(0,90)}…</div>}
                  </td>
                  <td className="p-3"><span className="px-1.5 py-0.5 rounded bg-brand-navy/10 text-[13px]">{p.division}</span></td>
                  <td className="p-3 text-[13px]">{p.primaryKeyword || <span className="text-rose-500">— missing</span>}</td>
                  <td className="p-3"><ScoreBadge score={p._audit?.overall ?? 0} /></td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[13px] font-bold ${p.status==='published'?'bg-emerald-500/15 text-emerald-700': p.status==='draft'?'bg-amber-500/15 text-amber-700':'bg-brand-navy/10'}`}>{p.status}</span></td>
                  <td className="p-3 text-[13px] text-brand-navy/40">{new Date(p.updatedAt*1000).toLocaleDateString('en-IN')}</td>
                  <td className="p-3 flex gap-1 flex-wrap">
                    <button onClick={()=>openEdit(p)} className="px-2 py-1 rounded border border-brand-navy/10 hover:bg-brand-navy/5">Edit</button>
                    {p.status!=='published' ? <button onClick={()=>publish.mutate(p.id)} className="px-2 py-1 rounded bg-brand-gold text-brand-navy font-bold">Publish</button> : <button onClick={()=>auditOne(p.id)} className="px-2 py-1 rounded border">Audit</button>}
                    <a href={`/blog/${p.slug}?preview=1`} target="_blank" className="px-2 py-1 rounded border">Preview</a>
                    <button onClick={()=>{ if(confirm('Delete?')) del.mutate(p.id); }} className="px-2 py-1 rounded border border-rose-200 text-rose-600">Del</button>
                  </td>
                </tr>
              ))}
              {(data?.posts||[]).length===0 && <tr><td colSpan={7} className="p-10 text-center text-brand-navy/40">No posts yet — create your first gold-standard post.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-brand-navy/10 flex items-center justify-between">
              <h3 className="font-bold text-sm">{editing?.id ? 'Edit Post' : 'New Post'} <span className="text-brand-navy/40 font-normal">— Gold Standard (SEO+AEO+GEO+AIO)</span></h3>
              <button onClick={()=>setEditing(null)} className="px-3 py-1 rounded border">Close</button>
            </div>
            <div className="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
              {/* Editor */}
              <div className="lg:col-span-2 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60">Title (H1) *<input value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What is MBBS Abroad Admission Process?" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60">Slug *<input value={form.slug||''} onChange={e=>setForm({...form,slug:e.target.value})} placeholder="what-is-mbbs-abroad-process" className="mt-1 w-full border rounded px-3 py-2 text-xs font-mono" /></label>
                </div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">TL;DR — 2-3 sentence direct answer (blockquote after H1, AEO extractor) *<textarea value={form.tldr||''} onChange={e=>setForm({...form,tldr:e.target.value})} rows={3} placeholder="MBBS abroad is ... It requires ... Students who ...  (200-350 chars, must answer H1)" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Excerpt (155c metaDescription fallback) <input value={form.excerpt||''} onChange={e=>setForm({...form,excerpt:e.target.value})} placeholder="155-160 chars for SERP" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <label className="text-[13px] font-bold uppercase">Division<select value={form.division||'general'} onChange={e=>setForm({...form,division:e.target.value})} className="mt-1 w-full border rounded px-2 py-2 text-xs">{DIVISIONS.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
                  <label className="text-[13px] font-bold uppercase">Category<input value={form.category||''} onChange={e=>setForm({...form,category:e.target.value})} placeholder="MBBS Abroad" className="mt-1 w-full border rounded px-2 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase">Primary Keyword *<input value={form.primaryKeyword||''} onChange={e=>setForm({...form,primaryKeyword:e.target.value})} placeholder="mbbs abroad admission process" className="mt-1 w-full border rounded px-2 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase">Pillar Slug<input value={form.pillarSlug||''} onChange={e=>setForm({...form,pillarSlug:e.target.value})} placeholder="study-abroad" className="mt-1 w-full border rounded px-2 py-2 text-xs" /></label>
                </div>
                <label className="text-[13px] font-bold uppercase">Secondary Keywords (comma)<input value={form.secondaryKeywords||''} onChange={e=>setForm({...form,secondaryKeywords:e.target.value})} placeholder="mbbs abroad eligibility, mbbs abroad cost" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                <label className="text-[13px] font-bold uppercase">Content Markdown * — Must start with ## What is ...? and include 1 table + FAQ (5 Q/A)
                  <textarea value={form.contentMarkdown||''} onChange={e=>setForm({...form,contentMarkdown:e.target.value})} rows={18} placeholder={`## What is MBBS Abroad Admission?\nMBBS abroad admission is ... (definition sentence)\n\nTL;DR is above, this H2 opens with 40-60 word capsule.\n\n## Why it matters\n...\n\n| Country | Duration | Cost |\n|---|---|---|\n| Georgia | 5+1 yr | ₹35L |\n\n## FAQ\n### What is ...?\nAnswer <50 words, self-contained.\n`} className="mt-1 w-full border rounded px-3 py-2 text-xs font-mono" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-[13px] font-bold uppercase">Meta Title (50-60c)<input value={form.metaTitle||''} onChange={e=>setForm({...form,metaTitle:e.target.value})} placeholder="MBBS Abroad Admission Process — Opus Overseas" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase">Meta Description (155c)<input value={form.metaDescription||''} onChange={e=>setForm({...form,metaDescription:e.target.value})} placeholder="155 chars with primaryKeyword" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="text-[13px] font-bold uppercase">OG Image URL<input value={form.ogImage||''} onChange={e=>setForm({...form,ogImage:e.target.value})} placeholder="https://.../1200x630.jpg" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase">Author Name<input value={form.authorName||''} onChange={e=>setForm({...form,authorName:e.target.value})} placeholder="Dr. Ayesha, Opus Counselor" className="mt-1 w-full border rounded px-3 py-2 text-xs" /></label>
                  <label className="text-[13px] font-bold uppercase">Status<select value={form.status||'draft'} onChange={e=>setForm({...form,status:e.target.value})} className="mt-1 w-full border rounded px-3 py-2 text-xs"><option value="draft">draft</option><option value="published">published</option><option value="scheduled">scheduled</option><option value="archived">archived</option></select></label>
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!form.featured} onChange={e=>setForm({...form,featured:e.target.checked})} /> Featured on /blog hero</label>
              </div>
              {/* Right rail: audit + extractability */}
              <div className="space-y-3">
                <div className="rounded-xl border p-3 bg-brand-navy/[0.03]">
                  <div className="text-[13px] font-bold uppercase text-brand-navy/60 mb-2">Content Score — SEO+AEO+Readability</div>
                  {audit ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex gap-2"><ScoreBadge score={audit.overall} /><span className="text-[13px]">Overall {audit.overall}/100 — projected {audit.projected}</span></div>
                      <div className="grid grid-cols-3 gap-1 text-[13px]"><span>SEO {audit.seo}</span><span>AEO {audit.aeo}</span><span>Read {audit.readability}</span></div>
                      {audit.critical.length>0 && <div className="text-rose-600"><div className="font-bold">Critical</div>{audit.critical.map((c:string,i:number)=><div key={i}>• {c}</div>)}</div>}
                      {audit.important.length>0 && <div className="text-amber-700"><div className="font-bold">Important</div>{audit.important.map((c:string,i:number)=><div key={i}>• {c}</div>)}</div>}
                      {audit.polish.length>0 && <div className="text-brand-navy/40"><div className="font-bold">Polish</div>{audit.polish.map((c:string,i:number)=><div key={i}>• {c}</div>)}</div>}
                    </div>
                  ) : <div className="text-sm text-brand-navy/40">Save to see live audit (overall/SEO/AEO/readability).</div>}
                  <div className="mt-2 text-[13px] text-brand-navy/40">Gold checklist: TL;DR after H1, "What is" H2 with definition, 40-60w capsule per H2, 1 table, FAQ 5×&lt;50w, author Person, source hyperlinks.</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[13px] font-bold uppercase mb-1">Extractability Preview (what Perplexity sees)</div>
                  <div className="text-sm text-brand-navy/70 space-y-1">
                    <div className="p-2 rounded bg-amber-50 border border-amber-200"><b>TL;DR:</b> {form.tldr || <span className="text-brand-navy/30">— add TL;DR —</span>}</div>
                    <div className="p-2 rounded bg-white border"><b>Definition:</b> first line of "What is" H2 will be lifted</div>
                    <div className="p-2 rounded bg-white border">FAQ answers must be &lt;50w and self-contained</div>
                  </div>
                </div>
                <button onClick={()=>save.mutate()} disabled={save.isPending} className="w-full bg-brand-navy text-white py-2.5 rounded font-bold text-sm hover:bg-brand-navy/90 disabled:opacity-50">{save.isPending ? 'Saving…' : editing?.id ? 'Save Changes' : 'Create Post'}</button>
                <div className="text-[13px] text-brand-navy/40">Primary keyword is unique across posts — cannibalization blocked (409 if duplicate). Slug is URL — ^[a-z0-9-]+$.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
