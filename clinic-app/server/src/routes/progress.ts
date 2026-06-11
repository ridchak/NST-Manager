import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, startDate, endDate, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const [entries, total] = await Promise.all([
      prisma.progressEntry.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { date: 'desc' },
        include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
      }),
      prisma.progressEntry.count({ where }),
    ]);
    res.json({ entries, total });
  } catch {
    res.status(500).json({ error: 'Failed to fetch progress entries' });
  }
});

router.get('/chart/:patientId', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.progressEntry.findMany({
      where: { patientId: req.params.patientId },
      orderBy: { date: 'asc' },
      select: { date: true, weight: true, bmi: true, waist: true, glucose: true, bloodPressure: true },
    });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

const entrySchema = z.object({
  patientId: z.string(),
  date: z.string(),
  weight: z.number().positive().optional(),
  bmi: z.number().positive().optional(),
  waist: z.number().positive().optional(),
  hips: z.number().positive().optional(),
  neck: z.number().positive().optional(),
  bloodPressure: z.string().optional(),
  heartRate: z.number().int().positive().optional(),
  glucose: z.number().positive().optional(),
  a1c: z.number().positive().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = entrySchema.parse(req.body);
    const entry = await prisma.progressEntry.create({
      data: { ...data, date: new Date(data.date) },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(entry);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create progress entry' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = entrySchema.partial().parse(req.body);
    const entry = await prisma.progressEntry.update({
      where: { id: req.params.id },
      data: { ...data, date: data.date ? new Date(data.date) : undefined },
    });
    res.json(entry);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' });
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.progressEntry.delete({ where: { id: req.params.id } });
    res.json({ message: 'Entry deleted' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' });
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
