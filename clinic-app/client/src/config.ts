/** The practice's display name. Override at build time with VITE_CLINIC_NAME. */
export const CLINIC_NAME: string = (import.meta.env.VITE_CLINIC_NAME as string | undefined) || 'Premier Weight Management and Lifestyle';
