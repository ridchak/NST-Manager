/** The practice's name, used in the consent form, the phone assistant's greeting, and texts. Set CLINIC_NAME to override. */
export const DEFAULT_CLINIC_NAME = 'Premier Weight Management and Lifestyle';

export function clinicName(): string {
  return process.env.CLINIC_NAME?.trim() || DEFAULT_CLINIC_NAME;
}
