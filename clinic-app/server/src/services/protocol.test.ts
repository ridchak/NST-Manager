import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOfficeHours, isOfficeOpen, isEmergency, classifySideEffects, decideRefill, normalizePhone,
} from './protocol';

const NOW = new Date('2026-10-14T15:00:00Z'); // Wednesday 11:00 in New York
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86400000);
const hours = parseOfficeHours('Mon-Fri 09:00-17:00; Sat 09:00-12:00', 'America/New_York');

test('office hours: weekday open, evening closed, Sunday closed, Saturday afternoon closed', () => {
  assert.equal(isOfficeOpen(NOW, hours), true);
  assert.equal(isOfficeOpen(new Date('2026-10-14T23:30:00Z'), hours), false); // 19:30 ET
  assert.equal(isOfficeOpen(new Date('2026-10-18T15:00:00Z'), hours), false); // Sunday
  assert.equal(isOfficeOpen(new Date('2026-10-17T14:00:00Z'), hours), true);  // Sat 10:00 ET
  assert.equal(isOfficeOpen(new Date('2026-10-17T17:00:00Z'), hours), false); // Sat 13:00 ET
});

test('office hours: rejects bad spec', () => {
  assert.throws(() => parseOfficeHours('whenever', 'America/New_York'));
});

test('emergency detection', () => {
  for (const t of ['I have chest pain', 'trouble breathing', 'my face is swelling of the throat',
    'severe stomach pain that goes to my back', 'I fainted', 'I am vomiting blood']) {
    assert.equal(isEmergency(t), true, t);
  }
  for (const t of ['a little nauseous', 'mild headache', 'constipated']) assert.equal(isEmergency(t), false, t);
});

test('side effects: mild vs moderate vs emergency', () => {
  assert.equal(classifySideEffects('some mild nausea after my shot').level, 'mild');
  assert.equal(classifySideEffects('constipated and a bit of heartburn').matched.length, 2);
  assert.equal(classifySideEffects('nausea getting worse for 3 days').level, 'moderate');
  assert.equal(classifySideEffects('a rash on my arms').level, 'moderate');
  assert.equal(classifySideEffects('chest pain after injection').level, 'emergency');
});

test('refill: after hours is queued', () => {
  const d = decideRefill({ now: NOW, officeOpen: false, lastVisit: daysFromNow(-3), nextAppt: daysFromNow(10) });
  assert.equal(d.action, 'queue_after_hours');
});

test('refill: seen within 2 weeks with follow-up goes to staff', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-10), nextAppt: daysFromNow(30) });
  assert.equal(d.action, 'send_to_staff');
});

test('refill: no follow-up and seen recently asks GLP-1', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-5), nextAppt: null });
  assert.equal(d.action, 'ask_glp1');
});

test('refill: >2 weeks since visit and next appt >3 weeks away asks GLP-1', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-30), nextAppt: daysFromNow(40) });
  assert.equal(d.action, 'ask_glp1');
});

test('refill: GLP-1 with upcoming far appointment offers new or sooner visit', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-30), nextAppt: daysFromNow(40) }, true);
  assert.deepEqual([d.action, (d as any).hasUpcoming], ['offer_visit', true]);
});

test('refill: GLP-1 with no appointment advises scheduling', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: null, nextAppt: null }, true);
  assert.deepEqual([d.action, (d as any).hasUpcoming], ['offer_visit', false]);
});

test('refill: >2 weeks since visit but appt within 3 weeks goes to staff', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-30), nextAppt: daysFromNow(10) });
  assert.equal(d.action, 'send_to_staff');
});

test('refill: non-GLP-1 goes to staff', () => {
  const d = decideRefill({ now: NOW, officeOpen: true, lastVisit: daysFromNow(-60), nextAppt: null }, false);
  assert.equal(d.action, 'send_to_staff');
});

test('phone normalization', () => {
  assert.equal(normalizePhone('+1 (555) 234-5678'), '5552345678');
  assert.equal(normalizePhone('555.234.5678'), '5552345678');
});
