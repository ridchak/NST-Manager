// Integration test: real HTTP against the real app on a throwaway database (see "test:int").
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-for-audit-tests';
process.env.ASSISTANT_API_KEY = 'audit-test-assistant-key';
process.env.LOGIN_MAX_ATTEMPTS = '5';

import bcrypt from 'bcryptjs';
import type { Server } from 'http';
import prisma from '../lib/prisma';
import app from '../app';
import { flushAudit, recordAudit, verifyAuditChain } from './audit';

let server: Server;
let base = '';
const PW = 'correct-horse-battery';
const hash = bcrypt.hashSync(PW, 4);

before(() => { server = app.listen(0); base = `http://127.0.0.1:${(server.address() as any).port}/api`; });
after(async () => { server.close(); await flushAudit(); await prisma.$disconnect(); });

async function raw(method: string, path: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'audit-test/1.0', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function api(method: string, path: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await raw(method, path, token, body, headers);
  let json: any = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, body: json };
}
let n = 0;
async function makeUser(role: 'user' | 'admin' | 'superuser') {
  const email = `audit${++n}-${role}@test.example`;
  const u = await prisma.user.create({ data: { email, name: `Audit ${role}`, password: hash, role } });
  return { id: u.id, email };
}
async function tokenFor(role: 'user' | 'admin' | 'superuser') {
  const u = await makeUser(role);
  const r = await api('POST', '/auth/login', null, { email: u.email, password: PW });
  assert.equal(r.status, 200);
  return { ...u, token: r.body.token as string };
}
/** The server records each entry just after it sends its response, so let in-flight writes land before looking. */
const settle = () => new Promise(r => setTimeout(r, 40));

async function rows(where: Record<string, unknown> = {}) {
  await settle();
  await flushAudit();
  return prisma.auditLog.findMany({ where, orderBy: { id: 'asc' } });
}

test('sign-in, failure, lockout and sign-out are recorded with who and from where', async () => {
  const u = await makeUser('user');
  const login = (pw: string) => api('POST', '/auth/login', null, { email: u.email, password: pw }, { 'x-forwarded-for': '203.0.113.9' });
  await login(PW);
  for (let i = 0; i < 5; i++) await login('wrong-password');
  const token = (await api('POST', '/auth/login', null, { email: 'nobody@test.example', password: 'x' })).body; // unknown account
  void token;
  const mine = await rows({ actorEmail: u.email });
  const actions = mine.map(r => r.action);
  assert.deepEqual(actions, ['login', 'login_failed', 'login_failed', 'login_failed', 'login_failed', 'account_locked']);
  assert.equal(mine[0].actorType, 'user');
  assert.equal(mine[0].actorId, u.id);
  assert.equal(mine[0].outcome, 'success');
  assert.equal(mine[1].outcome, 'failed');
  assert.match(mine[1].detail!, /wrong password \(1 of 5\)/);
  assert.equal(mine[5].outcome, 'denied');
  assert.ok(mine[0].ip, 'client address is recorded');
  assert.equal(mine[0].userAgent, 'audit-test/1.0');
  const unknown = await rows({ actorEmail: 'nobody@test.example' });
  assert.equal(unknown[0].action, 'login_failed');
  assert.match(unknown[0].detail!, /unknown account/);
});

test('logout and password changes are recorded', async () => {
  const s = await tokenFor('user');
  assert.equal((await api('POST', '/auth/change-password', s.token, { currentPassword: 'nope-nope-nope', newPassword: 'another-long-one' })).status, 401);
  assert.equal((await api('POST', '/auth/change-password', s.token, { currentPassword: PW, newPassword: 'another-long-one' })).status, 200);
  assert.equal((await api('POST', '/auth/logout', s.token)).status, 200);
  const actions = (await rows({ actorId: s.id })).map(r => r.action);
  assert.deepEqual(actions, ['login', 'password_change_failed', 'password_changed', 'logout']);
});

