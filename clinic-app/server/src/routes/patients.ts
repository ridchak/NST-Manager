import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search = '', page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { mrn: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }
      : {};
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { lastName: 'asc' },
        include: {
          _count: { select: { appointments: true, progressEntries: true } },
          progressEntries: { orderBy: { date: 'desc' }, take: 1 },
          appointments: { orderBy: { date: 'desc' }, take: 1, where: { status: { in: ['completed', 'scheduled', 'confirmed'] } } },
        },
      }),
      prisma.patient.count({ where }),
    ]);
    res.json({ patients, total, page: parseInt(page), limit: parseInt(limit) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: { orderBy: { date: 'desc' }, include: { provider: { select: { id: true, name: true } } } },
        progressEntries: { orderBy: { date: 'desc' } },
        intakeForms: { orderBy: { createdAt: 'desc' } },
        insuranceInfos: true,
        insuranceAuths: { orderBy: { createdAt: 'desc' }, include: { insurance: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch {
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.progressEntry.findMany({
      where: { patientId: req.params.id },
      orderBy: { date: 'asc' },
    });
    const apptCount = await prisma.appointment.count({ where: { patientId: req.params.id } });
    const first = entries.find(e => e.weight);
    const last = [...entries].reverse().find(e => e.weight);
    const weightLost = first && last ? first.weight! - last.weight! : 0;
    res.json({
      totalWeightLost: Math.round(weightLost * 10) / 10,
      appointmentCount: apptCount,
      progressEntryCount: entries.length,
      currentWeight: last?.weight ?? null,
      startWeight: first?.weight ?? null,
      currentBMI: last?.bmi ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

const patientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string(),
  gender: z.string(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  ecwId: z.string().optional(),
});

function generateMRN(): string {
  return 'WL' + Date.now().toString().slice(-7);
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = patientSchema.parse(req.body);
    const patient = await prisma.patient.create({
      data: { ...data, mrn: generateMRN(), dob: new Date(data.dob), email: data.email || null },
    });
    res.status(201).json(patient);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = patientSchema.partial().parse(req.body);
    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: { ...data, dob: data.dob ? new Date(data.dob) : undefined, email: data.email || null },
    });
    res.json(patient);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Patient not found' });
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.patient.delete({ where: { id: req.params.id } });
    res.json({ message: 'Patient deleted' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Patient not found' });
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

export default router;
