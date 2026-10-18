/**
 * Clinical call-handling protocol for the phone assistant.
 *
 * Everything here is a pure function (no database, no network) so the rules can be
 * unit-tested and reviewed by the physician in one place. Items marked ASSUMPTION
 * were not specified in the original protocol and should be confirmed.
 */

import { getPractice } from './practice';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Office hours ----------

export interface OfficeHours {
  timezone: string;
  /** 0 = Sunday ... 6 = Saturday; null = closed. Times are "HH:MM" 24h. */
  days: Record<number, [string, string] | null>;
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Parses e.g. "Mon-Fri 09:00-17:00; Sat 09:00-12:00". */
export function parseOfficeHours(spec: string, timezone: string): OfficeHours {
  const days: OfficeHours['days'] = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  for (const part of spec.split(';').map(p => p.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z]{3})(?:-([A-Za-z]{3}))?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!m) throw new Error(`Invalid OFFICE_HOURS segment: "${part}"`);
    const from = DAY_INDEX[m[1].toLowerCase()];
    const to = m[2] ? DAY_INDEX[m[2].toLowerCase()] : from;
    if (from === undefined || to === undefined) throw new Error(`Invalid day in OFFICE_HOURS: "${part}"`);
    for (let d = from; ; d = (d + 1) % 7) {
      days[d] = [m[3].padStart(5, '0'), m[4].padStart(5, '0')];
      if (d === to) break;
    }
  }
  return { timezone, days };
}

/**
 * The practice's current hours. Comes from the saved practice settings; OFFICE_HOURS / OFFICE_TZ in the
 * environment, when set, override them (an emergency switch, and how the tests pin the hours).
 */
export function loadOfficeHours(): OfficeHours {
  const p = getPractice();
  return parseOfficeHours(process.env.OFFICE_HOURS || p.hours, process.env.OFFICE_TZ || p.timezone);
}

const ZONE_NAMES: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona',
  'America/Los_Angeles': 'Pacific', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii',
};

