import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'h:mm a');
  } catch {
    return dateStr;
  }
}

export function formatPhone(phone?: string | null): string {
  if (!phone) return '—';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function formatWeight(weight?: number | null): string {
  if (weight === undefined || weight === null) return '—';
  return `${weight.toFixed(1)} lbs`;
}

export function formatBP(systolic?: number | null, diastolic?: number | null): string {
  if (!systolic || !diastolic) return '—';
  return `${systolic}/${diastolic} mmHg`;
}

export function calculateBMI(weightLbs: number, heightInches: number): number {
  if (!weightLbs || !heightInches) return 0;
  return (weightLbs / (heightInches * heightInches)) * 703;
}

export function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-600' };
  if (bmi < 25) return { label: 'Normal', color: 'text-green-600' };
  if (bmi < 30) return { label: 'Overweight', color: 'text-yellow-600' };
  if (bmi < 35) return { label: 'Obese I', color: 'text-orange-600' };
  if (bmi < 40) return { label: 'Obese II', color: 'text-red-600' };
  return { label: 'Obese III', color: 'text-red-800' };
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    // Appointments
    scheduled: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800',
    // Auth
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    denied: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
    // Patient
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    archived: 'bg-red-100 text-red-800',
    // Forms
    sent: 'bg-blue-100 text-blue-800',
    // Phone
    inbound: 'bg-green-100 text-green-800',
    outbound: 'bg-blue-100 text-blue-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
}

export function getAppointmentTypeColor(type: string): string {
  const map: Record<string, string> = {
    initial: 'bg-blue-500',
    followup: 'bg-green-500',
    nutrition: 'bg-orange-500',
    procedure: 'bg-purple-500',
    phone: 'bg-gray-500',
  };
  return map[type] ?? 'bg-gray-500';
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function getApptTypeColor(type: string): string {
  const map: Record<string, string> = {
    'initial-consult': '#3b82f6',
    'follow-up': '#22c55e',
    'weigh-in': '#a855f7',
    nutrition: '#f97316',
    procedure: '#ef4444',
    telehealth: '#06b6d4',
  };
  return map[type] || '#6b7280';
}