test('viewing a patient is recorded against that patient; list views record parameter names only', async () => {
  const s = await tokenFor('user');
  const pat = await prisma.patient.findFirstOrThrow();
  assert.equal((await api('GET', `/patients/${pat.id}`, s.token)).status, 200);
  assert.equal((await api('GET', '/patients?search=Zebrafinch&page=1', s.token)).status, 200);
  const mine = (await rows({ actorId: s.id })).filter(r => r.action === 'view');
  const one = mine.find(r => r.resourceId === pat.id)!;
  assert.equal(one.patientId, pat.id);
  assert.equal(one.resource, 'patients');
  assert.equal(one.outcome, 'success');
  assert.equal(one.statusCode, 200);
  const list = mine.find(r => r.resourceId === null && r.resource === 'patients')!;
  assert.equal(list.detail, 'query: search,page');
  const all = JSON.stringify(await rows());
  assert.ok(!all.includes('Zebrafinch'), 'search text must never be stored');
});

test('single records are tied to their patient even when the id is not in the URL path', async () => {
  const s = await tokenFor('user');
  const appt = await prisma.appointment.findFirstOrThrow();
  await api('GET', `/appointments/${appt.id}`, s.token);
  const r = (await rows({ actorId: s.id, resource: 'appointments' }))[0];
  assert.equal(r.patientId, appt.patientId);
});

test('creating and editing records stores field names, never the values', async () => {
  const su = await tokenFor('superuser');
  const created = await api('POST', '/patients', su.token, { firstName: 'Quillfeather', lastName: 'Marmalade', dob: '1990-01-01', notes: 'Has secretdiagnosis' });
  assert.equal(created.status, 201);
  await api('PUT', `/patients/${created.body.id}`, su.token, { notes: 'Now takes mysterymedication' });
  await api('DELETE', `/patients/${created.body.id}`, su.token);
  const mine = (await rows({ actorId: su.id })).filter(r => r.resource === 'patients');
  assert.deepEqual(mine.map(r => r.action), ['create', 'update', 'delete']);
  assert.ok(mine.every(r => r.patientId === created.body.id), 'all three tied to the new patient id');
  assert.match(mine[0].detail!, /fields: firstName,lastName,dob,notes/);
  const everything = JSON.stringify(await rows());
  for (const secret of ['Quillfeather', 'Marmalade', 'secretdiagnosis', 'mysterymedication', '1990-01-01']) {
    assert.ok(!everything.includes(secret), `"${secret}" must not appear in the audit log`);
  }
});

test('refused requests are recorded as denied, with who tried', async () => {
  const s = await tokenFor('user');
  const pat = await prisma.patient.findFirstOrThrow();
  assert.equal((await api('DELETE', `/patients/${pat.id}`, s.token)).status, 403);
  assert.equal((await api('GET', '/users', s.token)).status, 403);
  const denied = (await rows({ actorId: s.id })).filter(r => r.outcome === 'denied');
  assert.deepEqual(denied.map(r => [r.action, r.statusCode]), [['delete', 403], ['view', 403]]);
  assert.equal(denied[0].actorRole, 'user');
});

test('account changes name the account and the level change, not passwords', async () => {
  const su = await tokenFor('superuser');
  const target = await makeUser('user');
  await api('PATCH', `/users/${target.id}`, su.token, { role: 'admin' });
  await api('POST', `/users/${target.id}/reset-password`, su.token, { newPassword: 'a-secret-new-passphrase' });
  await api('POST', `/users/${target.id}/unlock`, su.token);
  await api('POST', '/users', su.token, { email: `made-${Date.now()}@test.example`, name: 'Made', password: 'initial-passphrase-1' });
  const mine = (await rows({ actorId: su.id })).filter(r => r.resource === 'users');
  assert.deepEqual(mine.map(r => r.action), ['user_updated', 'reset_password', 'unlock_account', 'user_created']);
  assert.match(mine[0].detail!, new RegExp(`account: ${target.email}.*level user -> admin`));
  assert.ok(!JSON.stringify(await rows()).includes('a-secret-new-passphrase'));
  assert.ok(!JSON.stringify(await rows()).includes('initial-passphrase-1'));
});

