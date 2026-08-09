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
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(ref.current!.querySelectorAll('.reveal')).forEach((el) => {
        gsap.fromTo(el, { y: 34, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
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