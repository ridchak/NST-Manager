import prisma from '../lib/prisma';
import { NexHealthClient, nexConfigFromEnv } from './nexhealth';
import { OfficeHours, isOfficeOpen, loadOfficeHours, normalizePhone } from './protocol';

export type VisitType = 'new' | 'follow-up';

export interface PatientRef {
  id: string;
  firstName: string;
  lastName: string;
  dob?: string; // YYYY-MM-DD
}

export interface Visit {
  id: string;
  start: Date;
  providerId?: string;
  providerName?: string;
}

export interface Slot {
  slotId: string; // opaque; pass back to book()
  start: Date;
  providerId: string;
  providerName: string;
}

export interface PracticeData {
  readonly mode: 'nexhealth' | 'local';
  findPatientsByPhone(phone: string): Promise<PatientRef[]>;
  getBalance(p: PatientRef): Promise<{ amount: number | null; asOf?: Date }>;
  getCopay(p: PatientRef): Promise<number | null>;
  getVisits(p: PatientRef, now: Date): Promise<{ last: Visit | null; next: Visit | null; today: Visit | null }>;
  findSlots(p: PatientRef, type: VisitType, from: Date, maxSlots?: number): Promise<Slot[]>;
  book(p: PatientRef, slotId: string, type: VisitType): Promise<Visit>;
  cancel(visitId: string): Promise<void>;
}

const SLOT_STEP_MIN = 30;
const VISIT_MINUTES: Record<VisitType, number> = { new: 60, 'follow-up': 30 };

/** Spread results: at most `perDay` earliest slots on each day, across the first days that have any. */
function spread(slots: Slot[], hours: OfficeHours, perDay = 2, maxSlots = 6): Slot[] {
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = s.start.toLocaleDateString('en-CA', { timeZone: hours.timezone });
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  return [...byDay.values()].flatMap(d => d.slice(0, perDay)).slice(0, maxSlots);
}

// ---------- Local database implementation (used when NexHealth is not configured) ----------

export class LocalPracticeData implements PracticeData {
  readonly mode = 'local' as const;
  constructor(private hours: OfficeHours = loadOfficeHours()) {}

  async findPatientsByPhone(phone: string): Promise<PatientRef[]> {
    const target = normalizePhone(phone);
    if (!target) return [];
    const rows = await prisma.patient.findMany({ where: { phone: { not: null } } });
    return rows
      .filter(r => normalizePhone(r.phone!) === target)
      .map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, dob: r.dob.toISOString().slice(0, 10) }));
  }

  async getBalance(p: PatientRef) {
    const r = await prisma.patient.findUnique({ where: { id: p.id }, select: { balance: true, balanceUpdatedAt: true } });
    return { amount: r?.balance ?? null, asOf: r?.balanceUpdatedAt ?? undefined };
  }

  async getCopay(p: PatientRef) {
    const ins = await prisma.insuranceInfo.findFirst({ where: { patientId: p.id }, orderBy: { isPrimary: 'desc' } });
    return ins?.copay ?? null;
  }

  async getVisits(p: PatientRef, now: Date) {
    const appts = await prisma.appointment.findMany({
      where: { patientId: p.id, status: { notIn: ['cancelled', 'no-show'] } },
      include: { provider: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const toVisit = (a: (typeof appts)[number]): Visit => ({ id: a.id, start: a.date, providerId: a.providerId, providerName: a.provider.name });
    const past = appts.filter(a => a.date <= now && a.status === 'completed');
    const future = appts.filter(a => a.date > now);
    const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: this.hours.timezone });
    const today = appts.find(a => dayKey(a.date) === dayKey(now) && a.status !== 'completed');
    return {
      last: past.length ? toVisit(past[past.length - 1]) : null,
      next: future.length ? toVisit(future[0]) : null,
      today: today ? toVisit(today) : null,
    };
  }

  async findSlots(_p: PatientRef, type: VisitType, from: Date, maxSlots = 6) {
    const providers = await prisma.user.findMany({ where: { role: 'provider' }, orderBy: { name: 'asc' } });
    if (!providers.length) return [];
    const windowEnd = new Date(from.getTime() + 14 * 86400000);
    const busy = await prisma.appointment.findMany({
      where: { status: { notIn: ['cancelled'] }, date: { gte: new Date(from.getTime() - 86400000), lte: windowEnd } },
    });
    const length = VISIT_MINUTES[type];
    const stepMs = SLOT_STEP_MIN * 60000;
    const out: Slot[] = [];
    // Walk forward in 30-minute steps from the next half hour; keep steps inside office hours.
    for (let t = Math.ceil((from.getTime() + 60 * 60000) / stepMs) * stepMs; t < windowEnd.getTime(); t += stepMs) {
      const start = new Date(t);
      const end = new Date(t + length * 60000);
      if (!isOfficeOpen(start, this.hours) || !isOfficeOpen(new Date(end.getTime() - 1), this.hours)) continue;
      for (const prov of providers) {
        const clash = busy.some(a => a.providerId === prov.id && a.date < end && new Date(a.date.getTime() + a.duration * 60000) > start);
        if (!clash) {
          out.push({ slotId: `${prov.id}|${start.toISOString()}`, start, providerId: prov.id, providerName: prov.name });
          break; // one provider per time is enough to offer
        }
      }
    }
    return spread(out, this.hours, 2, maxSlots);
  }

  async book(p: PatientRef, slotId: string, type: VisitType): Promise<Visit> {
    const [providerId, iso] = slotId.split('|');
    const start = new Date(iso);
    if (!providerId || isNaN(start.getTime())) throw new Error('Invalid slot');
    const duration = VISIT_MINUTES[type];
    const end = new Date(start.getTime() + duration * 60000);
    const near = await prisma.appointment.findMany({
      where: { providerId, status: { not: 'cancelled' }, date: { gte: new Date(start.getTime() - 8 * 3600000), lt: end } },
    });
    if (near.some(a => new Date(a.date.getTime() + a.duration * 60000) > start)) throw new Error('That time was just taken');
    const appt = await prisma.appointment.create({
      data: { patientId: p.id, providerId, date: start, duration, type: type === 'new' ? 'initial-consult' : 'follow-up', status: 'scheduled', reason: 'Booked by phone assistant' },
      include: { provider: { select: { name: true } } },
    });
    return { id: appt.id, start: appt.date, providerId, providerName: appt.provider.name };
  }

  async cancel(visitId: string) {
    await prisma.appointment.update({ where: { id: visitId }, data: { status: 'cancelled' } });
  }
}

