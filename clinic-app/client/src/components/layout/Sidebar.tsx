import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, TrendingDown,
  FileText, Shield, Phone, Settings, Activity, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/progress', label: 'Progress', icon: TrendingDown },
  { to: '/forms', label: 'Intake Forms', icon: FileText },
  { to: '/insurance', label: 'Insurance Auth', icon: Shield },
  { to: '/phone', label: 'Phone System', icon: Phone },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={cn('fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-auto', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">LifeStart Clinic</div>
              <div className="text-gray-400 text-xs">Weight Loss Center</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-gray-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onClose}
              className={({ isActive }) =>
                cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800')
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-gray-700">
          <div className="text-xs text-gray-500">v1.0.0 &middot; HIPAA Compliant</div>
        </div>
      </aside>
    </>
  );
}
