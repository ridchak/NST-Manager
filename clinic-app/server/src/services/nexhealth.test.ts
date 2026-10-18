import test from 'node:test';
import assert from 'node:assert/strict';
import { NexHealthPracticeData } from './practiceData';
import { parseOfficeHours } from './protocol';

const hours = parseOfficeHours('Mon-Sun 00:00-23:59', 'America/New_York');
const NOW = new Date('2026-10-14T15:00:00Z');
const iso = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

function stub(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, any[]> = {};
  const rec = (name: string, ret: unknown) => async (...a: any[]) => { (calls[name] ??= []).push(a); return ret; };
  const client: any = {
    config: { providerIds: ['11'], appointmentTypeNew: '5', appointmentTypeFollowUp: '6' },
    searchPatientsByPhone: rec('search', [
      { id: 1, first_name: 'Ann', last_name: 'A', bio: { date_of_birth: '1980-01-02', cell_phone_number: '+1 (555) 111-2222' } },
      { id: 2, first_name: 'Bob', last_name: 'B', bio: { date_of_birth: '1981-01-02', cell_phone_number: '555-999-0000' } }, // loose server match
    ]),
    getPatient: rec('getPatient', { balance: { amount: '42.10', currency: 'USD' }, updated_at: '2026-10-01T00:00:00Z' }),
    listAppointments: rec('list', [
      { id: 10, patient_id: 1, provider_id: 11, start_time: iso(-30) },
      { id: 11, patient_id: 1, provider_id: 11, start_time: iso(-5) },
      { id: 12, patient_id: 1, provider_id: 11, start_time: iso(-2), cancelled: true },
      { id: 13, patient_id: 1, provider_id: 11, start_time: iso(25) },
      { id: 14, patient_id: 1, provider_id: 11, start_time: iso(40) },
    ]),
    appointmentSlots: rec('slots', [{ lid: 1, pid: 11, slots: [{ time: iso(1), operatory_id: 7 }, { time: iso(1.04) }, { time: iso(1.08) }, { time: iso(2) }] }]),
    bookAppointment: rec('book', { id: 99, start_time: iso(1) }),
    cancelAppointment: rec('cancel', undefined),
    ...overrides,
  };
  return { client, calls, pd: new NexHealthPracticeData(client, hours) };
}

test('only patients whose phone really matches are returned', async () => {
  const { pd } = stub();
  const found = await pd.findPatientsByPhone('+1 555 111 2222');
  assert.deepEqual(found.map(p => p.id), ['1']);
  assert.equal(found[0].dob, '1980-01-02');
});

test('balance parsed from string; missing balance is null, not zero', async () => {
  assert.equal((await stub().pd.getBalance({ id: '1', firstName: 'A', lastName: 'A' })).amount, 42.1);
  const none = stub({ getPatient: async () => ({ balance: null }) });
  assert.equal((await none.pd.getBalance({ id: '1', firstName: 'A', lastName: 'A' })).amount, null);
});

test('visits: ignores cancelled, picks latest past and nearest future', async () => {
  const v = await stub().pd.getVisits({ id: '1', firstName: 'A', lastName: 'A' }, NOW);
  assert.equal(v.last?.id, '11');
  assert.equal(v.next?.id, '13');
});

test('slots: flattened, sorted, spread at most 2 per day, carries operatory in slotId', async () => {
  const { pd, calls } = stub();
  const slots = await pd.findSlots({ id: '1', firstName: 'A', lastName: 'A' }, 'follow-up', NOW);
  assert.ok(slots.length >= 2 && slots.length <= 6);
  assert.match(slots[0].slotId, /^11\|.*\|7$/);
  assert.equal(calls.slots[0][0].appointmentTypeId, '6');
});

test('book passes ids and appointment type; cancel is forwarded', async () => {
  const { pd, calls } = stub();
  const v = await pd.book({ id: '1', firstName: 'A', lastName: 'A' }, `11|${iso(1)}|7`, 'new');
  assert.equal(v.id, '99');
  assert.deepEqual([calls.book[0][0].patientId, calls.book[0][0].providerId, calls.book[0][0].operatoryId, calls.book[0][0].appointmentTypeId], ['1', '11', '7', '5']);
  await pd.cancel('13');
  assert.deepEqual(calls.cancel[0], ['13']);
});

test('missing provider configuration fails loudly', async () => {
  const s = stub();
  s.client.config.providerIds = [];
  await assert.rejects(() => s.pd.findSlots({ id: '1', firstName: 'A', lastName: 'A' }, 'new', NOW), /NEXHEALTH_PROVIDER_IDS/);
});
