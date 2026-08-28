import { Link, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useVisibilityTracking } from '../lib/visibilityTracking';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// Minimal markdown → HTML (headings, tables, faq, bold, links, lists) — keeps bundle light vs full MDX
function mdToHtml(md: string): string {
  let html = md
    .replace(/^###\s+(.+)$/gm, '<h3 class="font-bold text-sm mt-4 mb-1">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 class="font-display font-bold text-lg mt-6 mb-2 text-brand-navy">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="underline text-brand-navy hover:text-brand-gold" target="_blank" rel="noopener">$1</a>');
  // Tables: simple pipe table
  html = html.replace(/^\|.+\|$/gm, (line) => line); // keep as is, wrap later via prose table styles
  // Paragraphs: split double newline
  const blocks = html.split(/\n\n+/).map(b => {
    const t = b.trim();
    if (!t) return '';
    if (t.startsWith('<h2') || t.startsWith('<h3') || t.startsWith('|') || t.startsWith('<a') ) return t;
    return `<p class="text-sm leading-6 text-brand-navy/80 my-2">${t.replace(/\n/g,'<br/>')}</p>`;
  }).join('\n');
  // Table wrapper
  return blocks.replace(/(\|.*\|[\s\S]*?)(?=\n\n|<h2|<h3|$)/g, (m) => {
    if (!m.includes('|')) return m;
    const rows = m.trim().split('\n').filter(l=>l.includes('|')).map(r => r.split('|').filter(Boolean).map(c=>c.trim()));
    if (rows.length<2) return m;
    const head = rows[0];
    const bodyRows = rows.slice(2); // skip separator row
    let out = '<div class="overflow-x-auto my-4"><table class="w-full text-xs border-collapse">';
    out += `<thead><tr class="bg-brand-navy/[0.04]">${head.map(h=>`<th class="border border-brand-navy/10 px-3 py-2 text-left font-bold">${h}</th>`).join('')}</tr></thead><tbody>`;
    for (const r of bodyRows) out += `<tr>${r.map(c=>`<td class="border border-brand-navy/10 px-3 py-2">${c}</td>`).join('')}</tr>`;
    out += '</tbody></table></div>';
    return out;
  });
}

function buildToc(md: string): { id:string, text:string, level:number }[] {
  const heads: { id:string, text:string, level:number }[] = [];
  const re = /^##\s+(.+)$/gm; let m;
  while ((m = re.exec(md))) {
    const text = m[1].trim();
    heads.push({ id: text.toLowerCase().replace(/[^a-z0-9]+/g,'-'), text, level: 2 });
  }
  return heads.slice(0, 8);
}

export default function BlogPost() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['publicBlogPost', slug],
    queryFn: async () => {
      const r = await fetch(`${API}/api/blog/posts/${slug}`);
      if (!r.ok) throw new Error('not found');
      return r.json();
    },
    staleTime: 10000,
    refetchInterval: 30000, // realtime-ish: if author fixes typo while reader is on page, refresh within 30s
    refetchOnWindowFocus: true,
  });
  useVisibilityTracking(slug ? `/blog/${slug}` : '/blog');
  const post = data?.post;
  const related: any[] = data?.related || [];
  const toc = useMemo(()=> post ? buildToc(post.contentMarkdown||'') : [], [post]);

  useEffect(()=>{
    if (!post) return;
    document.title = post.metaTitle || post.title;
    // JSON-LD: Article + FAQPage + BreadcrumbList (per-engine lever, Google says not required for AIO but helps Perplexity/ChatGPT)
    const ldArticle = {
      "@context":"https://schema.org","@type":"BlogPosting",
      headline: post.title, description: post.metaDescription || post.excerpt || post.tldr,
      image: post.ogImage || undefined, datePublished: post.publishedAt ? new Date(post.publishedAt*1000).toISOString() : undefined,
      dateModified: post.dateModified ? new Date(post.dateModified*1000).toISOString() : undefined,
      author: { "@type":"Person", name: post.authorName || "Opus Overseas", url: "https://opusoverseas.com/#person", sameAs: ["https://www.linkedin.com/company/opus-overseas"] },
      publisher: { "@type":"Organization", name:"Opus Overseas", url:"https://opusoverseas.com", logo: { "@type":"ImageObject", url:"https://opusoverseas.com/logo.png" }, sameAs: ["https://opusoverseas.com","https://www.linkedin.com/company/opus-overseas"] },
      mainEntityOfPage: `https://opusoverseas.com/blog/${post.slug}`,
    };
    let ldFaq: any = null;
    if (post.contentMarkdown?.includes('## FAQ')) {
      const faqBlock = post.contentMarkdown.split('## FAQ')[1] || '';
      const qa = [...faqBlock.matchAll(/###\s+(.+)\n([\s\S]*?)(?=###|$)/g)].slice(0,5).map(m=>({ q: m[1].trim(), a: m[2].trim().split('\n')[0].slice(0,300) }));
      if (qa.length) ldFaq = { "@context":"https://schema.org","@type":"FAQPage", mainEntity: qa.map(x=>({ "@type":"Question", name:x.q, acceptedAnswer: { "@type":"Answer", text: x.a }})) };
    }
    const ldBreadcrumb = { "@context":"https://schema.org","@type":"BreadcrumbList", itemListElement: [{ "@type":"ListItem", position:1, name:"Home", item:"https://opusoverseas.com/" },{ "@type":"ListItem", position:2, name:"Blog", item:"https://opusoverseas.com/blog" },{ "@type":"ListItem", position:3, name:post.title, item:`https://opusoverseas.com/blog/${post.slug}` }] };
    for (const [id,obj] of [['ld-blog',ldArticle],['ld-faq',ldFaq],['ld-bc',ldBreadcrumb]]) {
      if (!obj) continue;
      let el = document.getElementById(id) as HTMLScriptElement|null;
      if (!el) { el = document.createElement('script'); el.id=id; el.type='application/ld+json'; document.head.appendChild(el); }
      el.textContent = JSON.stringify(obj);
    }
  }, [post]);

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/40">Loading guide…</div>;
  if (error || !post) return <div className="max-w-3xl mx-auto p-10 text-center"><h1 className="font-bold">Guide not found</h1><Link href="/blog" className="underline text-sm">Back to Blog →</Link></div>;

  const html = mdToHtml(post.contentMarkdown || '');

  return (
    <div className="min-h-screen bg-[#fcf9f4]">
      <div className="max-w-6xl mx-auto px-5 py-8 grid lg:grid-cols-[1fr_260px] gap-8">
        <article className="bg-white rounded-2xl border border-brand-navy/10 p-6 md:p-8 space-y-4">
          <div className="flex flex-wrap gap-1 text-[13px]"><Link href="/blog" className="underline">Blog</Link><span>›</span><span className="px-1.5 py-0.5 rounded bg-brand-navy/10 uppercase font-bold">{post.division}</span>{post.category && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">{post.category}</span>}</div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-navy leading-tight">{post.title}</h1>
          <div className="text-sm text-brand-navy/40">{post.authorName || 'Opus Overseas'} • {post.publishedAt ? new Date(post.publishedAt*1000).toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' }) : ''} {post.dateModified ? `• Updated ${new Date(post.dateModified*1000).toLocaleDateString('en-IN')}` : ''} • {post.readingMinutes || 5} min</div>
          {post.tldr && <blockquote className="border-l-4 border-brand-gold bg-amber-50 rounded-r-xl p-3 text-sm text-brand-navy/80 italic">TL;DR — {post.tldr}</blockquote>}
          <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="mt-8 p-4 rounded-xl bg-brand-navy text-white flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold">Need this done for you?</div>
            <Link href="/lead-form" className="bg-brand-gold text-brand-navy px-4 py-2 rounded-full text-xs font-bold">Talk to a Counselor →</Link>
          </div>
          <div className="pt-4 border-t border-brand-navy/10 text-[13px] text-brand-navy/40">Primary keyword: <span className="font-mono bg-brand-navy/10 px-1 rounded">{post.primaryKeyword || '—'}</span> {post.pillarSlug && <>• Pillar:  <Link href={`/blog?pillar=${post.pillarSlug}`} className="underline">{post.pillarSlug}</Link></>} • Canonical: <span className="font-mono">{post.canonical || `https://opusoverseas.com/blog/${post.slug}`}</span></div>
        </article>
        <aside className="space-y-4">
          {toc.length>0 && <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 sticky top-4">
            <div className="text-[13px] font-bold uppercase tracking-wide mb-2">On this page</div>
            <ul className="space-y-1 text-xs">{toc.map(t=><li key={t.id}><a href={`#${t.id}`} className="hover:underline text-brand-navy/70">{t.text}</a></li>)}</ul>
          </div>}
          {related.length>0 && <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
            <div className="text-[13px] font-bold uppercase mb-2">Related reading</div>
            <div className="space-y-2">{related.map((r:any)=><Link key={r.id} href={`/blog/${r.slug}`} className="block text-xs hover:underline"><span className="font-bold">{r.title}</span><div className="text-brand-navy/40">{r.division}</div></Link>)}</div>
          </div>}
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
            <div className="text-[13px] font-bold uppercase mb-2">Citation tip</div>
            <p className="text-sm text-brand-navy/60">This guide is structured for AI citations: TL;DR + definition sentence + table + FAQ (5). Ask ChatGPT “What is {post.primaryKeyword} — Opus Overseas?” to see the lift.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
