import { describe, it, expect } from 'vitest';
import { matchApplication, profileFromIntakeContext, normalizeEnglish } from '../src/lib/studyAbroadMatch.js';

describe('studyAbroadMatch — reach/match/safe tiers', () => {
  const profile = { cgpa: 8.2, englishScore: 7.0, tuitionBudget: 25, targetCountry: 'Canada', preferredCourse: 'Computer Science' };

  it('match: all thresholds pass', () => {
    const r = matchApplication(profile, { minGpa: 7.5, minEnglishScore: 6.5, tuitionLpaMax: 24, country: 'Canada' });
    expect(r.tier).toBe('match');
    expect(r.misses).toHaveLength(0);
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it('safe: comfortably above everything (score ≥ 85)', () => {
    const r = matchApplication({ cgpa: 9.5, englishScore: 8.0, tuitionBudget: 40, targetCountry: 'Canada' }, { minGpa: 5.5, minEnglishScore: 5.5, tuitionLpaMax: 12, country: 'Canada' });
    expect(r.tier).toBe('safe');
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it('reach: one hard miss (CGPA below)', () => {
    const r = matchApplication({ cgpa: 6.8, englishScore: 7.0, tuitionBudget: 25, targetCountry: 'Canada' }, { minGpa: 7.5, minEnglishScore: 6.5, tuitionLpaMax: 24, country: 'Canada' });
    expect(r.tier).toBe('reach');
    expect(r.misses).toContain('CGPA');
  });

  it('reach: country mismatch only (soft miss)', () => {
    const r = matchApplication({ cgpa: 8.2, englishScore: 7.0, tuitionBudget: 25, targetCountry: 'USA' }, { minGpa: 7.5, minEnglishScore: 6.5, tuitionLpaMax: 24, country: 'Canada' });
    expect(r.tier).toBe('reach');
    expect(r.misses).toEqual(['Country']);
  });

  it('reach: multiple hard misses still reach (risky, not match)', () => {
    const r = matchApplication({ cgpa: 5.5, englishScore: 5.5, tuitionBudget: 10, targetCountry: 'Canada' }, { minGpa: 7.5, minEnglishScore: 6.5, tuitionLpaMax: 24, country: 'Canada' });
    expect(r.tier).toBe('reach');
    expect(r.misses).toContain('CGPA');
    expect(r.misses).toContain('English');
  });

  it('missing profile values produce misses, not crashes', () => {
    const r = matchApplication({}, { minGpa: 7.5, minEnglishScore: 6.5, tuitionLpaMax: 24 });
    expect(r.misses).toContain('CGPA');
    expect(r.misses).toContain('English');
    expect(r.misses).toContain('Budget');
    expect(r.tier).toBe('reach');
  });

  it('profileFromIntakeContext parses canonical keys', () => {
    const p = profileFromIntakeContext(JSON.stringify({ cgpa: 8.2, englishTest: 'IELTS', englishScore: 7.0, targetIntake: 'Fall 2027', targetCountry: 'Canada', tuitionBudget: 25, preferredCourse: 'CS' }));
    expect(p.cgpa).toBe(8.2);
    expect(p.englishScore).toBe(7.0);
    expect(p.tuitionBudget).toBe(25);
    expect(p.targetCountry).toBe('Canada');
    expect(p.preferredCourse).toBe('CS');
  });

  it('profileFromIntakeContext tolerates garbage', () => {
    expect(profileFromIntakeContext('not json')).toEqual({});
    expect(profileFromIntakeContext(null)).toEqual({});
  });

  it('normalizeEnglish maps TOEFL/PTE to approximate IELTS bands', () => {
    expect(normalizeEnglish(7.0, 'IELTS')).toBe(7.0);
    expect(normalizeEnglish(100, 'TOEFL')).toBe(7);
    expect(normalizeEnglish(65, 'PTE')).toBe(7);
    expect(normalizeEnglish(50, 'PTE')).toBe(6);
    expect(normalizeEnglish(null, 'IELTS')).toBeNull();
  });
});