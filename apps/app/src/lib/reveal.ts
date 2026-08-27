import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Workspace-scale reveal system — borrows the public site's motion language
// (Power3 fade-up reveals, once-triggered) but scoped to a module root.
// Usage:
//   const rootRef = useRevealRoot();       // attach to module root
//   <div ref={rootRef} className="reveal">…
// Targets: .reveal (generic), .rv-kpi (numbered tiles).
export function useRevealRoot<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const targets = ref.current.querySelectorAll('.reveal');
    if (!targets.length) return;

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
      gsap.utils.toArray<HTMLElement>(targets).forEach((el) => {
        const vars: ScrollTrigger.Vars = { trigger: el, start: 'top 95%', once: true };
        const scroller = scrollerOf(el);
        if (scroller) vars.scroller = scroller;
        gsap.fromTo(el, { y: 20, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.6, ease: 'power2.out',
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