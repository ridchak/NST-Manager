import { z } from 'zod';
import prisma from '../lib/prisma';
import { getPracticeData, PatientRef, PracticeData, Slot, Visit, VisitType } from './practiceData';
import {
  EMERGENCY_SCRIPT, classifySideEffects, decideRefill, isOfficeOpen, loadOfficeHours, normalizePhone,
} from './protocol';
import { sendStaffMessage } from './notify';
import { RingCentralService } from './ringcentral';

/**
 * Tool handlers called by the voice-AI platform during a phone call.
 * Every handler returns plain JSON that includes a `say` hint: wording the voice
 * model should convey. Nothing here collects payments.
 */

const MAX_VERIFY_ATTEMPTS = 3;
const SESSION_TTL_MS = 30 * 60 * 1000;

interface CallSession {
  callId: string;
  phone: string;
  attempts: number;
  patient?: PatientRef;
  localPatientId?: string | null;
  nextVisitId?: string;
  expires: number;
}

const sessions = new Map<string, CallSession>();

function frontDesk() {
  return process.env.FRONT_DESK_NUMBER || null;
}

function sweep() {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k);
}

function spoken(d: Date, tz = loadOfficeHours().timezone): string {
  const day = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

const money = (n: number) => `$${n.toFixed(2)}`;

async function logEvent(s: { callId: string; phone?: string; patientId?: string | null; verified?: boolean }, tool: string, outcome: string) {
  const existing = await prisma.callLog.findUnique({ where: { callId: s.callId } });
  const events = existing ? (JSON.parse(existing.events) as any[]) : [];
  events.push({ at: new Date().toISOString(), tool, outcome });
  await prisma.callLog.upsert({
    where: { callId: s.callId },
    create: { callId: s.callId, callerPhone: s.phone ?? null, patientId: s.patientId ?? null, verified: !!s.verified, events: JSON.stringify(events) },
    update: { events: JSON.stringify(events), ...(s.patientId ? { patientId: s.patientId } : {}), ...(s.verified ? { verified: true } : {}) },
  });
}

async function localPatientId(pd: PracticeData, p: PatientRef): Promise<string | null> {
  if (pd.mode === 'local') return p.id;
  const row = await prisma.patient.findFirst({ where: { nexhealthId: p.id }, select: { id: true } });
  return row?.id ?? null;
}

function parseDob(input: string): string | null {
  const t = input.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

class ToolError extends Error {}

function requireVerified(callId: string): CallSession & { patient: PatientRef } {
  sweep();
  const s = sessions.get(callId);
  if (!s?.patient) throw new ToolError('Caller is not verified. Call identify_patient first.');
  s.expires = Date.now() + SESSION_TTL_MS;
  return s as CallSession & { patient: PatientRef };
}

const visitType = z.enum(['new', 'follow-up']);

const schemas = {
  identify_patient: z.object({ callId: z.string().min(1), callerPhone: z.string().min(7), dateOfBirth: z.string(), firstName: z.string().optional() }),
  check_in: z.object({ callId: z.string().min(1) }),
  get_balance: z.object({ callId: z.string().min(1) }),
  get_copay: z.object({ callId: z.string().min(1) }),
  find_slots: z.object({ callId: z.string().min(1), visitType, notBefore: z.string().optional() }),
  book_appointment: z.object({ callId: z.string().min(1), slotId: z.string().min(1), visitType, replaceVisitId: z.string().optional() }),
  request_refill: z.object({ callId: z.string().min(1), medication: z.string().min(1), isGlp1: z.boolean().optional() }),
  report_side_effects: z.object({ callId: z.string().min(1), description: z.string().min(1) }),
  request_prior_auth: z.object({ callId: z.string().min(1), medication: z.string().min(1), details: z.string().optional() }),
  medication_question: z.object({ callId: z.string().min(1), question: z.string().optional() }),
  offer_text_messaging: z.object({ callId: z.string().min(1) }),
} as const;

export type ToolName = keyof typeof schemas;
export const TOOL_NAMES = Object.keys(schemas) as ToolName[];

type Handler<K extends ToolName> = (a: z.infer<(typeof schemas)[K]>, pd: PracticeData, now: Date) => Promise<Record<string, unknown>>;

const handlers: { [K in ToolName]: Handler<K> } = {
  async identify_patient(a, pd) {
    sweep();
    const s = sessions.get(a.callId) ?? { callId: a.callId, phone: a.callerPhone, attempts: 0, expires: Date.now() + SESSION_TTL_MS };
    sessions.set(a.callId, s);
    if (s.attempts >= MAX_VERIFY_ATTEMPTS) {
      await logEvent(s, 'identify_patient', 'locked');
      return { verified: false, action: 'transfer_front_desk', transferNumber: frontDesk(), say: 'I am not able to verify your information. Let me connect you with our front desk.' };
    }
    s.attempts += 1;

    const dob = parseDob(a.dateOfBirth);
    const candidates = dob ? (await pd.findPatientsByPhone(a.callerPhone)).filter(p => p.dob?.slice(0, 10) === dob) : [];
    const narrowed = a.firstName ? candidates.filter(p => p.firstName.toLowerCase() === a.firstName!.toLowerCase()) : candidates;

    if (narrowed.length === 1) {
      s.patient = narrowed[0];
      s.localPatientId = await localPatientId(pd, narrowed[0]);
      await logEvent({ ...s, patientId: s.localPatientId, verified: true }, 'identify_patient', 'verified');
      return { verified: true, firstName: narrowed[0].firstName, say: `Thank you, ${narrowed[0].firstName}. How can I help you today?` };
    }
    if (narrowed.length > 1) {
      await logEvent(s, 'identify_patient', 'ambiguous');
      return { verified: false, needFirstName: true, say: 'I found more than one patient with that information. Can you tell me your first name?' };
    }
    await logEvent(s, 'identify_patient', 'not_verified');
    // Deliberately does not reveal whether the phone number or the date of birth was the part that failed.
    return {
      verified: false,
      attemptsLeft: MAX_VERIFY_ATTEMPTS - s.attempts,
      say: 'I could not match that information. Could you repeat your date of birth, including the year?',
    };
  },

  async check_in(a, pd, now) {
    const s = requireVerified(a.callId);
    const { today } = await pd.getVisits(s.patient, now);
    if (!today) {
      await logEvent(s, 'check_in', 'no_appointment_today');
      return { checkedIn: false, say: 'I do not see an appointment for you today. Would you like me to help schedule one?' };
    }
    await sendStaffMessage({
      type: 'check-in', callId: a.callId, patientId: s.localPatientId,
      subject: `Phone check-in: ${s.patient.firstName} ${s.patient.lastName}`,
      body: `${s.patient.firstName} ${s.patient.lastName} checked in by phone for the ${spoken(today.start)} appointment.`,
    });
    await logEvent(s, 'check_in', 'checked_in');
    return { checkedIn: true, say: `You are checked in for your ${spoken(today.start).split(' at ')[1]} appointment. Please have a seat and we will call you shortly.` };
  },

  async get_balance(a, pd) {
    const s = requireVerified(a.callId);
    const { amount, asOf } = await pd.getBalance(s.patient);
    await logEvent(s, 'get_balance', amount === null ? 'none_on_file' : 'read');
    if (amount === null) {
      return { amount: null, say: 'I do not see a recorded balance on your account. Our staff can confirm the details if you would like.' };
    }
    return {
      amount,
      asOf: asOf?.toISOString(),
      say: `The recorded balance on your account is ${money(amount)}. Please note this may not include very recent payments. I am not able to take payments over the phone; our front desk can help with that.`,
    };
  },

  async get_copay(a, pd) {
    const s = requireVerified(a.callId);
    const copay = await pd.getCopay(s.patient);
    await logEvent(s, 'get_copay', copay === null ? 'none_on_file' : 'read');
    return copay === null
      ? { copay: null, say: 'I do not have a copay recorded for you. Our staff can verify your insurance benefits.' }
      : { copay, say: `Your recorded copay is ${money(copay)}.` };
  },

  async find_slots(a, pd, now) {
    const s = requireVerified(a.callId);
    const from = a.notBefore ? new Date(a.notBefore) : now;
    if (isNaN(from.getTime())) throw new ToolError('notBefore must be an ISO date');
    const slots = await pd.findSlots(s.patient, a.visitType, from < now ? now : from);
    await logEvent(s, 'find_slots', `${slots.length}_slots`);
    if (!slots.length) return { slots: [], say: 'I do not see any openings in the next two weeks. I can send a message to our staff to call you with options.' };
    return {
      slots: slots.map(x => ({ slotId: x.slotId, when: spoken(x.start), provider: x.providerName })),
      say: 'Offer the caller up to three of these times, then call book_appointment with the slotId they choose.',
    };
  },

  async book_appointment(a, pd, now) {
    const s = requireVerified(a.callId);
    let replace: Visit | null = null;
    if (a.replaceVisitId) {
      // Only allow moving the patient's own upcoming appointment.
      const { next } = await pd.getVisits(s.patient, now);
      if (!next || next.id !== a.replaceVisitId) throw new ToolError('That appointment cannot be moved.');
      replace = next;
    }
    let visit: Visit;
    try {
      visit = await pd.book(s.patient, a.slotId, a.visitType);
    } catch (err) {
      await logEvent(s, 'book_appointment', 'failed');
      return { booked: false, say: 'I am sorry, that time is no longer available. Let me look for another one.' };
    }
    if (replace) await pd.cancel(replace.id);
    await logEvent(s, 'book_appointment', replace ? 'moved' : 'booked');
    return { booked: true, when: spoken(visit.start), say: `You are scheduled for ${spoken(visit.start)}. ${replace ? 'I have cancelled your previous appointment. ' : ''}Is there anything else I can help with?` };
  },

  async request_refill(a, pd, now) {
    const s = requireVerified(a.callId);
    const { last, next } = await pd.getVisits(s.patient, now);
    const decision = decideRefill({ now, officeOpen: isOfficeOpen(now, loadOfficeHours()), lastVisit: last?.start, nextAppt: next?.start }, a.isGlp1);
    s.nextVisitId = next?.id;

    if (decision.action === 'send_to_staff' || decision.action === 'queue_after_hours') {
      await sendStaffMessage({
        type: 'refill', callId: a.callId, patientId: s.localPatientId,
        subject: `Refill request: ${s.patient.firstName} ${s.patient.lastName} - ${a.medication}`,
        body: [
          `Refill requested by phone: ${a.medication}.`,
          `Last visit: ${last ? spoken(last.start) : 'none on record'}. Next visit: ${next ? spoken(next.start) : 'none scheduled'}.`,
          a.isGlp1 === undefined ? '' : `GLP-1 confirmed by patient: ${a.isGlp1 ? 'yes' : 'no'}.`,
          decision.action === 'queue_after_hours' ? 'Received after hours.' : `Routing reason: ${decision.reason}.`,
        ].filter(Boolean).join('\n'),
      });
    }
    await logEvent(s, 'request_refill', decision.action);
    return {
      action: decision.action,
      say: decision.say,
      ...(decision.action === 'offer_visit' ? { hasUpcoming: decision.hasUpcoming, upcomingVisitId: next?.id, upcomingVisit: next ? spoken(next.start) : null, nextStep: 'Use find_slots (visitType follow-up) and book_appointment; pass replaceVisitId to move the existing visit sooner.' } : {}),
      // Entering the request into eClinicalWorks is not possible through NexHealth; staff do this from the message.
      ecwRefillCreated: false,
    };
  },

  async report_side_effects(a, pd, now) {
    const s = requireVerified(a.callId);
    const open = isOfficeOpen(now, loadOfficeHours());
    const { level, matched } = classifySideEffects(a.description);
    const name = `${s.patient.firstName} ${s.patient.lastName}`;

    await sendStaffMessage({
      type: 'side-effect', callId: a.callId, patientId: s.localPatientId,
      priority: level === 'mild' ? 'normal' : 'urgent',
      subject: `Side effect report (${level}): ${name}`,
      body: `Reported by phone ${open ? 'during' : 'after'} office hours: "${a.description}"`,
    });
    await logEvent(s, 'report_side_effects', `${level}_${open ? 'open' : 'closed'}`);

    if (level === 'emergency') return { level, action: 'call_911', say: EMERGENCY_SCRIPT };
    if (open) {
      return { level, action: 'staff_notified', say: 'I have sent this to our clinical staff right away and they will follow up. If your symptoms get worse or you feel this is an emergency, call 911.' };
    }
    if (level === 'mild') {
      return { level, action: 'otc_advice', say: `${matched.map(m => m.advice).join(' ')} I have also left a note for our staff. If it gets worse or you feel unwell, call us when we open, or go to urgent care. For an emergency, call 911.` };
    }
    return { level, action: 'schedule_or_urgent_care', say: 'Because of what you describe, I recommend being seen. I can book you an appointment, or if you cannot wait, please go to an urgent care. For an emergency, call 911. I have left a note for our staff.' };
  },

  async request_prior_auth(a, pd) {
    const s = requireVerified(a.callId);
    await sendStaffMessage({
      type: 'prior-auth', callId: a.callId, patientId: s.localPatientId,
      subject: `Prior authorization request: ${s.patient.firstName} ${s.patient.lastName} - ${a.medication}`,
      body: `Patient called about a prior authorization for ${a.medication}.${a.details ? `\nDetails: ${a.details}` : ''}`,
    });
    await logEvent(s, 'request_prior_auth', 'sent');
    return { sent: true, say: 'I have sent your prior authorization request to our staff. They will work on it and contact you with an update.' };
  },

  async medication_question(a, pd, now) {
    const s = requireVerified(a.callId);
    const { last, next } = await pd.getVisits(s.patient, now);
    const providerId = next?.providerId ?? last?.providerId;
    const prescriber = await resolvePrescriber(providerId);
    const open = isOfficeOpen(now, loadOfficeHours());
    // Office hours: desk extension. After hours: cell phone, as requested in the protocol.
    const number = open ? prescriber?.extension ?? prescriber?.cellPhone : prescriber?.cellPhone;

    if (!number) {
      await sendStaffMessage({
        type: 'med-question', callId: a.callId, patientId: s.localPatientId, priority: 'urgent',
        subject: `Medication question: ${s.patient.firstName} ${s.patient.lastName}`,
        body: `Patient asked for medication clarification${a.question ? `: "${a.question}"` : '.'} No prescriber transfer number is configured; please call back.`,
      });
      await logEvent(s, 'medication_question', 'message_no_transfer_number');
      return { action: 'message_sent', say: 'I have sent your question to your prescriber and they will call you back.' };
    }
    await logEvent(s, 'medication_question', `transfer_${open ? 'extension' : 'cell'}`);
    return { action: 'transfer', transferNumber: number, prescriber: prescriber?.name, say: `Let me connect you with ${prescriber?.name ?? 'your prescriber'} now. One moment please.` };
  },

  async offer_text_messaging(a) {
    const s = requireVerified(a.callId);
    const text = `${process.env.CLINIC_NAME || 'Our clinic'}: you can text us at this number for non-urgent questions, refills and scheduling. Please do not text emergencies; call 911.`;
    let sent = false;
    try {
      const res = await new RingCentralService().sendMessage(s.phone, text);
      sent = res?.success !== false;
    } catch (err) {
      console.error('Text offer failed:', (err as Error).message);
    }
    await sendStaffMessage({
      type: 'general', callId: a.callId, patientId: s.localPatientId,
      subject: `Prefers text messaging: ${s.patient.firstName} ${s.patient.lastName}`,
      body: 'Patient reported trouble with voicemail and was offered text-message communication.',
    });
    await logEvent(s, 'offer_text_messaging', sent ? 'sms_sent' : 'sms_not_sent');
    return { smsSent: sent, say: sent ? 'I have just sent you a text message. You can reply to it any time for non-urgent needs, and we will use text to reach you.' : 'I have noted that you prefer text messages, and our staff will reach out that way.' };
  },
};

async function resolvePrescriber(providerId?: string): Promise<{ name: string; extension?: string | null; cellPhone?: string | null } | null> {
  if (providerId) {
    const u = await prisma.user.findUnique({ where: { id: providerId } });
    if (u) return { name: u.name, extension: u.extension, cellPhone: u.cellPhone };
    try {
      const map = JSON.parse(process.env.PRESCRIBER_TRANSFERS || '{}') as Record<string, { name?: string; extension?: string; cell?: string }>;
      const m = map[providerId];
      if (m) return { name: m.name ?? 'your prescriber', extension: m.extension, cellPhone: m.cell };
    } catch { /* ignore malformed config */ }
  }
  const fallback = await prisma.user.findFirst({ where: { role: 'provider', OR: [{ extension: { not: null } }, { cellPhone: { not: null } }] } });
  return fallback ? { name: fallback.name, extension: fallback.extension, cellPhone: fallback.cellPhone } : null;
}

export async function runTool(name: string, rawArgs: unknown, now = new Date()): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!(name in schemas)) return { status: 404, body: { error: `Unknown tool: ${name}` } };
  const key = name as ToolName;
  const parsed = schemas[key].safeParse(rawArgs);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid arguments', details: parsed.error.issues } };
  try {
    const body = await (handlers[key] as Handler<any>)(parsed.data, getPracticeData(), now);
    return { status: 200, body };
  } catch (err) {
    if (err instanceof ToolError) return { status: 200, body: { error: err.message, say: 'I need to verify who I am speaking with first. Can I have your date of birth?' } };
    console.error(`Assistant tool ${name} failed:`, err);
    // Fail safe: never leave the caller stuck.
    return { status: 200, body: { error: 'tool_failed', action: 'transfer_front_desk', transferNumber: frontDesk(), say: 'I am having trouble with that right now. Let me connect you with our front desk.' } };
  }
}

export function resetSessionsForTest() {
  sessions.clear();
}
