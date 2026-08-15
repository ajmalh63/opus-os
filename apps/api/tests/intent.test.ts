import { describe, it, expect } from 'vitest';
import { resolvePrimaryDivision, inferDivisionFromContext, declaredDivisions, DIVISIONS } from '../src/lib/intent.js';

// Primary-interest resolution (Wave 4) — declared intent wins, heuristics
// next, never a wrong-division guess.
describe('intent resolution (primary division)', () => {
  const client = (over: Record<string, any>) => ({
    primaryDivision: null, intentDivisions: null, intakeContext: null, highestQualification: null, ...over,
  });

  it('declares all five divisions by direct mapping', () => {
    expect(DIVISIONS).toEqual(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']);
  });

  it('priority 1: active engagement division beats declared intent', () => {
    const c = client({ primaryDivision: 'visa' });
    expect(resolvePrimaryDivision(c, 'umrah')).toBe('umrah');
  });

  it('priority 2: declared primaryDivision is used when no active engagement', () => {
    const c = client({ primaryDivision: 'manpower' });
    expect(resolvePrimaryDivision(c)).toBe('manpower');
    // and an engagement with a non-active/none value falls through to intent
    expect(resolvePrimaryDivision(c, null)).toBe('manpower');
  });

  it('priority 3: infers from intake context when nothing declared', () => {
    expect(resolvePrimaryDivision(client({ intakeContext: JSON.stringify({ visaCategory: 'work visa', targetCountry: 'UAE' }) }))).toBe('visa');
    expect(resolvePrimaryDivision(client({ intakeContext: JSON.stringify({ umrahDeparture: 'Ramadan Umrah' }) }))).toBe('umrah');
    expect(resolvePrimaryDivision(client({ intakeContext: JSON.stringify({ attestationCategory: 'certificate attestation' }) }))).toBe('attestation');
    expect(resolvePrimaryDivision(client({ intakeContext: JSON.stringify({ manpowerSector: 'construction jobs' }) }))).toBe('manpower');
    expect(resolvePrimaryDivision(client({ intakeContext: JSON.stringify({ targetCountry: 'Canada' }), highestQualification: 'undergrad' }))).toBe('study-abroad');
  });

  it('study-abroad via country/ielts; visa via visaCategory (strong signals win)', () => {
    expect(inferDivisionFromContext(client({ intakeContext: JSON.stringify({ visaCategory: 'work visa', targetCountry: 'UAE' }) }))).toBe('visa');
    expect(inferDivisionFromContext(client({ intakeContext: JSON.stringify({ targetCountry: 'USA' }) }))).toBe('study-abroad');
    expect(inferDivisionFromContext(client({ intakeContext: JSON.stringify({ ielts: 'band 7' }) }))).toBe('study-abroad');
    expect(inferDivisionFromContext(client({ intakeContext: JSON.stringify({ targetCountry: 'UAE', manpowerSector: 'construction' }) }))).toBe('manpower'); // strong beats weak
  });

  it('qualification hint as last resort', () => {
    expect(inferDivisionFromContext(client({ highestQualification: 'postgraduate' }))).toBe('study-abroad');
    expect(inferDivisionFromContext(client({ highestQualification: 'jobseeker' }))).toBe('manpower');
  });

  it('no signal → undefined (caller must not guess)', () => {
    expect(inferDivisionFromContext(client({}))).toBeUndefined();
    expect(resolvePrimaryDivision(client({}))).toBeUndefined();
  });

  it('declaredDivisions parses multi-interest safely', () => {
    expect(declaredDivisions(client({ intentDivisions: '["visa","study-abroad"]' }))).toEqual(['visa', 'study-abroad']);
    expect(declaredDivisions(client({ intentDivisions: 'not-json' }))).toEqual([]);
    expect(declaredDivisions(client({}))).toEqual([]);
  });

  it('handles snake_case rows (emulator/drizzle raw) as well as camelCase', () => {
    // mock D1 SELECT returns snake_case column keys (intake_context)
    const row = { intake_context: JSON.stringify({ targetCountry: 'US' }), highest_qualification: 'undergrad', primary_division: null, intent_divisions: null };
    expect(resolvePrimaryDivision(row as any)).toBe('study-abroad');
    expect(inferDivisionFromContext(row as any)).toBe('study-abroad');
  });
});