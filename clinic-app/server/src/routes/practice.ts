import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { digits10, formatPhone } from '../lib/phone';
import { PracticeInfo, getPractice, isUsingDefaults, savePractice } from '../services/practice';
import { describeHours, hoursToSpec, parseOfficeHours } from '../services/protocol';

/** Practice details. Anyone signed in can read them; only a superuser can change them (see services/access.ts). */
const router = Router();

function present(p: PracticeInfo) {
  const hours = parseOfficeHours(p.hours, p.timezone);
  return {
    ...p,
    phoneDisplay: formatPhone(p.phone),
    faxDisplay: p.fax ? formatPhone(p.fax) : null,
    addressLine: `${p.street}${p.suite ? `, ${p.suite}` : ''}, ${p.city}, ${p.state} ${p.zip}`,
    hoursByDay: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, hours.days[d]])) as Record<string, [string, string] | null>,
    hoursText: describeHours(hours),
    isDefault: isUsingDefaults(),
    // OFFICE_HOURS / OFFICE_TZ in the server environment take precedence over what is saved here.
    overriddenByEnvironment: !!(process.env.OFFICE_HOURS || process.env.OFFICE_TZ),
  };
}

router.get('/', (_req: Request, res: Response) => {
  res.json(present(getPractice()));
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour times like 08:00');
const validTimezone = (tz: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(120),
  suite: z.string().trim().max(40).nullable().optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().length(2).transform(s => s.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}$/, 'ZIP code must be 5 digits'),
  phone: z.string().refine(v => digits10(v) !== null, 'Enter a valid 10-digit phone number'),
  fax: z.string().nullable().optional().refine(v => !v || digits10(v) !== null, 'Enter a valid 10-digit fax number'),
  timezone: z.string().refine(validTimezone, 'Unknown time zone'),
  // keys "0".."6" (Sunday..Saturday); null = closed
  hours: z.record(z.string().regex(/^[0-6]$/), z.tuple([hhmm, hhmm]).nullable()),
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const body = updateSchema.parse(req.body);
    const days: Record<number, [string, string] | null> = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    for (const [k, v] of Object.entries(body.hours)) {
      if (v && v[0] >= v[1]) return res.status(400).json({ error: `Closing time must be after opening time (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(k)]}).` });
      days[Number(k)] = v;
    }
    if (!Object.values(days).some(Boolean)) return res.status(400).json({ error: 'At least one day must be open.' });
    const info: PracticeInfo = {
      name: body.name, street: body.street, suite: body.suite || null, city: body.city, state: body.state, zip: body.zip,
      phone: digits10(body.phone)!, fax: body.fax ? digits10(body.fax) : null, timezone: body.timezone,
      hours: hoursToSpec(days),
    };
    await savePractice(info);
    res.locals.auditDetail = 'practice details updated';
    res.json(present(getPractice()));
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors.map((e: any) => e.message).join('; ') });
    res.status(500).json({ error: 'Failed to save practice details' });
  }
});

export default router;
