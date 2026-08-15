import { useState, useEffect, useRef, useCallback } from 'react';

// Sound + toast notification for new open tasks (quote requests etc.).
// Polls /api/tasks?status=open, plays a Web Audio beep when a NEW task appears
// (urgent = two-tone higher pitch), and shows a toast banner on the dashboard.
// No audio asset needed — synthesized with the Web Audio API.

const SEEN_KEY = 'opusos_seen_task_ids';

function playBeep(urgent: boolean) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = urgent ? [880, 1174.66] : [523.25, 659.25]; // urgent: A5→D#6 · normal: C5→E5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* audio unavailable — silent */ }
}

export function useTaskNotifications(intervalMs = 20000) {
  const [toast, setToast] = useState<{ title: string; urgent: boolean } | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Load previously seen ids once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) seenRef.current = new Set(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/tasks?status=open');
      if (!r.ok) return;
      const j = await r.json();
      const tasks: any[] = j.tasks || [];
      const fresh = tasks.filter(t => !seenRef.current.has(t.id));
      if (fresh.length > 0) {
        const newest = fresh[0];
        const urgent = newest.priority === 'urgent';
        playBeep(urgent);
        setToast({ title: newest.title, urgent });
        // Auto-dismiss after 6s
        setTimeout(() => setToast(null), 6000);
      }
      // Remember all current ids (so re-polls don't re-alert)
      const ids = new Set(tasks.map(t => t.id));
      seenRef.current = ids;
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
    } catch { /* poll silently */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, dismissToast };
}