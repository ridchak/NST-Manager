import { Request, Response, NextFunction } from 'express';
import { clientInfo, recordAudit } from '../services/audit';

const ID = /^c[a-z0-9]{20,}$/; // record ids (cuid)

export interface RequestDescription {
  action: string;
  resource: string | null;
  resourceId: string | null;
  patientId: string | null;
  detail: string | null;
}

const VERBS: Record<string, string> = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

/**
 * Turns an API request into an audit description. Pure and value-free: it records which
 * query parameters and body fields were present (names only), never what they contained.
 */
export function describeRequest(method: string, apiPath: string, query: Record<string, unknown> = {}, body: unknown = undefined): RequestDescription {
  const m = method.toUpperCase();
  const segs = apiPath.split('?')[0].split('/').filter(Boolean);
  const resource = segs[0] ?? null;
  let resourceId: string | null = null;
  const subs: string[] = [];
  for (const s of segs.slice(1)) {
    if (!resourceId && ID.test(s)) resourceId = s;
    else subs.push(s);
  }

  let action = VERBS[m] ?? m.toLowerCase();
  if (resource === 'users') {
    if (subs[0] === 'unlock') action = 'unlock_account';
    else if (subs[0] === 'reset-password') action = 'reset_password';
    else if (m === 'POST') action = 'user_created';
    else if (m === 'PATCH') action = 'user_updated';
    else if (m === 'DELETE') action = 'user_deleted';
  } else if (resource === 'appointments' && m === 'DELETE') {
    action = 'cancel';
  } else if (resource === 'audit') {
    if (subs[0] === 'verify') action = 'verify_audit_log';
    else if (subs[0] === 'export') action = 'export_audit_log';
  } else if (resource === 'phone' && m === 'POST') {
    action = subs[0] === 'call' ? 'phone_call' : 'send_text';
  }

  const qPatient = typeof query.patientId === 'string' ? query.patientId : null;
  const bPatient = body && typeof body === 'object' && typeof (body as any).patientId === 'string' ? (body as any).patientId : null;
  const patientId = resource === 'patients' && resourceId ? resourceId : qPatient ?? bPatient;

  const parts: string[] = [];
  if (subs.length) parts.push(subs.join('/'));
  const qKeys = Object.keys(query);
  if (qKeys.length) parts.push(`query: ${qKeys.join(',')}`);
  if (['POST', 'PUT', 'PATCH'].includes(m) && body && typeof body === 'object') {
    const keys = Object.keys(body as object);
    if (keys.length) parts.push(`fields: ${keys.join(',')}`);
  }
  return { action, resource, resourceId, patientId, detail: parts.length ? parts.join('; ') : null };
}

/**
 * Logs every authenticated API request once the response is sent (including refused ones).
 * Mount after authMiddleware and before authorize so permission denials are captured too.
 */
export function auditRequests(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') return next();

  const apiPath = req.path; // path under /api; captured now because Express rewrites req.url later
  const fullPath = req.originalUrl.split('?')[0];
  const user = req.user;
  const { ip, userAgent } = clientInfo(req);

  let sniffedPatientId: string | null = null;
  let sniffedId: string | null = null;
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (typeof body.patientId === 'string') sniffedPatientId = body.patientId;
      if (typeof body.id === 'string') sniffedId = body.id;
    }
    return json(body);
  };

  res.on('finish', () => {
    const d = describeRequest(req.method, apiPath, req.query as Record<string, unknown>, req.body);
    const created = req.method === 'POST' && res.statusCode < 300;
    const resourceId = d.resourceId ?? (created ? sniffedId : null);
    const patientId = d.patientId ?? sniffedPatientId ?? (created && d.resource === 'patients' ? sniffedId : null);
    const extra = typeof res.locals.auditDetail === 'string' ? res.locals.auditDetail : null;
    void recordAudit({
      actorType: 'user', actorId: user?.userId, actorEmail: user?.email, actorRole: user?.role,
      action: d.action, resource: d.resource, resourceId, patientId,
      outcome: res.statusCode < 400 ? 'success' : res.statusCode === 403 ? 'denied' : 'failed',
      statusCode: res.statusCode, method: req.method, path: fullPath, ip, userAgent,
      detail: [d.detail, extra].filter(Boolean).join('; ') || null,
    });
  });
  next();
}
