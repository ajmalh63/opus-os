import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Workspace-scale reveal system — borrows the public site's motion language
// (Power3 fade-up reveals, once-triggered) but scoped to a module root.
// Usage:
//   const rootRef = useRevealRef();       // attach to module root
//   <div ref={rootRef} className="reveal">…
// Targets: .reveal (generic), .rv-kpi (numbered tiles).
export function useRevealRoot<T extends HTMLElement>() {
  const ref = { current: null as T | null };
  useEffect(() => {
    if (!ref.current) return;
    // The workspace scrolls inside the shell's <main> (and AdminConsole has its
    // own inner scroller), never the window — so pin each trigger to the nearest
    // scrollable ancestor or reveals below the fold would never fire.
    const scrollerOf = (el: HTMLElement): Element | null => {
      let p = el.parentElement;
      while (p) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === 'auto' || oy === 'scroll') return p;
        p = p.parentElement;
      }
      return null;
    };
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(ref.current!.querySelectorAll('.reveal')).forEach((el) => {
        const vars: ScrollTrigger.Vars = { trigger: el, start: 'top 86%', once: true };
        const scroller = scrollerOf(el);
        if (scroller) vars.scroller = scroller;
        gsap.fromTo(el, { y: 34, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
          scrollTrigger: vars,
        });
      });
    }, ref);
    return () => ctx.revert();
  }, []);
  return ref;
}

// Animated number counter for KPI tiles (matches homepage .stat-num pattern).
export function useCountUp(refKey: string, value: number, deps: unknown[] = []) {
  useEffect(() => {
    if (!value) return;
    const els = document.querySelectorAll(`[data-count="${refKey}"]`);
    els.forEach((el) => {
      gsap.fromTo(el, { innerText: 0 }, {
        innerText: value,
        snap: { innerText: 1 },
        duration: 1.1,
        ease: 'power2.out',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}