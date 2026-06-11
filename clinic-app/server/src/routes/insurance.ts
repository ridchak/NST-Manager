import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [pending, approved, denied, expired] = await Promise.all([
      prisma.insuranceAuth.count({ where: { status: 'pending' } }),
      prisma.insuranceAuth.count({ where: { status: 'approved' } }),
      prisma.insuranceAuth.count({ where: { status: 'denied' } }),
      prisma.insuranceAuth.count({ where: { status: 'expired' } }),
    ]);
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = await prisma.insuranceAuth.count({
      where: { status: 'approved', endDate: { gte: now, lte: in30Days } },
    });
    const byPayer = await prisma.insuranceAuth.groupBy({
      by: ['serviceType'],
      _count: { _all: true },
    });
    res.json({ pending, approved, denied, expired, expiringSoon, byPayer });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, status, startDate, endDate, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.requestDate = {};
      if (startDate) where.requestDate.gte = new Date(startDate);
      if (endDate) where.requestDate.lte = new Date(endDate);
    }
    const [auths, total] = await Promise.all([
      prisma.insuranceAuth.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
          insurance: true,
          documents: true,
        },
      }),
      prisma.insuranceAuth.count({ where }),
    ]);
    const parsed = auths.map(a => ({
      ...a,
      diagnosisCodes: JSON.parse(a.diagnosisCodes),
      procedureCodes: JSON.parse(a.procedureCodes),
    }));
    const totalPages = Math.ceil(total / parseInt(limit)) || 1;
    res.json({ data: parsed, total, page: parseInt(page), limit: parseInt(limit), totalPages });
  } catch {
    res.status(500).json({ error: 'Failed to fetch authorizations' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const auth = await prisma.insuranceAuth.findUnique({
      where: { id: req.params.id },
      include: {
        patient: true,
        insurance: true,
        documents: true,
      },
    });
    if (!auth) return res.status(404).json({ error: 'Authorization not found' });
    res.json({
      ...auth,
      diagnosisCodes: JSON.parse(auth.diagnosisCodes),
      procedureCodes: JSON.parse(auth.procedureCodes),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch authorization' });
  }
});

const authSchema = z.object({
  patientId: z.string(),
  insuranceId: z.string(),
  serviceType: z.string().min(1),
  diagnosisCodes: z.array(z.string()).default([]),
  procedureCodes: z.array(z.string()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = authSchema.parse(req.body);
    const auth = await prisma.insuranceAuth.create({
      data: {
        ...data,
        diagnosisCodes: JSON.stringify(data.diagnosisCodes),
        procedureCodes: JSON.stringify(data.procedureCodes),
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: 'pending',
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } }, insurance: true },
    });
    res.status(201).json({
      ...auth,
      diagnosisCodes: JSON.parse(auth.diagnosisCodes),
      procedureCodes: JSON.parse(auth.procedureCodes),
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create authorization' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updateSchema = z.object({
      authNumber: z.string().optional(),
      status: z.enum(['pending', 'approved', 'denied', 'expired']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      notes: z.string().optional(),
      diagnosisCodes: z.array(z.string()).optional(),
      procedureCodes: z.array(z.string()).optional(),
    });
    const data = updateSchema.parse(req.body);
    const auth = await prisma.insuranceAuth.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(data.diagnosisCodes && { diagnosisCodes: JSON.stringify(data.diagnosisCodes) }),
        ...(data.procedureCodes && { procedureCodes: JSON.stringify(data.procedureCodes) }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
      },
    });
    res.json({
      ...auth,
      diagnosisCodes: JSON.parse(auth.diagnosisCodes),
      procedureCodes: JSON.parse(auth.procedureCodes),
    });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
    res.status(500).json({ error: 'Failed to update authorization' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.insuranceAuth.delete({ where: { id: req.params.id } });
    res.json({ message: 'Authorization deleted' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Authorization not found' });
    res.status(500).json({ error: 'Failed to delete authorization' });
  }
});

export default router;
