import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { passwordSchema } from '../lib/password';
import { authMiddleware } from '../middleware/auth';
import { clientInfo, recordAudit, AuditEntry } from '../services/audit';
import { lockMessage, lockMinutes, maxAttempts, recordUnknownFailure, unknownLockedUntil } from '../services/loginLockout';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server will not start.');
  process.exit(1);
}

// Compared against when the email is unknown so response time does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  email: z.string().email().transform(e => e.trim().toLowerCase()),
  password: z.string().min(1),
});

/** Sign-in events go to the audit log too: who tried, from where, and what happened. */
function auditAuth(req: Request, entry: Partial<AuditEntry> & { action: string; outcome: AuditEntry['outcome'] }) {
  return recordAudit({ actorType: 'anonymous', resource: 'auth', method: req.method, path: req.originalUrl.split('?')[0], ...clientInfo(req), ...entry });
}

const publicUser = (u: { id: string; email: string; name: string; role: string; isProvider: boolean }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, isProvider: u.isProvider,
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const now = Date.now();
    const user = await prisma.user.findUnique({ where: { email } });

    // Unknown email: behave exactly like a real account, including locking.
    if (!user) {
      const lockedUntil = unknownLockedUntil(email, now);
      if (lockedUntil) {
        void auditAuth(req, { action: 'login_blocked', outcome: 'denied', statusCode: 423, actorEmail: email, detail: 'unknown account, locked' });
        return res.status(423).json({ error: lockMessage(lockedUntil, now), locked: true });
      }
      await bcrypt.compare(password, DUMMY_HASH);
      const f = recordUnknownFailure(email, now);
      void auditAuth(req, { action: 'login_failed', outcome: 'failed', statusCode: f.lockedUntil ? 423 : 401, actorEmail: email, detail: f.lockedUntil ? 'unknown account, now locked' : 'unknown account' });
      if (f.lockedUntil) return res.status(423).json({ error: lockMessage(f.lockedUntil, now), locked: true });
      return res.status(401).json({ error: 'Invalid credentials', attemptsLeft: maxAttempts() - f.count });
    }

    // Locked: refuse before looking at the password, so a correct password does not get in either.
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      void auditAuth(req, { action: 'login_blocked', outcome: 'denied', statusCode: 423, actorId: user.id, actorEmail: user.email, actorRole: user.role, detail: 'account is locked' });
      return res.status(423).json({ error: lockMessage(user.lockedUntil, now), locked: true });
    }
    // An expired lock gives a fresh set of attempts.
    const priorFailures = user.lockedUntil ? 0 : user.failedLogins;

    const ok = await bcrypt.compare(password, user.password);
    if (!ok || !user.active) {
      if (!user.active && ok) {
        void auditAuth(req, { action: 'login_failed', outcome: 'denied', statusCode: 401, actorId: user.id, actorEmail: user.email, actorRole: user.role, detail: 'account deactivated' });
        return res.status(401).json({ error: 'Invalid credentials' }); // deactivated: do not reveal
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: user.lockedUntil
          ? { failedLogins: 1, lockedUntil: null } // lock had expired
          : { failedLogins: { increment: 1 } },
        select: { failedLogins: true },
      });
      const count = user.lockedUntil ? 1 : updated.failedLogins;
      if (count >= maxAttempts()) {
        const until = new Date(now + lockMinutes() * 60000);
        await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
        console.warn(`SECURITY: account locked after ${count} failed sign-ins: ${user.email}`);
        void auditAuth(req, { action: 'account_locked', outcome: 'denied', statusCode: 423, actorId: user.id, actorEmail: user.email, actorRole: user.role, detail: `locked after ${count} failed sign-ins` });
        return res.status(423).json({ error: lockMessage(until, now), locked: true });
      }
      void auditAuth(req, { action: 'login_failed', outcome: 'failed', statusCode: 401, actorId: user.id, actorEmail: user.email, actorRole: user.role, detail: `wrong password (${count} of ${maxAttempts()})` });
      return res.status(401).json({ error: 'Invalid credentials', attemptsLeft: maxAttempts() - count });
    }

    if (priorFailures > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    void auditAuth(req, { action: 'login', actorType: 'user', outcome: 'success', statusCode: 200, actorId: user.id, actorEmail: user.email, actorRole: user.role });
    res.json({ token, user: publicUser(user) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  void auditAuth(req, { action: 'logout', actorType: 'user', outcome: 'success', statusCode: 200, actorId: req.user!.userId, actorEmail: req.user!.email, actorRole: req.user!.role });
  res.json({ message: 'Signed out' });
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, isProvider: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      void auditAuth(req, { action: 'password_change_failed', actorType: 'user', outcome: 'failed', statusCode: 401, actorId: req.user!.userId, actorEmail: req.user!.email, actorRole: req.user!.role, detail: 'current password incorrect' });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different' });
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(newPassword, 10) } });
    void auditAuth(req, { action: 'password_changed', actorType: 'user', outcome: 'success', statusCode: 200, actorId: user.id, actorEmail: user.email, actorRole: user.role });
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
