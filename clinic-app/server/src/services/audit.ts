import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../lib/prisma';

/**
 * Audit trail: who did what to which record, and when.
 *
 *  - Never stores request bodies, field values, or query values, only that something happened
 *    (and the NAMES of fields changed), so the log itself holds no patient information.
 *  - Append-only: database triggers reject UPDATE/DELETE (see the audit_log migration).
 *  - Tamper-evident: every row stores a hash that covers the previous row's hash, so an edited or
 *    removed row breaks the chain and verifyAuditChain() reports where.
 *  - A failed audit write never breaks the user's request, but it is logged loudly to stderr.
 */

export interface AuditEntry {
  actorType: 'user' | 'assistant' | 'anonymous';
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  patientId?: string | null;
  outcome: 'success' | 'denied' | 'failed';
  statusCode?: number | null;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
  at?: Date;
}

const GENESIS = 'GENESIS';
const clip = (v: string | null | undefined, n: number) => (v == null ? null : v.length > n ? v.slice(0, n) : v);

/** What gets hashed. Order and null-handling are part of the format; do not change them casually. */
export function canonical(e: AuditEntry & { at: Date }): string {
  return JSON.stringify([
    e.at.toISOString(), e.actorType, e.actorId ?? null, e.actorEmail ?? null, e.actorRole ?? null,
    e.action, e.resource ?? null, e.resourceId ?? null, e.patientId ?? null, e.outcome,
    e.statusCode ?? null, e.method ?? null, e.path ?? null, e.ip ?? null, e.userAgent ?? null, e.detail ?? null,
  ]);
}

export function computeHash(prevHash: string, entry: AuditEntry & { at: Date }): string {
  return crypto.createHash('sha256').update(prevHash).update('|').update(canonical(entry)).digest('hex');
}

// Writes go through one queue so the chain is built in order.
let tail: Promise<unknown> = Promise.resolve();

export function recordAudit(input: AuditEntry): Promise<void> {
  const entry = {
    ...input,
    at: input.at ?? new Date(),
    actorEmail: clip(input.actorEmail, 254),
    resourceId: clip(input.resourceId, 64),
    patientId: clip(input.patientId, 64),
    path: clip(input.path, 300),
    userAgent: clip(input.userAgent, 200),
    detail: clip(input.detail, 500),
  };
  const run = async () => {
    try {
      const last = await prisma.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const prevHash = last?.hash ?? GENESIS;
      await prisma.auditLog.create({
        data: {
          at: entry.at, actorType: entry.actorType, actorId: entry.actorId ?? null, actorEmail: entry.actorEmail ?? null,
          actorRole: entry.actorRole ?? null, action: entry.action, resource: entry.resource ?? null,
          resourceId: entry.resourceId ?? null, patientId: entry.patientId ?? null, outcome: entry.outcome,
          statusCode: entry.statusCode ?? null, method: entry.method ?? null, path: entry.path ?? null,
          ip: entry.ip ?? null, userAgent: entry.userAgent ?? null, detail: entry.detail ?? null,
          prevHash, hash: computeHash(prevHash, entry),
        },
      });
    } catch (err) {
      console.error('AUDIT WRITE FAILED:', (err as Error).message, JSON.stringify({ action: entry.action, actor: entry.actorId, at: entry.at }));
    }
  };
  const p = tail.then(run, run);
  tail = p;
  return p;
}

/** Resolves when every queued audit write has finished (used by tests and graceful shutdown). */
export function flushAudit(): Promise<void> {
  return tail.then(() => undefined);
}

export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: (req.headers['user-agent'] as string | undefined) ?? null };
}

export interface ChainReport {
  ok: boolean;
  checked: number;
  /** First row where the chain breaks, if any. */
  brokenAtId?: number;
  reason?: string;
}

export async function verifyAuditChain(batch = 1000): Promise<ChainReport> {
  await flushAudit();
  let prev = GENESIS;
  let cursor = 0;
  let checked = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: batch });
    if (rows.length === 0) return { ok: true, checked };
    for (const r of rows) {
      if (r.prevHash !== prev) return { ok: false, checked, brokenAtId: r.id, reason: 'A previous entry was removed or changed (link to the prior entry does not match).' };
      const expected = computeHash(prev, {
        at: r.at, actorType: r.actorType as AuditEntry['actorType'], actorId: r.actorId, actorEmail: r.actorEmail, actorRole: r.actorRole,
        action: r.action, resource: r.resource, resourceId: r.resourceId, patientId: r.patientId, outcome: r.outcome as AuditEntry['outcome'],
        statusCode: r.statusCode, method: r.method, path: r.path, ip: r.ip, userAgent: r.userAgent, detail: r.detail,
      });
      if (r.hash !== expected) return { ok: false, checked, brokenAtId: r.id, reason: 'This entry was modified after it was written.' };
      prev = r.hash;
      checked++;
      cursor = r.id;
    }
  }
}
