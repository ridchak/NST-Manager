import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { verifyAuditChain } from '../services/audit';

/**
 * Read-only. There is intentionally no endpoint (and no database permission) to edit or delete entries.
 * Superuser only; reading the log is itself recorded in the log.
 */
const router = Router();
router.use(requireRole('superuser'));

const DAY = 86400000;

function parseDate(v: unknown, endOfDay = false): Date | null | 'invalid' {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return 'invalid';
  // A bare date ("2026-10-18") as an end bound means "through the end of that day".
  return endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(d.getTime() + DAY) : d;
}

function buildWhere(q: Record<string, unknown>): { where?: any; error?: string } {
  const from = parseDate(q.from);
  const to = parseDate(q.to, true);
  if (from === 'invalid' || to === 'invalid') return { error: 'from/to must be valid dates' };
  const where: any = {};
  if (from || to) where.at = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  for (const key of ['actorId', 'patientId', 'action', 'outcome', 'resource'] as const) {
    if (typeof q[key] === 'string' && q[key]) where[key] = q[key];
  }
  return { where };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { where, error } = buildWhere(req.query);
    if (error) return res.status(400).json({ error });
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 50));
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.auditLog.count({ where }),
    ]);
    const ids = [...new Set(rows.map(r => r.patientId).filter((x): x is string => !!x))];
    const patients = ids.length
      ? await prisma.patient.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, mrn: true } })
      : [];
    const byId = new Map(patients.map(p => [p.id, p]));
    res.json({
      data: rows.map(r => ({ ...r, patient: r.patientId ? byId.get(r.patientId) ?? null : null })),
      total, page, limit, totalPages: Math.ceil(total / limit) || 1,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

router.get('/actions', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } });
    res.json({ data: rows.map(r => ({ action: r.action, count: r._count._all })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

router.get('/verify', async (_req: Request, res: Response) => {
  try {
    res.json(await verifyAuditChain());
  } catch {
    res.status(500).json({ error: 'Failed to verify audit log' });
  }
});

const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  // Stop spreadsheet programs from running cell contents as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export', async (req: Request, res: Response) => {
  try {
    const { where, error } = buildWhere(req.query);
    if (error) return res.status(400).json({ error });
    const rows = await prisma.auditLog.findMany({ where, orderBy: { id: 'asc' }, take: 50000 });
    const header = ['id', 'time_utc', 'actor_type', 'actor', 'role', 'action', 'resource', 'resource_id', 'patient_id', 'outcome', 'status', 'method', 'path', 'ip', 'detail'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.id, r.at.toISOString(), r.actorType, r.actorEmail ?? r.actorId, r.actorRole, r.action, r.resource, r.resourceId, r.patientId, r.outcome, r.statusCode, r.method, r.path, r.ip, r.detail].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\r\n') + '\r\n');
  } catch {
    res.status(500).json({ error: 'Failed to export audit log' });
  }
});

export default router;
