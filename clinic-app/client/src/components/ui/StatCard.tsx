import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  iconBg?: string;
}

export default function StatCard({ label, value, change, changeLabel, icon, iconBg = 'bg-blue-100' }: StatCardProps) {
  const positive = change != null && change > 0;
  const negative = change != null && change < 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        {change != null && (
          <div className={cn('flex items-center gap-1 text-sm font-medium', positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-500')}>
            {positive ? <TrendingUp className="w-4 h-4" /> : negative ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            {Math.abs(change)}{changeLabel ?? '%'}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