// ---------- NexHealth implementation ----------

export class NexHealthPracticeData implements PracticeData {
  readonly mode = 'nexhealth' as const;
  constructor(private client: NexHealthClient, private hours: OfficeHours = loadOfficeHours()) {}

  async findPatientsByPhone(phone: string): Promise<PatientRef[]> {
    const target = normalizePhone(phone);
    const rows = await this.client.searchPatientsByPhone(target);
    // Re-check locally so a loose server-side match can never identify the wrong person.
    return rows
      .filter(r => [r.bio?.phone_number, r.bio?.cell_phone_number, r.bio?.home_phone_number].some(n => n && normalizePhone(n) === target))
      .map(r => ({ id: String(r.id), firstName: r.first_name, lastName: r.last_name, dob: r.bio?.date_of_birth }));
  }

  async getBalance(p: PatientRef) {
    const row = await this.client.getPatient(p.id);
    const raw = row.balance?.amount;
    const amount = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    return { amount: amount !== null && Number.isFinite(amount) ? amount : null, asOf: row.updated_at ? new Date(row.updated_at) : undefined };
  }

  /** NexHealth does not reliably expose copays, so they are kept on the matching local record. */
  async getCopay(p: PatientRef) {
    const local = await prisma.patient.findFirst({ where: { nexhealthId: p.id }, select: { id: true } });
    if (!local) return null;
    const ins = await prisma.insuranceInfo.findFirst({ where: { patientId: local.id }, orderBy: { isPrimary: 'desc' } });
    return ins?.copay ?? null;
  }

  async getVisits(p: PatientRef, now: Date) {
    const start = new Date(now.getTime() - 400 * 86400000);
    const end = new Date(now.getTime() + 400 * 86400000);
    const appts = (await this.client.listAppointments(p.id, start, end)).filter(a => !a.cancelled);
    const toVisit = (a: (typeof appts)[number]): Visit => ({ id: String(a.id), start: new Date(a.start_time), providerId: String(a.provider_id), providerName: a.provider_name });
    const sorted = appts.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
    const past = sorted.filter(a => new Date(a.start_time) <= now);
    const future = sorted.filter(a => new Date(a.start_time) > now);
    const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: this.hours.timezone });
    const today = sorted.find(a => dayKey(new Date(a.start_time)) === dayKey(now));
    // NOTE: a past scheduled appointment counts as a visit only if NexHealth/eCW marks it kept;
    // confirm how your sync reports completed visits and tighten this filter if needed.
    return {
      last: past.length ? toVisit(past[past.length - 1]) : null,
      next: future.length ? toVisit(future[0]) : null,
      today: today ? toVisit(today) : null,
    };
  }

  async findSlots(_p: PatientRef, type: VisitType, from: Date, maxSlots = 6) {
    const cfg = this.client.config;
    if (!cfg.providerIds.length) throw new Error('NEXHEALTH_PROVIDER_IDS is not configured');
    const apptType = type === 'new' ? cfg.appointmentTypeNew : cfg.appointmentTypeFollowUp;
    const groups = await this.client.appointmentSlots({
      startDate: from.toLocaleDateString('en-CA', { timeZone: this.hours.timezone }),
      days: 14,
      providerIds: cfg.providerIds,
      appointmentTypeId: apptType,
    });
    const all: Slot[] = groups.flatMap(g =>
      g.slots.map(s => ({
        slotId: `${g.pid}|${s.time}|${s.operatory_id ?? g.operatory_id ?? ''}`,
        start: new Date(s.time),
        providerId: String(g.pid),
        providerName: `Provider ${g.pid}`,
      })),
    );
    all.sort((a, b) => +a.start - +b.start);
    const future = all.filter(s => s.start.getTime() > from.getTime() + 60 * 60000);
    return spread(future, this.hours, 2, maxSlots);
  }

  async book(p: PatientRef, slotId: string, type: VisitType): Promise<Visit> {
    const [providerId, startTime, operatoryId] = slotId.split('|');
    const cfg = this.client.config;
    const appt = await this.client.bookAppointment({
      patientId: p.id,
      providerId,
      startTime,
      operatoryId: operatoryId || undefined,
      appointmentTypeId: type === 'new' ? cfg.appointmentTypeNew : cfg.appointmentTypeFollowUp,
      note: 'Booked by phone assistant',
    });
    return { id: String(appt.id), start: new Date(appt.start_time ?? startTime), providerId };
  }

  async cancel(visitId: string) {
    await this.client.cancelAppointment(visitId);
  }
}

let cached: PracticeData | null = null;
export function getPracticeData(): PracticeData {
  if (cached) return cached;
  const cfg = nexConfigFromEnv();
  cached = cfg ? new NexHealthPracticeData(new NexHealthClient(cfg)) : new LocalPracticeData();
  return cached;
}
