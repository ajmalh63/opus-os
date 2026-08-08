import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Public hero artifacts (Section 24.1.1)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.job_postings.push(
      { id: 'job-1', title: 'Staff Nurse', country: 'UAE', sector: 'healthcare', salary_text: '₹18-25 LPA', status: 'open', created_at: 1 },
      { id: 'job-2', title: 'Site Engineer', country: 'Qatar', sector: 'construction', salary_text: '₹15-20 LPA', status: 'open', created_at: 1 },
      { id: 'job-3', title: 'Filled Role', country: 'Saudi', sector: 'hospitality', salary_text: '₹10 LPA', status: 'filled', created_at: 1 }
    );
    mockD1.tables.attestation_chains.push({
      id: 'chain-1', country: 'UAE',
      steps_json: JSON.stringify([
        { step: 'Notary', feePaise: 2000, timelineDays: 2 },
        { step: 'MEA', feePaise: 5000, timelineDays: 5 },
        { step: 'Embassy', feePaise: 8000, timelineDays: 10 }
      ]), created_at: 1
    });
    mockD1.tables.universities.push(
      { id: 'u1', name: 'University of Toronto', country: 'Canada', min_gpa: 7, ielts_min: 6.5, budget_lpa_min: 20, intake: 'Fall 2027', created_at: 1 },
      { id: 'u2', name: 'TU Munich', country: 'Germany', min_gpa: 6.5, ielts_min: 6.0, budget_lpa_min: 8, intake: 'Fall 2027', created_at: 1 },
      { id: 'u3', name: 'University of Melbourne', country: 'Australia', min_gpa: 8, ielts_min: 7.0, budget_lpa_min: 25, intake: 'Spring 2028', created_at: 1 }
    );
    mockD1.tables.group_departures.push(
      { id: 'dep-1', package_tier: 'standard', departure_date: 1767225600, capacity: 30, booked_seats: 5, price: 4500000, booking_fee: 50000, status: 'open', created_at: 1 },
      { id: 'dep-2', package_tier: 'premium', departure_date: 1772409600, capacity: 20, booked_seats: 19, price: 6000000, booking_fee: 75000, status: 'open', created_at: 1 }
    );
    mockD1.tables.seat_bookings.push(
      { id: 'sb-1', departure_id: 'dep-2', client_id: 'C-1', status: 'confirmed', created_at: 1 }
    );
  });

  it('GET /api/public/jobs returns open postings only', async () => {
    const res = await app.request('/api/public/jobs', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.jobs.length).toBe(2);
    expect(data.jobs.every((j: any) => j.title !== 'Filled Role')).toBe(true);
    expect(data.jobs[0].salaryText).toBe('₹18-25 LPA');
  });

  it('GET /api/public/umrah/departures computes live availability bands', async () => {
    const res = await app.request('/api/public/umrah/departures', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.departures.length).toBe(2);
    // dep-2: 20 capacity - 19 confirmed = 1 seat left => yellow
    const dep2 = data.departures.find((d: any) => d.id === 'dep-2');
    expect(dep2.availability).toBe('yellow');
    expect(dep2.seatsLeft).toBe(1);
    // dep-1: 30 - 0 confirmed = 30 => green
    const dep1 = data.departures.find((d: any) => d.id === 'dep-1');
    expect(dep1.availability).toBe('green');
  });

  it('GET /api/public/attestation/chains returns parsed step chains', async () => {
    const res = await app.request('/api/public/attestation/chains', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.chains.length).toBe(1);
    expect(data.chains[0].steps.length).toBe(3);
    expect(data.chains[0].steps[1].step).toBe('MEA');
  });

  it('POST /api/public/match/eligibility ranks matches by score and filters by thresholds', async () => {
    const res = await app.request('/api/public/match/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.77' },
      body: JSON.stringify({ gpa: 7.5, ielts: 6.5, budget: 22, country: 'Canada' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.empty).toBe(false);
    // Country-filtered: only Canada matches => 1 result
    expect(data.matches.length).toBe(1);
    expect(data.matches[0].name).toBe('University of Toronto');
    expect(data.matches[0].matchPct).toBeGreaterThan(0);
    expect(data.matches[0].matchPct).toBeLessThanOrEqual(100);
  });

  it('eligibility with no qualifying universities returns empty without faking', async () => {
    const res = await app.request('/api/public/match/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.78' },
      body: JSON.stringify({ gpa: 3.0, ielts: 3.0, budget: 2 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.matches.length).toBe(0);
  });
});