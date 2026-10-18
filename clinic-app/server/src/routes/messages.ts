import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status = 'open', type } = req.query as Record<string, string>;
    const where: any = {};
    if (status !== 'all') where.status = status;
    if (type) where.type = type;
    const messages = await prisma.staffMessage.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], // 'normal' < 'urgent' alphabetically, so reverse below
      take: 200,
      include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
    });
    messages.sort((a, b) => (a.priority === b.priority ? +b.createdAt - +a.createdAt : a.priority === 'urgent' ? -1 : 1));
    res.json({ data: messages, total: messages.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/calls', async (_req: Request, res: Response) => {
  try {
    const calls = await prisma.callLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ data: calls.map(c => ({ ...c, events: JSON.parse(c.events) })), total: calls.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch call log' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status } = z.object({ status: z.enum(['open', 'done']) }).parse(req.body);
    const msg = await prisma.staffMessage.update({
      where: { id: req.params.id },
      data: { status, resolvedAt: status === 'done' ? new Date() : null },
    });
    res.json(msg);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Message not found' });
    res.status(500).json({ error: 'Failed to update message' });
  }
});

export default router;
