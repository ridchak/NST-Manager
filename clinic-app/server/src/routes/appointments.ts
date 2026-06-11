import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, providerId, status, startDate, endDate, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (providerId) where.providerId = providerId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { date: 'asc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true, phone: true } },
          provider: { select: { id: true, name: true } },
        },
      }),
      prisma.appointment.count({ where }),
    ]);
    res.json({ appointments, total });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

router.get('/today', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const appointments = await prisma.appointment.findMany({
      where: { date: { gte: today, lt: tomorrow }, status: { not: 'cancelled' } },
      orderBy: { date: 'asc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true, phone: true } },
        provider: { select: { id: true, name: true } },
      },
    });
    res.json(appointments);
  } catch {
    res.status(500).json({ error: 'Failed to fetch today schedule' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: {
        patient: true,
        provider: { select: { id: true, name: true, email: true } },
      },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appt);
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

const apptSchema = z.object({
  patientId: z.string(),
  providerId: z.string(),
  date: z.string(),
  duration: z.number().int().min(5).max(480).default(30),
  type: z.enum(['initial-consult', 'follow-up', 'weigh-in', 'nutrition', 'procedure', 'telehealth']),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show']).default('scheduled'),
  reason: z.string().optional(),
  notes: z.string().optional(),
  ecwId: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = apptSchema.parse(req.body);
    const appt = await prisma.appointment.create({
      data: { ...data, date: new Date(data.date) },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        provider: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(appt);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = apptSchema.partial().parse(req.body);
    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { ...data, date: data.date ? new Date(data.date) : undefined },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, name: true } },
      },
    });
    res.json(appt);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Appointment not found' });
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.appointment.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });
    res.json({ message: 'Appointment cancelled' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Appointment not found' });
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

export default router;
