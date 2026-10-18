/**
 * Failed-login tracking for emails that do not belong to any account.
 * Without this, an attacker could tell real accounts from fake ones because only real
 * accounts would ever lock. Real accounts are tracked in the database (User.failedLogins).
 */

interface Entry { count: number; lockedUntil: number }

const MAX_TRACKED = 10_000;
const unknown = new Map<string, Entry>();

export const maxAttempts = () => Math.max(1, Number(process.env.LOGIN_MAX_ATTEMPTS) || 5);
export const lockMinutes = () => Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES) || 30);

export function minutesLeft(until: Date | number, now = Date.now()): number {
  const ms = (typeof until === 'number' ? until : until.getTime()) - now;
  return Math.max(1, Math.ceil(ms / 60000));
}

export function lockMessage(until: Date | number, now = Date.now()): string {
  return `This account is locked after too many failed sign-in attempts. Try again in ${minutesLeft(until, now)} minute(s), or ask a superuser to unlock it.`;
}

export function unknownLockedUntil(email: string, now = Date.now()): number | null {
  const e = unknown.get(email);
  if (!e) return null;
  if (e.lockedUntil && e.lockedUntil > now) return e.lockedUntil;
  if (e.lockedUntil) unknown.delete(email); // lock expired: start fresh
  return null;
}

/** Records a failure for an unknown email; returns the new failure count and any lock time. */
export function recordUnknownFailure(email: string, now = Date.now()): { count: number; lockedUntil: number | null } {
  if (unknown.size >= MAX_TRACKED) {
    for (const [k, v] of unknown) if (v.lockedUntil < now) unknown.delete(k);
    if (unknown.size >= MAX_TRACKED) unknown.clear(); // bounded memory under attack
  }
  const e = unknown.get(email) ?? { count: 0, lockedUntil: 0 };
  e.count += 1;
  if (e.count >= maxAttempts()) e.lockedUntil = now + lockMinutes() * 60000;
  unknown.set(email, e);
  return { count: e.count, lockedUntil: e.lockedUntil || null };
}

export function resetLockoutStateForTest() {
  unknown.clear();
}
