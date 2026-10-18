/** The practice's name, used in the consent form, the phone assistant's greeting, and texts. Set CLINIC_NAME to override. */
import { DEFAULT_PRACTICE, getPractice } from '../services/practice';

export const DEFAULT_CLINIC_NAME = DEFAULT_PRACTICE.name;

export function clinicName(): string {
  return process.env.CLINIC_NAME?.trim() || getPractice().name;
}
