import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, TrendingDown,
  FileText, Shield, Phone, Settings, X, Inbox, ScrollText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { CLINIC_NAME } from '../../config';
import Logo from '../Logo';

const nav: Array<{ to: string; label: string; icon: typeof Users; exact?: boolean; superuserOnly?: boolean }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/progress', label: 'Progress', icon: TrendingDown },
  { to: '/forms', label: 'Intake Forms', icon: FileText },
  { to: '/insurance', label: 'Insurance Auth', icon: Shield },
  { to: '/messages', label: 'Messages', icon: Inbox },
  { to: '/phone', label: 'Phone System', icon: Phone },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, superuserOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={cn('fixed inset-y-0 left-0 z-30 w-64 bg-blue-600 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-auto', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="relative px-4 pt-5 pb-4 border-b border-white/15 text-center">
          <Logo reversed className="w-40 mx-auto" />
          <div className="mt-2 text-white font-semibold text-sm leading-snug">{CLINIC_NAME}</div>
          <button onClick={onClose} className="lg:hidden absolute top-3 right-3 p-1 text-blue-100 hover:text-white rounded" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.filter(i => !i.superuserOnly || user?.role === 'superuser').map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onClose}
              className={({ isActive }) =>
                cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-white/20 text-white' : 'text-blue-100 hover:text-white hover:bg-white/10')
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-white/15">
          <div className="text-xs text-blue-200">v1.0.0</div>
        </div>
      </aside>
    </>
  );
}
