// Integration test: real HTTP requests against the real app on a throwaway database (see "test:int").
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-for-auth-tests';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '30';

import bcrypt from 'bcryptjs';
import type { Server } from 'http';
import prisma from '../lib/prisma';
import app from '../app';

let server: Server;
let base = '';
const PW = 'correct-horse-battery';
const hash = bcrypt.hashSync(PW, 4);

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
after(async () => {
  server.close();
  await prisma.$disconnect();
});

async function api(method: string, path: string, token?: string | null, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

let n = 0;
async function makeUser(role: 'user' | 'admin' | 'superuser', extra: Record<string, unknown> = {}) {
  const email = `t${++n}-${role}@test.example`;
  const u = await prisma.user.create({ data: { email, name: `Test ${role}`, password: hash, role, ...extra } });
  return { id: u.id, email };
}
const login = (email: string, password = PW) => api('POST', '/auth/login', null, { email, password });
async function tokenFor(role: 'user' | 'admin' | 'superuser') {
  const u = await makeUser(role);
  const r = await login(u.email);
  assert.equal(r.status, 200);
  return { ...u, token: r.body.token as string };
}

// ---------- lockout ----------

test('sign-in works and returns the access level', async () => {
  const u = await makeUser('admin', { isProvider: true });
  const r = await login(u.email);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.isProvider, true);
  assert.equal(r.body.user.password, undefined);
});

test('email is case-insensitive', async () => {
  const u = await makeUser('user');
  assert.equal((await login(u.email.toUpperCase())).status, 200);
});

test('5 wrong passwords lock the account; the correct password is then refused too', async () => {
  const u = await makeUser('user');
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) seen.push((await login(u.email, 'wrong-password')).status);
  assert.deepEqual(seen, [401, 401, 401, 401, 423]);
  const afterLock = await login(u.email, PW);
  assert.equal(afterLock.status, 423);
  assert.equal(afterLock.body.locked, true);
  assert.match(afterLock.body.error, /locked/i);
});

test('attempts-left count goes down', async () => {
  const u = await makeUser('user');
  assert.equal((await login(u.email, 'x')).body.attemptsLeft, 4);
  assert.equal((await login(u.email, 'x')).body.attemptsLeft, 3);
});

test('a successful sign-in resets the failure count', async () => {
  const u = await makeUser('user');
  for (let i = 0; i < 4; i++) await login(u.email, 'wrong');
  assert.equal((await login(u.email)).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await login(u.email, 'wrong')).status, 401);
});

test('an expired lock gives a fresh set of attempts', async () => {
  const u = await makeUser('user');
  await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 5, lockedUntil: new Date(Date.now() - 1000) } });
  const bad = await login(u.email, 'wrong');
  assert.equal(bad.status, 401);
  assert.equal(bad.body.attemptsLeft, 4);
  assert.equal((await login(u.email)).status, 200);
});

test('emails that do not exist lock the same way (no account enumeration)', async () => {
  const email = 'nobody-here@test.example';
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) seen.push((await login(email, 'whatever')).status);
  assert.deepEqual(seen, [401, 401, 401, 401, 423, 423]);
});

test('a superuser can unlock a locked account', async () => {
  const su = await tokenFor('superuser');
  const u = await makeUser('user');
  for (let i = 0; i < 5; i++) await login(u.email, 'wrong');
  assert.equal((await login(u.email)).status, 423);
  const listed = await api('GET', '/users', su.token);
  assert.equal(listed.body.data.find((x: any) => x.id === u.id).locked, true);
  assert.equal((await api('POST', `/users/${u.id}/unlock`, su.token)).status, 200);
  assert.equal((await login(u.email)).status, 200);
});

test('admins and users cannot unlock accounts', async () => {
  const admin = await tokenFor('admin');
  const u = await makeUser('user');
  assert.equal((await api('POST', `/users/${u.id}/unlock`, admin.token)).status, 403);
});

// ---------- permissions over HTTP ----------

test('requests without a token are refused', async () => {
  assert.equal((await api('GET', '/patients')).status, 401);
  assert.equal((await api('GET', '/users')).status, 401);
});

test('USER: can view and add, cannot edit or delete', async () => {
  const user = await tokenFor('user');
  const list = await api('GET', '/patients', user.token);
  assert.equal(list.status, 200);
  const id = list.body.data[0].id;

  const created = await api('POST', '/patients', user.token, { firstName: 'Pat', lastName: 'Test', dob: '1990-01-01' });
  assert.equal(created.status, 201);

  assert.equal((await api('PUT', `/patients/${id}`, user.token, { notes: 'x' })).status, 403);
  assert.equal((await api('DELETE', `/patients/${id}`, user.token)).status, 403);
  assert.equal((await api('PUT', '/insurance/anything', user.token, { status: 'approved' })).status, 403);
  assert.equal((await api('GET', '/users', user.token)).status, 403);
});

test('USER: may cancel an appointment and mark a message done (routine front-desk work)', async () => {
  const user = await tokenFor('user');
  const prov = await prisma.user.findFirstOrThrow({ where: { isProvider: true } });
  const pat = await prisma.patient.findFirstOrThrow();
  const appt = await prisma.appointment.create({ data: { patientId: pat.id, providerId: prov.id, date: new Date(Date.now() + 864e5), duration: 30, type: 'follow-up' } });
  assert.equal((await api('DELETE', `/appointments/${appt.id}`, user.token)).status, 200);
  assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status, 'cancelled');

  const msg = await prisma.staffMessage.create({ data: { type: 'general', subject: 's', body: 'b' } });
  assert.equal((await api('PATCH', `/messages/${msg.id}`, user.token, { status: 'done' })).status, 200);
});

