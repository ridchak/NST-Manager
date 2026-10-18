import test from 'node:test';
import assert from 'node:assert/strict';
import { canDo, requiredRole, atLeast } from './access';

test('user: can view and add, cannot edit or delete', () => {
  assert.equal(canDo('user', 'GET', '/patients'), true);
  assert.equal(canDo('user', 'POST', '/patients'), true);
  assert.equal(canDo('user', 'POST', '/progress'), true);
  assert.equal(canDo('user', 'PUT', '/patients/abc'), false);
  assert.equal(canDo('user', 'PUT', '/insurance/abc'), false);
  assert.equal(canDo('user', 'DELETE', '/patients/abc'), false);
  assert.equal(canDo('user', 'DELETE', '/progress/abc'), false);
});

test('admin: can edit, cannot delete or manage accounts', () => {
  assert.equal(canDo('admin', 'PUT', '/patients/abc'), true);
  assert.equal(canDo('admin', 'PUT', '/insurance/abc'), true);
  assert.equal(canDo('admin', 'PATCH', '/progress/abc'), true);
  assert.equal(canDo('admin', 'DELETE', '/patients/abc'), false);
  assert.equal(canDo('admin', 'DELETE', '/insurance/abc'), false);
  assert.equal(canDo('admin', 'GET', '/users'), false);
});

test('superuser: full control including accounts', () => {
  for (const [m, p] of [['GET', '/users'], ['POST', '/users'], ['DELETE', '/patients/abc'], ['PUT', '/patients/abc'], ['DELETE', '/users/abc']]) {
    assert.equal(canDo('superuser', m, p), true, `${m} ${p}`);
  }
});

test('routine exceptions: any user may cancel an appointment and mark a message done', () => {
  assert.equal(canDo('user', 'DELETE', '/appointments/abc'), true);
  assert.equal(canDo('user', 'PATCH', '/messages/abc'), true);
  // ...but the exception is narrow
  assert.equal(canDo('user', 'DELETE', '/appointments'), false);
  assert.equal(canDo('user', 'DELETE', '/appointments/abc/extra'), false);
  assert.equal(canDo('user', 'PUT', '/appointments/abc'), false);
});

test('unknown roles and verbs fail closed', () => {
  assert.equal(canDo('provider', 'GET', '/patients'), false);
  assert.equal(canDo('', 'GET', '/patients'), false);
  assert.equal(canDo('admin', 'TRACE', '/patients'), false);
  assert.equal(requiredRole('POST', '/users/'), 'superuser');
  assert.equal(requiredRole('get', '/patients?search=x'), 'user');
  assert.equal(atLeast('superuser', 'admin'), true);
  assert.equal(atLeast('user', 'admin'), false);
});
