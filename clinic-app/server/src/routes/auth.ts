import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { passwordSchema } from '../lib/password';
import { authMiddleware } from '../middleware/auth';
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
      if (lockedUntil) return res.status(423).json({ error: lockMessage(lockedUntil, now), locked: true });
      await bcrypt.compare(password, DUMMY_HASH);
      const f = recordUnknownFailure(email, now);
      if (f.lockedUntil) return res.status(423).json({ error: lockMessage(f.lockedUntil, now), locked: true });
      return res.status(401).json({ error: 'Invalid credentials', attemptsLeft: maxAttempts() - f.count });
    }

    // Locked: refuse before looking at the password, so a correct password does not get in either.
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      return res.status(423).json({ error: lockMessage(user.lockedUntil, now), locked: true });
    }
    // An expired lock gives a fresh set of attempts.
    const priorFailures = user.lockedUntil ? 0 : user.failedLogins;

    const ok = await bcrypt.compare(password, user.password);
    if (!ok || !user.active) {
      if (!user.active && ok) return res.status(401).json({ error: 'Invalid credentials' }); // deactivated: do not reveal
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
        return res.status(423).json({ error: lockMessage(until, now), locked: true });
      }
      return res.status(401).json({ error: 'Invalid credentials', attemptsLeft: maxAttempts() - count });
    }

    if (priorFailures > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: publicUser(user) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Login failed' });
  }
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
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different' });
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(newPassword, 10) } });
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
