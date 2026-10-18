import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRACTICE } from './practice';
import { describeHours, hoursToSpec, isOfficeOpen, parseOfficeHours, clockLabel } from './protocol';
import { buildSystemPrompt } from './assistantPrompt';
import { digits10, formatPhone, spokenPhone, toE164 } from '../lib/phone';

const hours = parseOfficeHours(DEFAULT_PRACTICE.hours, DEFAULT_PRACTICE.timezone);
const open = (iso: string) => isOfficeOpen(new Date(iso), hours);

test('the practice details are the ones supplied', () => {
  assert.deepEqual(
    [DEFAULT_PRACTICE.street, DEFAULT_PRACTICE.suite, DEFAULT_PRACTICE.city, DEFAULT_PRACTICE.state, DEFAULT_PRACTICE.zip],
    ['2340 S Highland Ave', 'Ste 370', 'Lombard', 'IL', '60148'],
  );
  assert.equal(DEFAULT_PRACTICE.phone, '6304451022');
  assert.equal(DEFAULT_PRACTICE.fax, '6305597377');
  assert.equal(DEFAULT_PRACTICE.timezone, 'America/Chicago', 'Lombard is on Central time');
});

// 2026-10-12 is a Monday; Chicago is on daylight time (UTC-5) until Nov 1.
test('Monday and Thursday: open 8 AM to 5 PM', () => {
  assert.equal(open('2026-10-12T12:59:00Z'), false); // 7:59
  assert.equal(open('2026-10-12T13:00:00Z'), true);  // 8:00
  assert.equal(open('2026-10-12T21:59:00Z'), true);  // 4:59 PM
  assert.equal(open('2026-10-12T22:00:00Z'), false); // 5:00 PM
  assert.equal(open('2026-10-15T21:30:00Z'), true);  // Thursday 4:30 PM
  assert.equal(open('2026-10-15T22:00:00Z'), false); // Thursday 5:00 PM
});

test('Tuesday and Friday: open 8 AM to 4 PM', () => {
  assert.equal(open('2026-10-13T13:00:00Z'), true);
  assert.equal(open('2026-10-13T20:59:00Z'), true);  // 3:59 PM
  assert.equal(open('2026-10-13T21:00:00Z'), false); // 4:00 PM
  assert.equal(open('2026-10-16T20:59:00Z'), true);
  assert.equal(open('2026-10-16T21:00:00Z'), false);
});

test('Saturday: open 9 AM to 3 PM', () => {
  assert.equal(open('2026-10-17T13:59:00Z'), false); // 8:59
  assert.equal(open('2026-10-17T14:00:00Z'), true);  // 9:00
  assert.equal(open('2026-10-17T19:59:00Z'), true);  // 2:59 PM
  assert.equal(open('2026-10-17T20:00:00Z'), false); // 3:00 PM
});

test('Wednesday and Sunday are closed all day', () => {
  for (const h of ['06', '10', '14', '18', '22']) {
    assert.equal(open(`2026-10-14T${h}:00:00Z`), false, `Wed ${h}Z`);
    assert.equal(open(`2026-10-18T${h}:00:00Z`), false, `Sun ${h}Z`);
  }
});

test('the opening time follows daylight saving (Nov 2 is on standard time, UTC-6)', () => {
  assert.equal(open('2026-11-02T13:59:00Z'), false); // 7:59 CST
  assert.equal(open('2026-11-02T14:00:00Z'), true);  // 8:00 CST
  assert.equal(open('2026-10-26T12:59:00Z'), false); // 7:59 CDT
  assert.equal(open('2026-10-26T13:00:00Z'), true);  // 8:00 CDT
});

test('hours are described in plain English and round-trip', () => {
  assert.equal(describeHours(hours), 'Monday and Thursday 8 AM to 5 PM; Tuesday and Friday 8 AM to 4 PM; Saturday 9 AM to 3 PM; closed Wednesday and Sunday');
  assert.equal(hoursToSpec(hours.days), DEFAULT_PRACTICE.hours);
  assert.equal(clockLabel('12:00'), '12 PM');
  assert.equal(clockLabel('00:30'), '12:30 AM');
  assert.equal(clockLabel('15:45'), '3:45 PM');
});

test('phone helpers', () => {
  assert.equal(digits10('+1 (630) 445-1022'), '6304451022');
  assert.equal(digits10('630.445.1022'), '6304451022');
  assert.equal(digits10('123'), null);
  assert.equal(digits10('(055) 123-4567'), null, 'area code cannot start with 0');
  assert.equal(digits10('(630) 045-1022'), null, 'exchange cannot start with 0');
  assert.equal(toE164('3125550142'), '+13125550142');
  assert.equal(toE164('+1 (773) 555-0187'), '+17735550187');
  assert.equal(formatPhone('6305597377'), '(630) 559-7377');
  assert.equal(spokenPhone('6304451022'), 'six three zero, four four five, one zero two two');
});

test('the phone assistant knows the address, phone, fax and hours', () => {
  const saved = [process.env.OFFICE_HOURS, process.env.OFFICE_TZ];
  delete process.env.OFFICE_HOURS; delete process.env.OFFICE_TZ;
  try {
    const p = buildSystemPrompt();
    assert.ok(p.includes('2340 S Highland Ave, Ste 370, Lombard, IL 60148'));
    assert.ok(p.includes('(630) 445-1022'));
    assert.ok(p.includes('(630) 559-7377'));
    assert.ok(p.includes('six three zero, four four five, one zero two two'));
    assert.ok(p.includes('Central time'));
    assert.ok(p.includes('closed Wednesday and Sunday'));
    assert.ok(p.includes('Saturday 9 AM to 3 PM'));
  } finally {
    if (saved[0] !== undefined) process.env.OFFICE_HOURS = saved[0];
    if (saved[1] !== undefined) process.env.OFFICE_TZ = saved[1];
  }
});
