import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

const TYPE_ALIASES: Record<string, string> = {
  initial: 'initial-consult',
  followup: 'follow-up',
  phone: 'telehealth',
};

const STATUS_ALIASES: Record<string, string> = {
  no_show: 'no-show',
};

function normalizeType(t: string): string {
  return TYPE_ALIASES[t] ?? t;
}

function normalizeStatus(s: string): string {
  return STATUS_ALIASES[s] ?? s;
}

function transformAppt(a: any) {
  const start = new Date(a.date);
  const end = new Date(start.getTime() + (a.duration ?? 30) * 60000);
  return { ...a, startTime: start.toISOString(), endTime: end.toISOString() };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, providerId, status, startDate, endDate, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
        orderBy: { date: 'asc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true, phone: true } },
          provider: { select: { id: true, name: true } },
        },
      }),
      prisma.appointment.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limitNum) || 1;
    res.json({ data: appointments.map(transformAppt), total, page: pageNum, limit: limitNum, totalPages });
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
    res.json(appointments.map(transformAppt));
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
    res.json(transformAppt(appt));
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

const apptSchema = z.object({
  patientId: z.string(),
  providerId: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.coerce.number().int().min(5).max(480).optional(),
  type: z.string().min(1),
  status: z.string().optional().default('scheduled'),
  reason: z.string().optional(),
  notes: z.string().optional(),
  ecwId: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = apptSchema.parse(req.body);
    const providerId = data.providerId || req.user!.userId;

    let apptDate: Date;
    let duration: number;

    if (data.startTime) {
      apptDate = new Date(data.startTime);
      duration = data.endTime
        ? Math.max(5, Math.round((new Date(data.endTime).getTime() - apptDate.getTime()) / 60000))
        : (data.duration ?? 30);
    } else if (data.date) {
      apptDate = new Date(data.date);
      duration = data.duration ?? 30;
    } else {
      res.status(400).json({ error: 'date or startTime is required' });
      return;
    }

    const appt = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        providerId,
        date: apptDate,
        duration,
        type: normalizeType(data.type),
        status: normalizeStatus(data.status ?? 'scheduled'),
        reason: data.reason,
        notes: data.notes,
        ecwId: data.ecwId,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        provider: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(transformAppt(appt));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = apptSchema.partial().parse(req.body);

    let apptDate: Date | undefined;
    let duration: number | undefined;

    if (data.startTime) {
      apptDate = new Date(data.startTime);
      duration = data.endTime
        ? Math.max(5, Math.round((new Date(data.endTime).getTime() - apptDate.getTime()) / 60000))
        : (data.duration ?? 30);
    } else if (data.date) {
      apptDate = new Date(data.date);
      duration = data.duration;
    }

    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        ...(data.patientId && { patientId: data.patientId }),
        ...(data.providerId && { providerId: data.providerId }),
        ...(apptDate && { date: apptDate }),
        ...(duration !== undefined && { duration }),
        ...(data.type && { type: normalizeType(data.type) }),
        ...(data.status && { status: normalizeStatus(data.status) }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, name: true } },
      },
    });
    res.json(transformAppt(appt));
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
