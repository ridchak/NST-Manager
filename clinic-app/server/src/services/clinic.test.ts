import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicName, DEFAULT_CLINIC_NAME } from '../lib/clinic';
import { buildSystemPrompt } from './assistantPrompt';

const NAME = 'Premier Weight Management and Lifestyle';

test('the practice name defaults to Premier Weight Management and Lifestyle', () => {
  const saved = process.env.CLINIC_NAME;
  delete process.env.CLINIC_NAME;
  try {
    assert.equal(DEFAULT_CLINIC_NAME, NAME);
    assert.equal(clinicName(), NAME);
    process.env.CLINIC_NAME = '  ';
    assert.equal(clinicName(), NAME, 'blank falls back to the default');
    process.env.CLINIC_NAME = 'Another Practice';
    assert.equal(clinicName(), 'Another Practice', 'can be overridden');
  } finally {
    if (saved === undefined) delete process.env.CLINIC_NAME; else process.env.CLINIC_NAME = saved;
  }
});

test('the phone assistant introduces the practice by name and carries no old branding', () => {
  const saved = process.env.CLINIC_NAME;
  delete process.env.CLINIC_NAME;
  try {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes(`Thank you for calling ${NAME}.`));
    assert.ok(prompt.includes(`phone assistant for ${NAME}`));
    assert.ok(!/LifeStart|\bNST\b/.test(prompt));
  } finally {
    if (saved !== undefined) process.env.CLINIC_NAME = saved;
  }
});
