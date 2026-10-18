// Integration test: real HTTP against the real app on a throwaway database (see "test:int").
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-for-practice-tests';
delete process.env.OFFICE_HOURS;
delete process.env.OFFICE_TZ;

import bcrypt from 'bcryptjs';
import type { Server } from 'http';
import prisma from '../lib/prisma';
import app from '../app';
import { flushAudit } from './audit';
import { DEFAULT_PRACTICE, refreshPractice } from './practice';
import { isOfficeOpen, loadOfficeHours } from './protocol';

let server: Server;
let base = '';
const PW = 'correct-horse-battery';
const hash = bcrypt.hashSync(PW, 4);
let n = 0;

before(async () => { await refreshPractice(); server = app.listen(0); base = `http://127.0.0.1:${(server.address() as any).port}/api`; });
after(async () => { server.close(); await flushAudit(); await prisma.$disconnect(); });

async function api(method: string, path: string, token?: string | null, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, body: json };
}
async function tokenFor(role: 'user' | 'admin' | 'superuser') {
  const email = `prac${++n}-${role}@test.example`;
  const u = await prisma.user.create({ data: { email, name: `P ${role}`, password: hash, role } });
  const r = await api('POST', '/auth/login', null, { email, password: PW });
  return { id: u.id, token: r.body.token as string };
}

const DEFAULT_BODY = {
  name: DEFAULT_PRACTICE.name, street: DEFAULT_PRACTICE.street, suite: DEFAULT_PRACTICE.suite, city: DEFAULT_PRACTICE.city,
  state: DEFAULT_PRACTICE.state, zip: DEFAULT_PRACTICE.zip, phone: DEFAULT_PRACTICE.phone, fax: DEFAULT_PRACTICE.fax,
  timezone: DEFAULT_PRACTICE.timezone,
  hours: { 0: null, 1: ['08:00', '17:00'], 2: ['08:00', '16:00'], 3: null, 4: ['08:00', '17:00'], 5: ['08:00', '16:00'], 6: ['09:00', '15:00'] },
};

test('anyone signed in can read the practice details; the defaults are the real ones', async () => {
  assert.equal((await api('GET', '/practice')).status, 401);
  const u = await tokenFor('user');
  const r = await api('GET', '/practice', u.token);
  assert.equal(r.status, 200);
  assert.equal(r.body.addressLine, '2340 S Highland Ave, Ste 370, Lombard, IL 60148');
  assert.equal(r.body.phoneDisplay, '(630) 445-1022');
  assert.equal(r.body.faxDisplay, '(630) 559-7377');
  assert.equal(r.body.timezone, 'America/Chicago');
  assert.equal(r.body.hoursByDay['3'], null, 'Wednesday closed');
  assert.equal(r.body.hoursByDay['0'], null, 'Sunday closed');
  assert.deepEqual(r.body.hoursByDay['6'], ['09:00', '15:00']);
  assert.match(r.body.hoursText, /closed Wednesday and Sunday/);
});

test('only a superuser can change them', async () => {
  const user = await tokenFor('user');
  const admin = await tokenFor('admin');
  assert.equal((await api('PUT', '/practice', user.token, DEFAULT_BODY)).status, 403);
  assert.equal((await api('PUT', '/practice', admin.token, DEFAULT_BODY)).status, 403);
});

test('invalid details are rejected with a readable message', async () => {
  const su = await tokenFor('superuser');
  const bad = async (patch: object) => api('PUT', '/practice', su.token, { ...DEFAULT_BODY, ...patch });
  assert.match((await bad({ phone: '12345' })).body.error, /10-digit phone/);
  assert.match((await bad({ fax: 'abc' })).body.error, /fax/);
  assert.match((await bad({ zip: '6014' })).body.error, /ZIP/);
  assert.match((await bad({ timezone: 'Mars/Olympus' })).body.error, /time zone/i);
  assert.match((await bad({ hours: { ...DEFAULT_BODY.hours, 1: ['17:00', '08:00'] } })).body.error, /after opening/);
  assert.match((await bad({ hours: { ...DEFAULT_BODY.hours, 1: ['8am', '5pm'] } })).body.error, /24-hour/);
  assert.match((await bad({ hours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } })).body.error, /At least one day/);
});

test('saved changes persist, take effect for the assistant at once, and are audited', async () => {
  const su = await tokenFor('superuser');
  const monday10am = new Date('2026-10-12T15:00:00Z'); // 10:00 Chicago
  assert.equal(isOfficeOpen(monday10am, loadOfficeHours()), true);

  // Close Mondays (e.g. a holiday schedule) and move the phone number.
  const saved = await api('PUT', '/practice', su.token, { ...DEFAULT_BODY, phone: '(312) 555-0142', suite: '', hours: { ...DEFAULT_BODY.hours, 1: null } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.phoneDisplay, '(312) 555-0142');
  assert.equal(saved.body.suite, null);
  assert.equal(saved.body.addressLine, '2340 S Highland Ave, Lombard, IL 60148');
  assert.equal(saved.body.isDefault, false);
  assert.equal(isOfficeOpen(monday10am, loadOfficeHours()), false, 'the assistant now treats Monday as closed');

  // Survives a restart: reload from the database.
  await refreshPractice();
  assert.equal((await api('GET', '/practice', su.token)).body.phoneDisplay, '(312) 555-0142');

  await flushAudit();
  const log = await prisma.auditLog.findMany({ where: { actorId: su.id, resource: 'practice', action: 'update' } });
  assert.equal(log.length, 1);
  assert.match(log[0].detail ?? '', /practice details updated/);
  assert.ok(!JSON.stringify(log).includes('555-0142'), 'values are not written to the audit log');

  // Put the real details back.
  assert.equal((await api('PUT', '/practice', su.token, DEFAULT_BODY)).status, 200);
  assert.equal(isOfficeOpen(monday10am, loadOfficeHours()), true);
});

test('provider phone numbers: extension and cell are validated and stored in dialable form', async () => {
  const su = await tokenFor('superuser');
  const made = await api('POST', '/users', su.token, { email: `np${Date.now()}@test.example`, name: 'Test NP', password: 'a-long-passphrase', role: 'admin', isProvider: true, extension: '107', cellPhone: '(312) 555-0188' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.extension, '107');
  assert.equal(made.body.cellPhone, '+13125550188');

  const id = made.body.id;
  assert.equal((await api('PATCH', `/users/${id}`, su.token, { cellPhone: '+1 (773) 555-0199' })).body.cellPhone, '+17735550199');
  assert.match((await api('PATCH', `/users/${id}`, su.token, { cellPhone: '12345' })).body.error, /10-digit/);
  assert.match((await api('PATCH', `/users/${id}`, su.token, { extension: 'abc' })).body.error, /Extension/);
  const cleared = await api('PATCH', `/users/${id}`, su.token, { cellPhone: '', extension: '' });
  assert.deepEqual([cleared.body.cellPhone, cleared.body.extension], [null, null]);
});
