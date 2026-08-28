import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useVisibilityTracking } from '../lib/visibilityTracking';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

export default function BlogIndex() {
  useVisibilityTracking('/blog');
  const [q, setQ] = useState('');
  const [division, setDivision] = useState('');
  const { data, isLoading } = useQuery<any>({
    queryKey: ['publicBlogPosts', q, division],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (division) p.set('division', division);
      const r = await fetch(`${API}/api/blog/posts?${p.toString()}`);
      if (!r.ok) throw new Error('load');
      return r.json();
    },
    refetchInterval: 30000, // realtime-ish for public visitors (staff gets WS push via BlogManager)
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });
  const posts: any[] = data?.posts || [];
  const featured = posts.find(p => p.featured) || posts[0];

  return (
    <div className="min-h-screen bg-[#fcf9f4]">
      <div className="max-w-6xl mx-auto px-5 py-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Opus Overseas — Journal</div>
          <h1 className="font-display font-bold text-3xl text-brand-navy">Guides for Study, Visa & Attestation</h1>
          <p className="text-xs text-brand-navy/50 max-w-2xl mx-auto">Every guide is built for SEO + AEO + GEO + AIO: TL;DR answer, definition, comparison table, FAQ (5), author Person + publisher Organization — citable by ChatGPT, Perplexity and Google AI Overviews.</p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search guides (e.g. MBBS abroad cost)" className="bg-white border border-brand-navy/10 rounded-full px-4 py-2 text-xs w-72" />
            <select value={division} onChange={e=>setDivision(e.target.value)} className="bg-white border border-brand-navy/10 rounded-full px-3 py-2 text-xs">
              <option value="">All divisions</option>
              <option value="study-abroad">Study Abroad</option>
              <option value="visa-services">Visa Services</option>
              <option value="attestation">Attestation</option>
              <option value="umrah-travel">Tours & Travels</option>
              <option value="manpower">Manpower</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        {isLoading && <div className="text-center text-xs text-brand-navy/40 py-10">Loading…</div>}

        {featured && !q && !division && (
           <Link href={`/blog/${featured.slug}`} className="block rounded-2xl overflow-hidden border border-brand-navy/10 bg-white hover:shadow-lg transition">
            <div className="grid md:grid-cols-2">
              {featured.ogImage ? <img src={featured.ogImage} alt={featured.title} className="w-full h-64 object-cover" /> : <div className="h-64 bg-brand-navy/[0.04]" />}
              <div className="p-6 space-y-3">
                <div className="flex gap-2"><span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[13px] font-bold uppercase">Featured</span><span className="px-2 py-0.5 rounded-full bg-brand-navy/10 text-[13px]">{featured.division}</span></div>
                <h2 className="font-display font-bold text-xl text-brand-navy leading-tight">{featured.title}</h2>
                <blockquote className="border-l-2 border-brand-gold pl-3 text-xs text-brand-navy/70 italic">{featured.tldr?.slice(0,180)}…</blockquote>
                <div className="text-[13px] text-brand-navy/40">{featured.authorName || 'Opus Overseas'} • {featured.readingMinutes || 5} min • {featured.publishedAt ? new Date(featured.publishedAt*1000).toLocaleDateString('en-IN') : ''}</div>
              </div>
            </div>
          </Link>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {(isLoading ? [] : posts.filter((p:any)=> !featured || p.id !== featured.id)).map((p:any)=>(
            <Link key={p.id} href={`/blog/${p.slug}`} className="rounded-2xl border border-brand-navy/10 bg-white overflow-hidden hover:shadow-md transition">
              {p.ogImage ? <img src={p.ogImage} alt={p.title} className="w-full h-40 object-cover" /> : <div className="h-40 bg-brand-navy/[0.04]" />}
              <div className="p-4 space-y-2">
                <div className="flex gap-1"><span className="px-1.5 py-0.5 rounded bg-brand-navy/10 text-xs uppercase font-bold">{p.division}</span></div>
                <h3 className="font-bold text-sm text-brand-navy line-clamp-2 leading-tight">{p.title}</h3>
                <p className="text-sm text-brand-navy/50 line-clamp-2">{p.excerpt || p.tldr?.slice(0,100)}</p>
                <div className="text-[13px] text-brand-navy/30">{p.primaryKeyword ? `“${p.primaryKeyword}”` : ''} • {p.readingMinutes || 5} min</div>
              </div>
            </Link>
          ))}
        </div>

        {posts.length===0 && !isLoading && <div className="text-center text-xs text-brand-navy/40 py-10">No guides yet — check back soon or ask our counselors.</div>}

        <div className="rounded-xl bg-brand-navy text-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">Need a guide on your exact query?</div>
          <Link href="/lead-form" className="bg-brand-gold text-brand-navy px-4 py-2 rounded-full text-xs font-bold">Ask a Counselor →</Link>
        </div>
      </div>
    </div>
  );
}
