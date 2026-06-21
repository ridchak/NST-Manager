import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

function transformEntry(e: any) {
  const parts = e.bloodPressure?.split('/') ?? [];
  const bloodPressureSystolic = parts[0] ? parseInt(parts[0].trim(), 10) : null;
  const bloodPressureDiastolic = parts[1] ? parseInt(parts[1].trim(), 10) : null;
  return {
    ...e,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    waistCircumference: e.waist ?? null,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, startDate, endDate, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
        orderBy: { date: 'desc' },
        include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
      }),
      prisma.progressEntry.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limitNum) || 1;
    res.json({ data: entries.map(transformEntry), total, page: pageNum, limit: limitNum, totalPages });
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
    res.json(entries.map(transformEntry));
  } catch {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

const entrySchema = z.object({
  patientId: z.string(),
  date: z.string(),
  weight: z.coerce.number().positive().optional(),
  bmi: z.coerce.number().positive().optional(),
  waist: z.coerce.number().positive().optional(),
  waistCircumference: z.coerce.number().positive().optional(),
  hips: z.coerce.number().positive().optional(),
  neck: z.coerce.number().positive().optional(),
  bloodPressure: z.string().optional(),
  bloodPressureSystolic: z.coerce.number().int().positive().optional(),
  bloodPressureDiastolic: z.coerce.number().int().positive().optional(),
  heartRate: z.coerce.number().int().positive().optional(),
  glucose: z.coerce.number().positive().optional(),
  a1c: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = entrySchema.parse(req.body);
    let bloodPressure = data.bloodPressure;
    if (!bloodPressure && data.bloodPressureSystolic && data.bloodPressureDiastolic) {
      bloodPressure = `${data.bloodPressureSystolic}/${data.bloodPressureDiastolic}`;
    }
    const waist = data.waist ?? data.waistCircumference;
    const entry = await prisma.progressEntry.create({
      data: {
        patientId: data.patientId,
        date: new Date(data.date),
        weight: data.weight,
        bmi: data.bmi,
        waist,
        hips: data.hips,
        neck: data.neck,
        bloodPressure,
        heartRate: data.heartRate,
        glucose: data.glucose,
        a1c: data.a1c,
        notes: data.notes,
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(transformEntry(entry));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create progress entry' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = entrySchema.partial().parse(req.body);
    let bloodPressure = data.bloodPressure;
    if (!bloodPressure && data.bloodPressureSystolic && data.bloodPressureDiastolic) {
      bloodPressure = `${data.bloodPressureSystolic}/${data.bloodPressureDiastolic}`;
    }
    const waist = data.waist ?? data.waistCircumference;
    const entry = await prisma.progressEntry.update({
      where: { id: req.params.id },
      data: {
        ...(data.date && { date: new Date(data.date) }),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.bmi !== undefined && { bmi: data.bmi }),
        ...(waist !== undefined && { waist }),
        ...(data.hips !== undefined && { hips: data.hips }),
        ...(data.neck !== undefined && { neck: data.neck }),
        ...(bloodPressure !== undefined && { bloodPressure }),
        ...(data.heartRate !== undefined && { heartRate: data.heartRate }),
        ...(data.glucose !== undefined && { glucose: data.glucose }),
        ...(data.a1c !== undefined && { a1c: data.a1c }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    res.json(transformEntry(entry));
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
