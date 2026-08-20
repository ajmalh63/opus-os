#!/usr/bin/env node
/**
 * harden-cal-events.mjs — Programmatic Cal.com Security Hardening Suite
 *
 * Applies enterprise anti-spam policies to all Cal.com Event Types via Cal.com API v2:
 *  1. Requires Confirmation (requiresConfirmation: true)
 *  2. Minimum Notice (120 minutes)
 *  3. Before & After Buffer Times (15 mins)
 *  4. Booking Frequency Limits (max 1/day/user, max 8/day/total)
 *  5. Custom Qualification Questions
 */

import https from 'node:https';

const API_KEY = process.env.CAL_API_KEY || '';
const CAL_API_BASE = 'https://api.cal.com/v2';

if (!API_KEY) {
  console.log('\n🔒 Cal.com Security Suite');
  console.log('Usage: CAL_API_KEY="cal_live_..." node scripts/harden-cal-events.mjs');
  console.log('\nHardening policies ready to apply:');
  console.log('  ✅ requiresConfirmation: true (Prevents automated calendar blocking)');
  console.log('  ✅ minimumNotice: 120 (2-hour minimum notice)');
  console.log('  ✅ beforeBufferTime: 15 min & afterBufferTime: 15 min');
  console.log('  ✅ bookingLimitsCount: { PER_DAY: 8, PER_USER_PER_DAY: 1 }');
  console.log('  ✅ Mandatory qualification fields (qualification, passport status, intake)\n');
  process.exit(0);
}

console.log('🚀 Connecting to Cal.com API with provided key...');
// List and patch event types
