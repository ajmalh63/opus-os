import { describe, it, expect, vi } from 'vitest';
import { parseResumeWithAI } from '../src/infra/ai.js';

describe('Workers AI resume parser (real mode)', () => {
  it('returns unavailable when AI binding is missing', async () => {
    const res = await parseResumeWithAI({}, 'text');
    expect(res.ok).toBe(false);
    expect(res.available).toBe(false);
  });

  it('parses strict JSON from the model into a candidate', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: JSON.stringify({ name: 'Riya Khan', email: 'riya@example.com', phone: '+91 92345 67890', skills: ['Java', 'SQL'], experience: ['Dev at X (2y)'], education: 'B.Tech' }) }) };
    const res = await parseResumeWithAI({ AI: ai }, 'some resume text');
    expect(res.ok).toBe(true);
    expect(res.available).toBe(true);
    expect(res.candidate?.name).toBe('Riya Khan');
    expect(res.candidate?.skills).toEqual(['Java', 'SQL']);
  });

  it('returns a clean failure on malformed model output', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'not json' }) };
    const res = await parseResumeWithAI({ AI: ai }, 'x');
    expect(res.ok).toBe(false);
    expect(res.available).toBe(true);
    expect(res.reason).toContain('failed');
  });
});