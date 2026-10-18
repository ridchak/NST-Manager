import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHash, canonical } from './audit';
import { describeRequest } from '../middleware/audit';

const ID = 'cmvda8in20002b503qqkwa2s9';
const base = { at: new Date('2026-10-18T10:00:00Z'), actorType: 'user' as const, action: 'view', outcome: 'success' as const };

test('hash is deterministic and depends on the previous hash and every field', () => {
  const h1 = computeHash('GENESIS', base);
  assert.equal(h1, computeHash('GENESIS', base));
  assert.notEqual(h1, computeHash('OTHER', base));
  assert.notEqual(h1, computeHash('GENESIS', { ...base, action: 'delete' }));
  assert.notEqual(h1, computeHash('GENESIS', { ...base, patientId: 'p1' }));
  assert.notEqual(h1, computeHash('GENESIS', { ...base, at: new Date('2026-10-18T10:00:00.001Z') }));
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('null and undefined hash the same (a missing field cannot be swapped for null)', () => {
  assert.equal(canonical({ ...base, patientId: undefined }), canonical({ ...base, patientId: null }));
});

test('describe: viewing a patient record names the patient', () => {
  const d = describeRequest('GET', `/patients/${ID}`);
  assert.deepEqual([d.action, d.resource, d.resourceId, d.patientId], ['view', 'patients', ID, ID]);
});

test('describe: records query parameter NAMES, never values', () => {
  const d = describeRequest('GET', '/patients', { search: 'Jane Doe', page: '2' });
  assert.equal(d.detail, 'query: search,page');
  assert.ok(!JSON.stringify(d).includes('Jane'));
});

test('describe: records changed field NAMES, never values', () => {
  const d = describeRequest('PUT', `/patients/${ID}`, {}, { notes: 'has diabetes', phone: '555' });
  assert.equal(d.action, 'update');
  assert.equal(d.detail, 'fields: notes,phone');
  assert.ok(!JSON.stringify(d).includes('diabetes'));
});

test('describe: patient is taken from the query or body for related records', () => {
  assert.equal(describeRequest('GET', '/progress', { patientId: ID }).patientId, ID);
  assert.equal(describeRequest('POST', '/progress', {}, { patientId: ID, weight: 200 }).patientId, ID);
});

test('describe: special actions', () => {
  assert.equal(describeRequest('DELETE', `/appointments/${ID}`).action, 'cancel');
  assert.equal(describeRequest('POST', `/users/${ID}/unlock`).action, 'unlock_account');
  assert.equal(describeRequest('POST', `/users/${ID}/reset-password`, {}, { newPassword: 'x' }).action, 'reset_password');
  assert.ok(!JSON.stringify(describeRequest('POST', `/users/${ID}/reset-password`, {}, { newPassword: 'hunter2hunter2' })).includes('hunter2'));
  assert.equal(describeRequest('GET', '/audit/export').action, 'export_audit_log');
  assert.equal(describeRequest('POST', '/phone/call', {}, { toNumber: '555' }).action, 'phone_call');
  assert.equal(describeRequest('POST', '/phone/message').action, 'send_text');
});

test('describe: sub-routes are not mistaken for record ids', () => {
  const d = describeRequest('GET', '/appointments/today');
  assert.equal(d.resourceId, null);
  assert.equal(d.detail, 'today');
});