test('ADMIN: can edit (patients, insurance authorizations), cannot delete or manage accounts', async () => {
  const admin = await tokenFor('admin');
  const pat = await prisma.patient.findFirstOrThrow();
  assert.equal((await api('PUT', `/patients/${pat.id}`, admin.token, { notes: 'edited by admin' })).status, 200);
  const auth = await prisma.insuranceAuth.findFirstOrThrow();
  assert.equal((await api('PUT', `/insurance/${auth.id}`, admin.token, { notes: 'edited' })).status, 200);
  assert.equal((await api('DELETE', `/patients/${pat.id}`, admin.token)).status, 403);
  assert.equal((await api('DELETE', `/insurance/${auth.id}`, admin.token)).status, 403);
  assert.equal((await api('GET', '/users', admin.token)).status, 403);
  assert.equal((await api('POST', '/users', admin.token, { email: 'x@test.example', name: 'X', password: PW })).status, 403);
});

test('SUPERUSER: full control, including deleting records', async () => {
  const su = await tokenFor('superuser');
  const created = await api('POST', '/patients', su.token, { firstName: 'Del', lastName: 'Me', dob: '1990-01-01' });
  assert.equal(created.status, 201);
  assert.equal((await api('DELETE', `/patients/${created.body.id}`, su.token)).status, 200);
  assert.equal((await api('GET', '/users', su.token)).status, 200);
});

test('a role change takes effect immediately, even for a token already issued', async () => {
  const su = await tokenFor('superuser');
  const admin = await tokenFor('admin');
  const pat = await prisma.patient.findFirstOrThrow();
  assert.equal((await api('PUT', `/patients/${pat.id}`, admin.token, { notes: 'a' })).status, 200);
  assert.equal((await api('PATCH', `/users/${admin.id}`, su.token, { role: 'user' })).status, 200);
  assert.equal((await api('PUT', `/patients/${pat.id}`, admin.token, { notes: 'b' })).status, 403);
});

test('deactivating an account cuts off its existing sessions and blocks new sign-ins', async () => {
  const su = await tokenFor('superuser');
  const user = await tokenFor('user');
  assert.equal((await api('GET', '/patients', user.token)).status, 200);
  assert.equal((await api('PATCH', `/users/${user.id}`, su.token, { active: false })).status, 200);
  assert.equal((await api('GET', '/patients', user.token)).status, 401);
  assert.equal((await login(user.email)).status, 401);
});

// ---------- account management safeguards ----------

test('creating users: validates password length, rejects duplicates, never returns the password', async () => {
  const su = await tokenFor('superuser');
  const email = `new-${Date.now()}@test.example`;
  assert.equal((await api('POST', '/users', su.token, { email, name: 'N', password: 'short' })).status, 400);
  const ok = await api('POST', '/users', su.token, { email: email.toUpperCase(), name: 'N', password: PW, role: 'admin' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.email, email);
  assert.equal(ok.body.password, undefined);
  assert.equal((await api('POST', '/users', su.token, { email, name: 'N', password: PW })).status, 409);
  assert.equal((await login(email)).status, 200);
});

test('superusers cannot demote, deactivate, or delete themselves', async () => {
  const su = await tokenFor('superuser');
  assert.equal((await api('PATCH', `/users/${su.id}`, su.token, { role: 'admin' })).status, 400);
  assert.equal((await api('PATCH', `/users/${su.id}`, su.token, { active: false })).status, 400);
  assert.equal((await api('DELETE', `/users/${su.id}`, su.token)).status, 400);
});

test('an account with appointment history cannot be deleted, only deactivated', async () => {
  const su = await tokenFor('superuser');
  const prov = await prisma.user.findFirstOrThrow({ where: { isProvider: true } });
  const r = await api('DELETE', `/users/${prov.id}`, su.token);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /deactivate/i);
});

test('superuser password reset also unlocks; new password must be long enough', async () => {
  const su = await tokenFor('superuser');
  const u = await makeUser('user');
  for (let i = 0; i < 5; i++) await login(u.email, 'wrong');
  assert.equal((await api('POST', `/users/${u.id}/reset-password`, su.token, { newPassword: 'short' })).status, 400);
  assert.equal((await api('POST', `/users/${u.id}/reset-password`, su.token, { newPassword: 'a-brand-new-password' })).status, 200);
  assert.equal((await login(u.email, 'a-brand-new-password')).status, 200);
});

test('changing your own password enforces the length rule', async () => {
  const u = await tokenFor('user');
  assert.equal((await api('POST', '/auth/change-password', u.token, { currentPassword: PW, newPassword: 'short' })).status, 400);
  assert.equal((await api('POST', '/auth/change-password', u.token, { currentPassword: 'nope', newPassword: 'a-long-enough-one' })).status, 401);
  assert.equal((await api('POST', '/auth/change-password', u.token, { currentPassword: PW, newPassword: 'a-long-enough-one' })).status, 200);
});
