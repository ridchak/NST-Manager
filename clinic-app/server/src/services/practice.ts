import prisma from '../lib/prisma';

/**
 * The practice's own details (name, address, phone, fax, time zone, hours).
 *
 * Stored in one database row that a superuser edits in Settings. Until that row exists the defaults
 * below apply. The values are read synchronously from a small in-memory copy that is refreshed at
 * start-up and whenever the settings are saved.
 */

export interface PracticeInfo {
  name: string;
  street: string;
  suite: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string; // 10 digits
  fax: string | null; // 10 digits
  timezone: string; // IANA
  /** "Mon 08:00-17:00; Tue 08:00-16:00; ..." Days not listed are closed. */
  hours: string;
  /** Office extensions the phone assistant transfers to during office hours. */
  extFrontDesk: string | null;
  extScheduling: string | null;
  extMedications: string | null;
  extBilling: string | null;
  /** Where new-request notifications are emailed. No clinical detail is ever included. */
  notificationEmail: string | null;
}

export const DEFAULT_PRACTICE: PracticeInfo = {
  name: 'Premier Weight Management and Lifestyle',
  street: '2340 S Highland Ave',
  suite: 'Ste 370',
  city: 'Lombard',
  state: 'IL',
  zip: '60148',
  phone: '6304451022',
  fax: '6305597377',
  timezone: 'America/Chicago',
  // Mon & Thu 8-5, Tue & Fri 8-4, Sat 9-3. Wednesday and Sunday closed.
  hours: 'Mon 08:00-17:00; Tue 08:00-16:00; Thu 08:00-17:00; Fri 08:00-16:00; Sat 09:00-15:00',
  extFrontDesk: '101',
  extScheduling: '102',
  extMedications: '103',
  extBilling: '104',
  notificationEmail: null, // set in Settings > Practice; kept out of the code
};

let current: PracticeInfo = { ...DEFAULT_PRACTICE };
let usingDefaults = true;

export function getPractice(): PracticeInfo {
  return current;
}

export function isUsingDefaults(): boolean {
  return usingDefaults;
}

/** Loads the saved settings (if any) into memory. Safe to call again after a save. */
export async function refreshPractice(): Promise<void> {
  try {
    const row = await prisma.practiceSettings.findUnique({ where: { id: 1 } });
    if (row) {
      current = { name: row.name, street: row.street, suite: row.suite, city: row.city, state: row.state, zip: row.zip, phone: row.phone, fax: row.fax, timezone: row.timezone, hours: row.hours,
        extFrontDesk: row.extFrontDesk, extScheduling: row.extScheduling, extMedications: row.extMedications, extBilling: row.extBilling,
        notificationEmail: row.notificationEmail };
      usingDefaults = false;
    } else {
      current = { ...DEFAULT_PRACTICE };
      usingDefaults = true;
    }
  } catch (err) {
    console.error('Could not load practice settings, using built-in defaults:', (err as Error).message);
  }
}

export async function savePractice(info: PracticeInfo): Promise<void> {
  await prisma.practiceSettings.upsert({ where: { id: 1 }, create: { id: 1, ...info }, update: info });
  await refreshPractice();
}
