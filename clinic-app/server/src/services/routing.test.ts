import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRACTICE } from './practice';
import { DEPARTMENTS, decideTransfer, extensionFor } from './routing';

test('the department extensions are 101 front desk, 102 scheduling, 103 medications and prior auth, 104 billing', () => {
  assert.deepEqual(
    DEPARTMENTS.map(d => extensionFor(d, DEFAULT_PRACTICE)),
    ['101', '102', '103', '104'],
  );
  assert.deepEqual([...DEPARTMENTS], ['front_desk', 'scheduling', 'medications', 'billing']);
});

test('office open: transfer to the department extension', () => {
  const d = decideTransfer('scheduling', true, DEFAULT_PRACTICE);
  assert.deepEqual([d.action, (d as any).transferNumber, (d as any).transferType], ['transfer', '102', 'extension']);
  assert.match(d.say, /scheduling team/);
});

test('office closed: no transfer, a message is taken', () => {
  for (const dept of DEPARTMENTS) {
    const d = decideTransfer(dept, false, DEFAULT_PRACTICE);
    assert.equal(d.action, 'message_taken', dept);
    assert.match(d.say, /closed/i);
    assert.equal((d as any).transferNumber, undefined);
  }
});

test('office open but the extension is not set: a message is taken instead of a dead transfer', () => {
  const d = decideTransfer('billing', true, { ...DEFAULT_PRACTICE, extBilling: null });
  assert.equal(d.action, 'message_taken');
  assert.doesNotMatch(d.say, /closed/i);
});
