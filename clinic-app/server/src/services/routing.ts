import { PracticeInfo } from './practice';

/**
 * Where a call goes when the caller needs a person.
 *
 *   front_desk   general questions, anything not listed below, verification trouble
 *   scheduling   new-patient appointments, a sooner appointment than the open times offered,
 *                rescheduling, or seeing a different provider than the one booked
 *   medications  medication questions and prior authorizations
 *   billing      billing questions (the assistant only reads the recorded balance and copay)
 *
 * During office hours the call is transferred to the department's extension. After hours nobody is there
 * to take it, so a message is recorded for a call back.
 */

export const DEPARTMENTS = ['front_desk', 'scheduling', 'medications', 'billing'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  front_desk: 'the front desk',
  scheduling: 'our scheduling team',
  medications: 'our medication and prior authorization team',
  billing: 'our billing team',
};

export function extensionFor(dept: Department, p: Pick<PracticeInfo, 'extFrontDesk' | 'extScheduling' | 'extMedications' | 'extBilling'>): string | null {
  return {
    front_desk: p.extFrontDesk,
    scheduling: p.extScheduling,
    medications: p.extMedications,
    billing: p.extBilling,
  }[dept] ?? null;
}

export type TransferDecision =
  | { action: 'transfer'; department: Department; transferNumber: string; transferType: 'extension'; say: string }
  | { action: 'message_taken'; department: Department; say: string };

export function decideTransfer(
  dept: Department,
  officeOpen: boolean,
  practice: Pick<PracticeInfo, 'extFrontDesk' | 'extScheduling' | 'extMedications' | 'extBilling'>,
): TransferDecision {
  const ext = extensionFor(dept, practice);
  if (officeOpen && ext) {
    return { action: 'transfer', department: dept, transferNumber: ext, transferType: 'extension', say: `Let me connect you with ${DEPARTMENT_LABELS[dept]}. One moment please.` };
  }
  return {
    action: 'message_taken',
    department: dept,
    say: officeOpen
      ? `I am not able to connect you right now, but I have left a message for ${DEPARTMENT_LABELS[dept]} to call you back.`
      : `Our office is closed right now. I have left a message for ${DEPARTMENT_LABELS[dept]} and someone will call you back when we reopen.`,
  };
}
