// Integration test: runs against a throwaway SQLite database (see "test:int" in package.json).
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFICE_TZ = 'America/New_York';
process.env.FRONT_DESK_NUMBER = '+15550100000';

import prisma from '../lib/prisma';
import { runTool, resetSessionsForTest } from './assistant';

const OPEN = 'Mon-Sun 00:00-23:59';
const CLOSED = ';';
const setHours = (v: string) => { process.env.OFFICE_HOURS = v; };

const JENNIFER = { callerPhone: '(555) 234-5678', dateOfBirth: '03/15/1985' };
const DAVID = { callerPhone: '(555) 567-8901', dateOfBirth: '1965-05-10' };
const LISA = { callerPhone: '555-678-9012', dateOfBirth: '1978-09-18' };

async function call(tool: string, args: Record<string, unknown>) {
  const r = await runTool(tool, args);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as any;
}
async function verify(callId: string, who: { callerPhone: string; dateOfBirth: string }) {
  const r = await call('identify_patient', { callId, ...who });
  assert.equal(r.verified, true);
}
const messages = (type?: string) => prisma.staffMessage.findMany({ where: type ? { type } : {}, orderBy: { createdAt: 'asc' } });

before(async () => {
  const DAY = 86400000;
  const prov = await prisma.user.findFirstOrThrow({ where: { isProvider: true } });
  const patient = (mrn: string) => prisma.patient.findUniqueOrThrow({ where: { mrn } });
  const add = (patientId: string, offsetMs: number, status: string) =>
    prisma.appointment.create({ data: { patientId, providerId: prov.id, date: new Date(Date.now() + offsetMs), duration: 30, type: 'follow-up', status } });

  // Jennifer: seen 7 days ago, follow-up in 10 days (independent of the seed's time-of-day appointments).
  const jennifer = await patient('MRN-001');
  await prisma.appointment.deleteMany({ where: { patientId: jennifer.id } });
  await add(jennifer.id, -7 * DAY, 'completed');
  await add(jennifer.id, 10 * DAY, 'scheduled');

  // Lisa: no appointments at all.
  const lisa = await patient('MRN-005');
  await prisma.appointment.deleteMany({ where: { patientId: lisa.id } });

  // David: an appointment a minute from now, for the check-in test.
  const david = await patient('MRN-004');
  await prisma.appointment.deleteMany({ where: { patientId: david.id } });
  await add(david.id, 60000, 'scheduled');
});

beforeEach(async () => {
  resetSessionsForTest();
  setHours(OPEN);
  await prisma.staffMessage.deleteMany();
});

test('requires verification before any patient data', async () => {
  const r = await call('get_balance', { callId: 'x1' });
  assert.match(r.error, /not verified/i);
  assert.equal(r.amount, undefined);
});

test('wrong DOB fails, three failures lock the call and send to front desk', async () => {
  const bad = { callerPhone: JENNIFER.callerPhone, dateOfBirth: '01/01/1990' };
  for (let i = 0; i < 3; i++) assert.equal((await call('identify_patient', { callId: 'x2', ...bad })).verified, false);
  const locked = await call('identify_patient', { callId: 'x2', ...JENNIFER });
  assert.equal(locked.action, 'transfer_front_desk');
  assert.equal(locked.transferNumber, '+15550100000');
});

test('caller ID that matches nobody cannot be verified', async () => {
  const r = await call('identify_patient', { callId: 'x3', callerPhone: '555-000-0000', dateOfBirth: '03/15/1985' });
  assert.equal(r.verified, false);
});

test('balance and copay come from record; no payment offered', async () => {
  await verify('x4', JENNIFER);
  const b = await call('get_balance', { callId: 'x4' });
  assert.equal(b.amount, 125.5);
  assert.match(b.say, /not able to take payments/i);
  assert.equal((await call('get_copay', { callId: 'x4' })).copay, 25);
});

test('refill: seen within 2 weeks with follow-up -> staff message, patient told', async () => {
  await verify('x5', JENNIFER);
  const r = await call('request_refill', { callId: 'x5', medication: 'semaglutide' });
  assert.equal(r.action, 'send_to_staff');
  assert.match(r.say, /sent your refill request/i);
  const m = await messages('refill');
  assert.equal(m.length, 1);
  assert.match(m[0].subject, /semaglutide/);
});

test('refill: no follow-up -> asks GLP-1; yes -> offers visit; books follow-up', async () => {
  await verify('x6', LISA);
  assert.equal((await call('request_refill', { callId: 'x6', medication: 'tirzepatide' })).action, 'ask_glp1');
  assert.equal((await messages('refill')).length, 0, 'no staff message until the question is answered');
  const r = await call('request_refill', { callId: 'x6', medication: 'tirzepatide', isGlp1: true });
  assert.equal(r.action, 'offer_visit');
  assert.equal(r.hasUpcoming, false);
  const slots = await call('find_slots', { callId: 'x6', visitType: 'follow-up' });
  assert.ok(slots.slots.length > 0 && slots.slots.length <= 6);
  const booked = await call('book_appointment', { callId: 'x6', slotId: slots.slots[0].slotId, visitType: 'follow-up' });
  assert.equal(booked.booked, true);
  // The same slot cannot be double-booked.
  await verify('x6b', { callerPhone: '(555) 234-5678', dateOfBirth: '03/15/1985' });
  const dup = await call('book_appointment', { callId: 'x6b', slotId: slots.slots[0].slotId, visitType: 'follow-up' });
  assert.equal(dup.booked, false);
});