test('voice-assistant tool calls are recorded without what was said or the caller number', async () => {
  const key = { 'x-assistant-key': 'audit-test-assistant-key' };
  const tool = (name: string, body: unknown) => api('POST', `/assistant/tools/${name}`, null, body, key);
  await tool('identify_patient', { callId: 'audit-call-1', callerPhone: '(555) 234-5678', dateOfBirth: '03/15/1985' });
  await tool('get_balance', { callId: 'audit-call-1' });
  await tool('get_balance', { callId: 'audit-call-never-verified' });
  const mine = await rows({ resourceId: 'audit-call-1' });
  assert.deepEqual(mine.map(r => [r.action, r.outcome]), [['assistant_identify_patient', 'success'], ['assistant_get_balance', 'success']]);
  assert.equal(mine[0].actorType, 'assistant');
  const jennifer = await prisma.patient.findUniqueOrThrow({ where: { mrn: 'MRN-001' } });
  assert.equal(mine[1].patientId, jennifer.id);
  const unverified = await rows({ resourceId: 'audit-call-never-verified' });
  assert.equal(unverified[0].outcome, 'failed');
  assert.ok(!JSON.stringify(await rows()).includes('234-5678'));
  // a wrong key is a security event
  assert.equal((await api('POST', '/assistant/tools/get_balance', null, {}, { 'x-assistant-key': 'wrong' })).status, 401);
  assert.ok((await rows({ action: 'assistant_auth_failed' })).length >= 1);
});

test('only a superuser can read the audit log; refused attempts are themselves logged', async () => {
  const admin = await tokenFor('admin');
  assert.equal((await api('GET', '/audit', admin.token)).status, 403);
  assert.equal((await api('GET', '/audit/verify', admin.token)).status, 403);
  assert.equal((await api('GET', '/audit/export', admin.token)).status, 403);
  assert.equal((await rows({ actorId: admin.id, outcome: 'denied', resource: 'audit' })).length, 3);
  assert.equal((await api('GET', '/audit')).status, 401);
});

test('superuser can search by patient, action and outcome, with paging and a limit cap', async () => {
  const su = await tokenFor('superuser');
  const pat = await prisma.patient.findFirstOrThrow({ where: { mrn: 'MRN-001' } });
  await api('GET', `/patients/${pat.id}`, su.token);
  await settle();
  await flushAudit();
  const byPatient = await api('GET', `/audit?patientId=${pat.id}&action=view&outcome=success`, su.token);
  assert.equal(byPatient.status, 200);
  assert.ok(byPatient.body.total >= 1);
  assert.ok(byPatient.body.data.every((r: any) => r.patientId === pat.id && r.action === 'view' && r.outcome === 'success'));
  assert.equal(byPatient.body.data[0].patient.mrn, 'MRN-001');
  const ids = byPatient.body.data.map((r: any) => r.id);
  assert.deepEqual(ids, [...ids].sort((a: number, b: number) => b - a), 'newest first');
  const capped = await api('GET', '/audit?limit=100000', su.token);
  assert.equal(capped.body.limit, 200);
  assert.equal((await api('GET', '/audit?from=not-a-date', su.token)).status, 400);
  const future = await api('GET', '/audit?from=2999-01-01', su.token);
  assert.equal(future.body.total, 0);
  const today = new Date().toISOString().slice(0, 10);
  assert.ok((await api('GET', `/audit?from=${today}&to=${today}`, su.token)).body.total > 0, 'a bare end date includes that whole day');
  const actions = await api('GET', '/audit/actions', su.token);
  assert.ok(actions.body.data.some((a: any) => a.action === 'login'));
});