/** "Central time" for a known US zone, otherwise the zone id. */
export function zoneLabel(tz: string): string {
  return ZONE_NAMES[tz] ? `${ZONE_NAMES[tz]} time` : tz;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "08:00" -> "8 AM", "15:30" -> "3:30 PM" */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Serialises per-day hours back into the "Mon 08:00-17:00; ..." form. Closed days are omitted. */
export function hoursToSpec(days: OfficeHours['days']): string {
  return [1, 2, 3, 4, 5, 6, 0]
    .filter(d => days[d])
    .map(d => `${DAY_ABBR[d]} ${days[d]![0]}-${days[d]![1]}`)
    .join('; ');
}

/** Plain-English hours, grouping days that share the same times: "Monday and Thursday 8 AM to 5 PM; ... closed Wednesday and Sunday". */
export function describeHours(hours: OfficeHours): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups = new Map<string, number[]>();
  for (const d of order) {
    const w = hours.days[d];
    if (!w) continue;
    const key = `${clockLabel(w[0])} to ${clockLabel(w[1])}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const join = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);
  const open = [...groups.entries()].map(([times, ds]) => `${join(ds.map(d => DAY_NAMES[d]))} ${times}`);
  const closed = order.filter(d => !hours.days[d]).map(d => DAY_NAMES[d]);
  return `${open.join('; ')}${closed.length ? `; closed ${join(closed)}` : ''}`;
}

/** Wall-clock parts of `date` in the office timezone. */
export function localParts(date: Date, timezone: string): { dow: number; hhmm: string; ymd: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit',
    year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return {
    dow: DAY_INDEX[get('weekday').toLowerCase().slice(0, 3)],
    hhmm: `${get('hour')}:${get('minute')}`,
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export function isOfficeOpen(now: Date, hours: OfficeHours): boolean {
  const { dow, hhmm } = localParts(now, hours.timezone);
  const window = hours.days[dow];
  return !!window && hhmm >= window[0] && hhmm < window[1];
}

// ---------- Symptom triage ----------

const EMERGENCY_PATTERNS: RegExp[] = [
  /chest (pain|pressure|tightness)/i,
  /(trouble|difficulty|hard(?: time)?|short(?:ness)? of)\s*breath/i,
  /can'?t breathe|cannot breathe/i,
  /swelling of (the )?(face|lips|tongue|throat)|throat (closing|swelling)|hives all over|anaphyla/i,
  /faint(ed|ing)|pass(ed)? out|unconscious|unresponsive|seizure/i,
  /vomiting blood|blood in (my )?(vomit|stool)|black,? tarry|coughing (up )?blood/i,
  // GLP-1 class warning: pancreatitis / gallbladder
  /severe (stomach|abdominal|belly) pain|pain (that )?(radiat\w+|goes) to (my )?back|can'?t stop vomiting|vomiting (for|all) (day|night)|yellow(ing)? (of )?(skin|eyes)/i,
  /suicid|kill myself|want to die|hurt myself/i,
  /stroke|face droop|slurred speech|sudden (weakness|numbness|confusion)/i,
  /heart (racing|pounding) .*(dizzy|faint)|irregular heartbeat/i,
  /low blood sugar .*(confus|shak|sweat)|blood sugar (below|under) 54/i,
  /severe dehydration|no urine|haven'?t urinated/i,
];

export function isEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some(p => p.test(text));
}

export interface MildSymptom {
  key: string;
  pattern: RegExp;
  /** ASSUMPTION: physician to review/replace this wording. */
  advice: string;
}

export const MILD_SYMPTOMS: MildSymptom[] = [
  { key: 'nausea', pattern: /nause|queasy|upset stomach/i,
    advice: 'Try smaller, bland meals, sip fluids slowly, and avoid greasy or very sweet foods. An over-the-counter anti-nausea remedy may help; follow the label directions.' },
  { key: 'constipation', pattern: /constipat|hard stool|not (going|pooping)/i,
    advice: 'Increase water and fiber. An over-the-counter stool softener or polyethylene glycol may help; follow the label directions.' },
  { key: 'heartburn', pattern: /heartburn|acid reflux|reflux|indigestion|burping/i,
    advice: 'Avoid late or large meals and stay upright after eating. An over-the-counter antacid may help; follow the label directions.' },
  { key: 'diarrhea', pattern: /diarrhea|loose stool/i,
    advice: 'Drink plenty of fluids, ideally with electrolytes, and keep to bland foods. An over-the-counter anti-diarrheal may help; follow the label directions.' },
  { key: 'headache', pattern: /headache/i,
    advice: 'Hydrate well and rest. An over-the-counter pain reliever may help; follow the label directions.' },
  { key: 'bloating', pattern: /bloat|gas\b|gassy/i,
    advice: 'Eat slowly in smaller portions and limit carbonated drinks. An over-the-counter gas remedy may help; follow the label directions.' },
  { key: 'injection-site', pattern: /injection site|site (is )?(red|sore|itchy)|bruis/i,
    advice: 'A cool compress can help, and rotate injection sites. Call us if the redness spreads or the area becomes hot or swollen.' },
  { key: 'fatigue', pattern: /tired|fatigue|low energy/i,
    advice: 'Make sure you are eating enough protein and drinking enough fluids, and rest as needed.' },
];

/** A symptom report is "mild" only if every thing described matches a known mild symptom and the patient says it is mild. */
export function classifySideEffects(text: string): { level: 'emergency' | 'mild' | 'moderate'; matched: MildSymptom[] } {
  if (isEmergency(text)) return { level: 'emergency', matched: [] };
  const matched = MILD_SYMPTOMS.filter(s => s.pattern.test(text));
  const saysSevere = /severe|worst|unbearable|can'?t (eat|drink|keep)|getting worse|worsening|persistent|for (several|\d+) days/i.test(text);
  if (matched.length > 0 && !saysSevere) return { level: 'mild', matched };
  return { level: 'moderate', matched };
}

// ---------- Refill decision ----------

export const RECENT_VISIT_DAYS = 14;
export const SOON_APPT_DAYS = 21;

export type RefillDecision =
  | { action: 'send_to_staff'; reason: string; say: string }
  | { action: 'ask_glp1'; say: string }
  | { action: 'offer_visit'; hasUpcoming: boolean; say: string }
  | { action: 'queue_after_hours'; say: string };

export interface RefillContext {
  now: Date;
  officeOpen: boolean;
  lastVisit?: Date | null;
  nextAppt?: Date | null;
}

export function decideRefill(ctx: RefillContext, isGlp1?: boolean): RefillDecision {
  // ASSUMPTION: after hours, refill requests are queued for the next business day.
  if (!ctx.officeOpen) {
    return {
      action: 'queue_after_hours',
      say: 'Our office is closed right now. I have recorded your refill request and our staff will review it when we reopen.',
    };
  }

  const sinceLast = ctx.lastVisit ? (ctx.now.getTime() - ctx.lastVisit.getTime()) / DAY_MS : Infinity;
  const untilNext = ctx.nextAppt ? (ctx.nextAppt.getTime() - ctx.now.getTime()) / DAY_MS : Infinity;
  const hasFollowUp = !!ctx.nextAppt && untilNext >= 0;
  const seenRecently = sinceLast <= RECENT_VISIT_DAYS;

  // Seen within 2 weeks and has a follow-up: straight to staff.
  if (seenRecently && hasFollowUp) {
    return {
      action: 'send_to_staff',
      reason: 'seen within 14 days with follow-up scheduled',
      say: 'I have sent your refill request to our staff and they will take care of it. You are all set.',
    };
  }

  // Not seen recently or no follow-up: only matters if the next visit is more than 3 weeks away (or none).
  const nextIsFarOrNone = !hasFollowUp || untilNext > SOON_APPT_DAYS;
  if (!nextIsFarOrNone) {
    // ASSUMPTION: next visit is within 3 weeks, so staff can handle the refill against it.
    return {
      action: 'send_to_staff',
      reason: 'next appointment within 21 days',
      say: 'I have sent your refill request to our staff, and you have a visit coming up soon. They will take care of it.',
    };
  }

  if (isGlp1 === undefined) {
    return { action: 'ask_glp1', say: 'Is this refill for a GLP-1 medication, such as semaglutide or tirzepatide?' };
  }

  if (isGlp1) {
    return {
      action: 'offer_visit',
      hasUpcoming: hasFollowUp,
      say: hasFollowUp
        ? 'For GLP-1 refills we need to see you more regularly. I can book an additional visit sooner, or connect you with our scheduling team to move your current appointment. Which would you prefer?'
        : 'For GLP-1 refills we need to see you regularly, and I do not see an appointment on your chart. Let me schedule one for you now.',
    };
  }

  // ASSUMPTION: non-GLP-1 refills go to staff.
  return {
    action: 'send_to_staff',
    reason: 'non-GLP-1 refill',
    say: 'I have sent your refill request to our staff and they will take care of it.',
  };
}

// ---------- Phone helpers ----------

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export const EMERGENCY_SCRIPT =
  'This could be a medical emergency. Please hang up and call 911 now, or go to the nearest emergency room.';