test('GLP-1 patient with a far-off appointment can move it sooner (old one cancelled)', async () => {
  const lisa = await prisma.patient.findUniqueOrThrow({ where: { mrn: 'MRN-005' } });
  const prov = await prisma.user.findFirstOrThrow({ where: { isProvider: true } });
  await prisma.appointment.deleteMany({ where: { patientId: lisa.id } });
  const far = await prisma.appointment.create({ data: { patientId: lisa.id, providerId: prov.id, date: new Date(Date.now() + 40 * 86400000), duration: 30, type: 'follow-up', status: 'scheduled' } });
  await verify('x7', LISA);
  const r = await call('request_refill', { callId: 'x7', medication: 'semaglutide', isGlp1: true });
  assert.equal(r.action, 'offer_visit');
  assert.equal(r.hasUpcoming, true);
  assert.equal(r.upcomingVisitId, far.id);
  const slots = await call('find_slots', { callId: 'x7', visitType: 'follow-up' });
  const moved = await call('book_appointment', { callId: 'x7', slotId: slots.slots[0].slotId, visitType: 'follow-up', replaceVisitId: far.id });
  assert.equal(moved.booked, true);
  assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: far.id } })).status, 'cancelled');
  // Cannot move somebody else's / arbitrary appointment.
  const other = await prisma.appointment.findFirstOrThrow({ where: { NOT: { patientId: lisa.id } } });
  const bad = await call('book_appointment', { callId: 'x7', slotId: slots.slots[1].slotId, visitType: 'follow-up', replaceVisitId: other.id });
  assert.match(bad.error, /cannot be moved/i);
  assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: other.id } })).status !== 'cancelled', true);
});

test('refill after hours is queued for staff', async () => {
  setHours(CLOSED);
  await verify('x8', JENNIFER);
  const r = await call('request_refill', { callId: 'x8', medication: 'phentermine' });
  assert.equal(r.action, 'queue_after_hours');
  assert.equal((await messages('refill')).length, 1);
});

test('side effects: emergency -> 911 script and urgent staff message', async () => {
  await verify('x9', JENNIFER);
  const r = await call('report_side_effects', { callId: 'x9', description: 'I have severe stomach pain that goes to my back' });
  assert.equal(r.action, 'call_911');
  assert.match(r.say, /911/);
  assert.equal((await messages('side-effect'))[0].priority, 'urgent');
});

test('side effects during office hours -> staff notified', async () => {
  await verify('x10', JENNIFER);
  const r = await call('report_side_effects', { callId: 'x10', description: 'mild nausea after my injection' });
  assert.equal(r.action, 'staff_notified');
  assert.equal((await messages('side-effect')).length, 1);
});

test('side effects after hours: mild -> OTC advice; other -> schedule or urgent care', async () => {
  setHours(CLOSED);
  await verify('x11', JENNIFER);
  const mild = await call('report_side_effects', { callId: 'x11', description: 'mild constipation' });
  assert.equal(mild.action, 'otc_advice');
  assert.match(mild.say, /over-the-counter/i);
  const other = await call('report_side_effects', { callId: 'x11', description: 'I have a rash on my arms' });
  assert.equal(other.action, 'schedule_or_urgent_care');
  const worse = await call('report_side_effects', { callId: 'x11', description: 'nausea getting worse for 3 days' });
  assert.equal(worse.action, 'schedule_or_urgent_care');
  const chest = await call('report_side_effects', { callId: 'x11', description: 'chest pain' });
  assert.equal(chest.action, 'call_911');
});

test('prior authorization creates a staff message', async () => {
  await verify('x12', JENNIFER);
  const r = await call('request_prior_auth', { callId: 'x12', medication: 'Wegovy' });
  assert.equal(r.sent, true);
  assert.equal((await messages('prior-auth')).length, 1);
});

test('medication question: extension in hours, cell after hours', async () => {
  await verify('x13', JENNIFER);
  const day = await call('medication_question', { callId: 'x13', question: 'can I take it with food?' });
  assert.equal(day.action, 'transfer');
  assert.match(day.transferNumber, /^(101|102)$/);
  setHours(CLOSED);
  const night = await call('medication_question', { callId: 'x13' });
  assert.match(night.transferNumber, /^\+1555010010[12]$/);
});

test('check-in with an appointment today notifies staff', async () => {
  await verify('x14', DAVID);
  const r = await call('check_in', { callId: 'x14' });
  assert.equal(r.checkedIn, true);
  assert.equal((await messages('check-in')).length, 1);
});

test('check-in with no appointment today says so', async () => {
  // Earlier tests may have booked Lisa a slot that falls later today, so start from a clean slate.
  const lisa = await prisma.patient.findUniqueOrThrow({ where: { mrn: 'MRN-005' } });
  await prisma.appointment.deleteMany({ where: { patientId: lisa.id } });
  await verify('x14b', LISA);
  const r = await call('check_in', { callId: 'x14b' });
  assert.equal(r.checkedIn, false);
  assert.equal((await messages('check-in')).length, 0);
});

test('text-message offer records preference even when SMS is not configured', async () => {
  await verify('x15', JENNIFER);
  const r = await call('offer_text_messaging', { callId: 'x15' });
  assert.equal(r.smsSent, false);
  assert.match(r.say, /text/i);
  assert.equal((await messages('general')).length, 1);
});

test('call log records events without clinical content', async () => {
  await verify('x16', JENNIFER);
  await call('get_balance', { callId: 'x16' });
  const log = await prisma.callLog.findUniqueOrThrow({ where: { callId: 'x16' } });
  assert.equal(log.verified, true);
  assert.deepEqual(JSON.parse(log.events).map((e: any) => e.tool), ['identify_patient', 'get_balance']);
});

test('unknown tool and bad arguments are rejected', async () => {
  assert.equal((await runTool('nope', {})).status, 404);
  assert.equal((await runTool('get_balance', {})).status, 400);
});
