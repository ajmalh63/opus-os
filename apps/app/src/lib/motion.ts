import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Wait-for-fonts helper so split/positional animations measure real layout.
export async function whenFontsReady(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    await document.fonts?.ready;
  } catch {
    /* noop */
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Fade-up reveal (one element). Returns nothing; safe no-op for reduced motion.
export function fadeUp(el: Element | null, opts: { y?: number; duration?: number; delay?: number; ease?: string } = {}) {
  if (!el) return;
  const { y = 48, duration = 1, delay = 0, ease = 'power3.out' } = opts;
  if (prefersReducedMotion()) return;
  gsap.fromTo(el, { y, opacity: 0 }, { y: 0, opacity: 1, duration, delay, ease });
}

// Staggered group reveal (e.g. cards, chips).
export function staggerReveal(
  els: HTMLElement[] | string,
  opts: { y?: number; duration?: number; stagger?: number; delay?: number; ease?: string } = {}
) {
  const targets = typeof els === 'string' ? gsap.utils.toArray(els) : els;
  if (!targets.length || prefersReducedMotion()) return;
  const { y = 32, duration = 0.9, stagger = 0.12, delay = 0, ease = 'power3.out' } = opts;
  gsap.fromTo(targets, { y, opacity: 0 }, { y: 0, opacity: 1, duration, stagger, delay, ease });
}

// Split a headline into word spans (idempotent via data-split). Returns the word spans.
// SECURITY [L6-XSS]: textContent + createElement avoids innerHTML injection —
// even though headlines are developer-controlled today, defense-in-depth
// prevents DOM-XSS if any dynamic content ever flows here (OWASP A03).
export function splitHeadline(el: HTMLElement): HTMLElement[] {
  if (el.getAttribute('data-split')) {
    return Array.from(el.querySelectorAll<HTMLElement>('.hw')) || [];
  }
  const text = el.textContent ?? '';
  const words = text.trim().split(/\s+/).filter(Boolean);
  // Clear via safe DOM API (no HTML parsing)
  el.textContent = '';
  for (const w of words) {
    const outer = document.createElement('span');
    outer.className = 'hw inline-block overflow-hidden';
    const inner = document.createElement('span');
    inner.className = 'hw-i inline-block will-change-transform';
    inner.textContent = w; // auto-escaped
    outer.appendChild(inner);
    el.appendChild(outer);
    // Preserve inter-word space via text node (prevents words merging)
    el.appendChild(document.createTextNode(' '));
  }
  el.setAttribute('data-split', '1');
  return Array.from(el.querySelectorAll<HTMLElement>('.hw-i'));
}

// Animate the word spans of an element (call splitHeadline first).
export function animateHeadlineWords(el: HTMLElement, opts: { delay?: number; y?: number; stagger?: number; duration?: number } = {}) {
  const { delay = 0, y = 60, stagger = 0.045, duration = 1 } = opts;
  if (prefersReducedMotion()) return;
  const words = splitHeadline(el);
  if (!words.length) return;
  gsap.fromTo(words, { y, opacity: 0, rotateX: 35 }, { y: 0, opacity: 1, rotateX: 0, duration, stagger, delay, ease: 'power4.out', transformOrigin: '50% 100%' });
}

// Animated number count-up. Respects reduced motion (sets final instantly).
export function countUp(el: HTMLElement, target: number, opts: { duration?: number; prefix?: string; suffix?: string } = {}) {
  const { duration = 1.4, prefix = '', suffix = '' } = opts;
  if (prefersReducedMotion()) {
    el.textContent = `${prefix}${target.toLocaleString('en-IN')}${suffix}`;
    return;
  }
  const state = { v: 0 };
  gsap.to(state, {
    v: target,
    duration,
    ease: 'power2.out',
    onUpdate() {
      el.textContent = `${prefix}${Math.round(state.v).toLocaleString('en-IN')}${suffix}`;
    },
  });
}

// Infinite marquee: duplicate content once, loop xPercent -50.
export function marqueeLoop(el: HTMLElement, opts: { speed?: number; dir?: 1 | -1 } = {}) {
  const { speed = 80, dir = 1 } = opts;
  if (prefersReducedMotion() || !el) return;
  const track = el.firstElementChild as HTMLElement | null;
  if (!track) return;
  const clone = track.cloneNode(true) as HTMLElement;
  el.appendChild(clone);
  // Tail-based seamless loop: animate the first child left by half the copy width,
  // then reset x to 0 instantly on repeat (two identical halves = invisible gap).
  const copyWidth = () => track.scrollWidth / 2;
  gsap.to(track, {
    x: () => dir * copyWidth(),
    duration: () => Math.abs(copyWidth() / speed),
    ease: 'none',
    repeat: -1,
    onRepeat: () => gsap.set(track, { x: 0 }),
  });
}

// Scroll-linked parallax (background drifts slower than foreground).
export function parallaxY(el: HTMLElement, opts: { amount?: number; scrub?: number | boolean } = {}) {
  if (prefersReducedMotion()) return;
  const { amount = 30, scrub = 1 } = opts;
  gsap.to(el, {
    yPercent: amount,
    ease: 'none',
    scrollTrigger: {
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      scrub,
    },
  });
}

// Use inside a component: const ctx = gsapContext(rootRef); ... ; return () => ctx.revert();
export function makeContext(root: HTMLElement | null | undefined) {
  return gsap.context(() => {}, root || undefined);
}