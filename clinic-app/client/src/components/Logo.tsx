import { CLINIC_NAME } from '../config';

/**
 * The practice's mark (icon only). Use `reversed` on dark or brand-blue backgrounds.
 * Files live in /public so they can be swapped without touching code.
 */
export default function Logo({ reversed = false, className = '' }: { reversed?: boolean; className?: string }) {
  return <img src={reversed ? '/logo-reversed.svg' : '/logo.svg'} alt={CLINIC_NAME} className={className} draggable={false} />;
}