test('CSV export has a header, no spreadsheet-formula injection, and is itself logged', async () => {
  const su = await tokenFor('superuser');
  await recordAudit({ actorType: 'anonymous', action: 'login_failed', outcome: 'failed', actorEmail: '=cmd|calc@test.example', detail: '=1+1, "quoted"' });
  const res = await raw('GET', '/audit/export', su.token);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"/);
  const text = await res.text();
  assert.match(text.split('\r\n')[0], /^id,time_utc,actor_type,actor,role,action/);
  assert.ok(text.includes(`'=cmd|calc@test.example`), 'leading = is neutralised');
  assert.ok(text.includes(`"'=1+1, ""quoted"""`), 'commas and quotes are escaped');
  assert.ok((await rows({ actorId: su.id, action: 'export_audit_log' })).length === 1);
});

test('the database refuses to edit or delete audit entries', async () => {
  const [first] = await rows();
  // Through the ORM (Prisma reports a trigger abort as a constraint error)...
  await assert.rejects(() => prisma.auditLog.update({ where: { id: first.id }, data: { detail: 'rewritten' } }));
  await assert.rejects(() => prisma.auditLog.delete({ where: { id: first.id } }));
  await assert.rejects(() => prisma.auditLog.deleteMany({}));
  // ...and with raw SQL, where the real reason is visible.
  await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET outcome = 'success' WHERE id = ${first.id}`), /append-only/);
  await assert.rejects(() => prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`), /append-only/);
  assert.equal((await rows()).length > 0, true);
});

test('the integrity check passes on an untouched log', async () => {
  const su = await tokenFor('superuser');
  const r = await api('GET', '/audit/verify', su.token);
  assert.equal(r.body.ok, true);
  assert.ok(r.body.checked > 20);
});

// The next tests deliberately defeat the database protection to prove the chain notices. They put everything back.
const dropTriggers = async () => { await prisma.$executeRawUnsafe('DROP TRIGGER "AuditLog_no_update"'); await prisma.$executeRawUnsafe('DROP TRIGGER "AuditLog_no_delete"'); };
const addTriggers = async () => {
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "AuditLog_no_update" BEFORE UPDATE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "AuditLog_no_delete" BEFORE DELETE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END`);
};

test('tampering with an entry is detected and pinpointed', async () => {
  const all = await rows();
  const victim = all[Math.floor(all.length / 2)];
  await dropTriggers();
  try {
    await prisma.auditLog.update({ where: { id: victim.id }, data: { outcome: victim.outcome === 'success' ? 'failed' : 'success' } });
    const report = await verifyAuditChain();
    assert.equal(report.ok, false);
    assert.equal(report.brokenAtId, victim.id);
    assert.match(report.reason!, /modified/);
    await prisma.auditLog.update({ where: { id: victim.id }, data: { outcome: victim.outcome } });
  } finally {
    await addTriggers();
  }
  assert.equal((await verifyAuditChain()).ok, true);
});

test('removing an entry is detected', async () => {
  const all = await rows();
  const victim = all[Math.floor(all.length / 2)];
  await dropTriggers();
  try {
    await prisma.auditLog.delete({ where: { id: victim.id } });
    const report = await verifyAuditChain();
    assert.equal(report.ok, false);
    assert.equal(report.brokenAtId, all[Math.floor(all.length / 2) + 1].id, 'breaks at the entry after the removed one');
    await prisma.auditLog.create({ data: victim });
  } finally {
    await addTriggers();
  }
  assert.equal((await verifyAuditChain()).ok, true);
});

test('patient search works and ignores case (regression: it used to return a server error)', async () => {
  const s = await tokenFor('user');
  const res = await api('GET', '/patients?search=jennifer', s.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((p: any) => p.lastName), ['Martinez']);
  assert.equal((await api('GET', '/patients?search=MARTINEZ', s.token)).body.total, 1);
  assert.equal((await api('GET', '/patients?search=zzzzzz', s.token)).body.total, 0);
});

test('the consent form names the practice', async () => {
  const s = await tokenFor('user');
  const r = await api('GET', '/forms/templates/consent', s.token);
  assert.equal(r.status, 200);
  assert.ok(r.body.fields[0].label.includes('Premier Weight Management and Lifestyle'));
  assert.ok(!JSON.stringify(r.body).includes('LifeStart'));
});
