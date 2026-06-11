import { cn } from '../../lib/utils';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

const variants: Record<Variant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
};

interface BadgeProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export default function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    scheduled: 'info', confirmed: 'success', completed: 'neutral',
    cancelled: 'danger', 'no-show': 'warning',
    pending: 'warning', approved: 'success', denied: 'danger', expired: 'neutral',
    submitted: 'info', reviewed: 'success',
    Inbound: 'info', Outbound: 'neutral',
  };
  const label: Record<string, string> = {
    'no-show': 'No Show',
  };
  return <Badge variant={map[status] || 'neutral'}>{label[status] || status}</Badge>;
}
