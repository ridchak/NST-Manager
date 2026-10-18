import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { passwordSchema } from '../lib/password';
import { requireRole } from '../middleware/auth';
import { ROLES } from '../services/access';
import { digits10, toE164 } from '../lib/phone';

/** Account management. Superuser only (enforced here and by the global permission policy). */
const router = Router();
router.use(requireRole('superuser'));

const select = {
  id: true, email: true, name: true, role: true, isProvider: true, active: true,
  extension: true, cellPhone: true, failedLogins: true, lockedUntil: true, createdAt: true,
} as const;

const present = (u: any) => ({
  ...u,
  locked: !!u.lockedUntil && u.lockedUntil.getTime() > Date.now(),
});

/** Internal extension: 2-6 digits. Blank clears it. */
const extensionSchema = z.string().trim().nullable().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!/^\d{2,6}$/.test(v)) { ctx.addIssue({ code: 'custom', message: 'Extension must be 2 to 6 digits' }); return z.NEVER; }
  return v;
});

/** Cell number: stored as +1XXXXXXXXXX so telephony platforms can dial it. Blank clears it. */
const cellSchema = z.string().trim().nullable().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const e164 = toE164(v);
  if (!e164 || !digits10(v)) { ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit US cell number' }); return z.NEVER; }
  return e164;
});

const roleSchema = z.enum(ROLES as [string, ...string[]]);

async function otherActiveSuperusers(excludingId: string): Promise<number> {
  return prisma.user.count({ where: { role: 'superuser', active: true, NOT: { id: excludingId } } });
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ select, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    res.json({ data: users.map(present), total: users.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = z.object({
      email: z.string().email().transform(e => e.trim().toLowerCase()),
      name: z.string().min(1),
      password: passwordSchema,
      role: roleSchema.default('user'),
      isProvider: z.boolean().default(false),
      extension: extensionSchema,
      cellPhone: cellSchema,
    }).parse(req.body);
    const user = await prisma.user.create({
      data: { ...body, password: await bcrypt.hash(body.password, 10) },
      select,
    });
    res.locals.auditDetail = `account: ${user.email}, level: ${user.role}`;
    res.status(201).json(present(user));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors.map((e: any) => e.message).join('; ') });
    if (err.code === 'P2002') return res.status(409).json({ error: 'An account with that email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      role: roleSchema.optional(),
      isProvider: z.boolean().optional(),
      active: z.boolean().optional(),
      extension: extensionSchema,
      cellPhone: cellSchema,
    }).parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isSelf = target.id === req.user!.userId;
    const losesSuperuser = target.role === 'superuser' && ((body.role && body.role !== 'superuser') || body.active === false);
    if (isSelf && (body.role !== undefined && body.role !== target.role)) {
      return res.status(400).json({ error: 'You cannot change your own access level.' });
    }
    if (isSelf && body.active === false) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    if (losesSuperuser && (await otherActiveSuperusers(target.id)) === 0) {
      return res.status(400).json({ error: 'There must always be at least one active superuser.' });
    }

    const changes: string[] = [`account: ${target.email}`];
    if (body.role && body.role !== target.role) changes.push(`level ${target.role} -> ${body.role}`);
    if (body.active !== undefined && body.active !== target.active) changes.push(body.active ? 'reactivated' : 'deactivated');
    res.locals.auditDetail = changes.join(', ');
    const user = await prisma.user.update({ where: { id: target.id }, data: body, select });
    res.json(present(user));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors.map((e: any) => e.message).join('; ') });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/:id/unlock', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { failedLogins: 0, lockedUntil: null }, select });
    console.warn(`SECURITY: ${req.user!.email} unlocked ${user.email}`);
    res.locals.auditDetail = `account: ${user.email}`;
    res.json(present(user));
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: 'Failed to unlock user' });
  }
});

router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { newPassword } = z.object({ newPassword: passwordSchema }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { password: await bcrypt.hash(newPassword, 10), failedLogins: 0, lockedUntil: null },
      select,
    });
    console.warn(`SECURITY: ${req.user!.email} reset the password for ${user.email}`);
    res.locals.auditDetail = `account: ${user.email}`;
    res.json(present(user));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors.map((e: any) => e.message).join('; ') });
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user!.userId) return res.status(400).json({ error: 'You cannot delete your own account.' });
    if (target.role === 'superuser' && (await otherActiveSuperusers(target.id)) === 0) {
      return res.status(400).json({ error: 'There must always be at least one active superuser.' });
    }
    res.locals.auditDetail = `account: ${target.email}`;
    await prisma.user.delete({ where: { id: target.id } });
    res.json({ message: 'User deleted' });
  } catch (err: any) {
    // Appointments keep a reference to their provider, so those accounts can only be deactivated.
    if (err.code === 'P2003') return res.status(409).json({ error: 'This user has appointment history. Deactivate the account instead of deleting it.' });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
