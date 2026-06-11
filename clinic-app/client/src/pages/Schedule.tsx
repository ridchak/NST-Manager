import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addHours } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { appointmentsApi, patientsApi } from '../lib/api';
import { getApptTypeColor, fullName } from '../lib/utils';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/Badge';
import type { Appointment } from '../types';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

const APPT_TYPES = ['initial-consult', 'follow-up', 'weigh-in', 'nutrition', 'procedure', 'telehealth'];
const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function Schedule() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [range, setRange] = useState<{ start: Date; end: Date }>({
    start: new Date(new Date().setDate(1)),
    end: new Date(new Date().setMonth(new Date().getMonth() + 1, 0)),
  });

  const { data } = useQuery({
    queryKey: ['appointments', 'calendar', range.start.toISOString(), range.end.toISOString()],
    queryFn: () => appointmentsApi.list({
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      limit: 200,
    }),
  });

  const { data: patients } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.list({ limit: 200 }),
  });

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => import('../lib/api').then(m => m.authApi.getMe()),
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<any>({
    defaultValues: { duration: 30, type: 'follow-up', status: 'scheduled' },
  });

  const createMutation = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); setShowNew(false); reset(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => appointmentsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); setSelected(null); },
  });

  const events = (data?.appointments ?? []).map((a: Appointment) => ({
    id: a.id,
    title: `${a.patient ? fullName(a.patient) : ''} — ${a.type.replace(/-/g, ' ')}`,
    start: new Date(a.date),
    end: addHours(new Date(a.date), a.duration / 60),
    resource: a,
  }));

  const eventStyle = useCallback((event: any) => ({
    style: {
      backgroundColor: getApptTypeColor(event.resource.type),
      borderRadius: '4px',
      border: 'none',
      fontSize: '12px',
      opacity: event.resource.status === 'cancelled' ? 0.5 : 1,
    },
  }), []);

  const onRangeChange = useCallback((r: any) => {
    if (Array.isArray(r)) {
      setRange({ start: r[0], end: r[r.length - 1] });
    } else {
      setRange({ start: r.start, end: r.end });
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNew(true)}>New Appointment</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" style={{ height: 680 }}>
        <Calendar
          localizer={localizer}
          events={events}
          defaultView={Views.WEEK}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          onRangeChange={onRangeChange}
          onSelectEvent={(e: any) => setSelected(e.resource)}
          eventPropGetter={eventStyle}
          step={15}
          timeslots={4}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        {APPT_TYPES.map(t => (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApptTypeColor(t) }} />
            {t.replace(/-/g, ' ')}
          </div>
        ))}
      </div>

      {/* New Appointment Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); reset(); }} title="New Appointment" size="md">
        <form onSubmit={handleSubmit(d => createMutation.mutate({ ...d, date: new Date(d.date).toISOString(), duration: Number(d.duration) }))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
            <select {...register('patientId', { required: true })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select patient...</option>
              {(patients?.patients ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{fullName(p)} — {p.mrn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
            <input {...register('providerId', { required: true })} placeholder="Provider ID" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time *</label>
              <input type="datetime-local" {...register('date', { required: true })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <select {...register('duration')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select {...register('type')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {APPT_TYPES.map(t => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select {...register('status')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['scheduled', 'confirmed'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for visit</label>
            <textarea {...register('reason')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => { setShowNew(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Book Appointment</Button>
          </div>
        </form>
      </Modal>

      {/* Appointment Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Appointment Details" size="md">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Patient:</span><div className="font-medium">{selected.patient ? fullName(selected.patient) : '—'}</div></div>
              <div><span className="text-gray-500">MRN:</span><div className="font-medium font-mono">{selected.patient?.mrn}</div></div>
              <div><span className="text-gray-500">Date/Time:</span><div className="font-medium">{format(new Date(selected.date), 'MMM d, yyyy h:mm a')}</div></div>
              <div><span className="text-gray-500">Duration:</span><div className="font-medium">{selected.duration} min</div></div>
              <div><span className="text-gray-500">Type:</span><div className="font-medium capitalize">{selected.type.replace(/-/g, ' ')}</div></div>
              <div><span className="text-gray-500">Status:</span><StatusBadge status={selected.status} /></div>
            </div>
            {selected.reason && <div className="text-sm"><span className="text-gray-500">Reason:</span><p className="mt-1">{selected.reason}</p></div>}
          </div>
          <div className="flex justify-between mt-6">
            <Button variant="danger" size="sm" onClick={() => updateMutation.mutate({ id: selected.id, data: { status: 'cancelled' } })}>Cancel Appt</Button>
            <div className="flex gap-2">
              {selected.status === 'scheduled' && (
                <Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ id: selected.id, data: { status: 'confirmed' } })}>Confirm</Button>
              )}
              {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                <Button size="sm" onClick={() => updateMutation.mutate({ id: selected.id, data: { status: 'completed' } })}>Mark Complete</Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
