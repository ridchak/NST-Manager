import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as BigCalendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { appointmentsApi, patientsApi } from '../lib/api';
import { getAppointmentTypeColor, cn } from '../lib/utils';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/Badge';
import type { Appointment } from '../types';

const localizer = momentLocalizer(moment);

const apptSchema = z.object({
  patientId: z.string().min(1, 'Patient required'),
  startTime: z.string().min(1, 'Start time required'),
  endTime: z.string().min(1, 'End time required'),
  type: z.enum(['initial', 'followup', 'nutrition', 'procedure', 'phone']),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).default('scheduled'),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

type ApptForm = z.infer<typeof apptSchema>;

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Appointment;
}

function typeColorStyle(type: string): React.CSSProperties {
  const colors: Record<string, string> = {
    initial: '#2563eb',
    followup: '#16a34a',
    nutrition: '#ea580c',
    procedure: '#7c3aed',
    phone: '#6b7280',
  };
  return { backgroundColor: colors[type] ?? '#6b7280', border: 'none' };
}

export default function Schedule() {
  const qc = useQueryClient();
  const [view, setView] = useState<string>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: apptData, isLoading } = useQuery({
    queryKey: ['appointments', 'all'],
    queryFn: () => appointmentsApi.list({ limit: 200 }),
  });

  const { data: patientsData } = useQuery({
    queryKey: ['patients', 'dropdown'],
    queryFn: () => patientsApi.list({ limit: 200 }),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ApptForm>({
    resolver: zodResolver(apptSchema),
    defaultValues: { type: 'followup', status: 'scheduled' },
  });

  const createMutation = useMutation({
    mutationFn: (d: ApptForm) => appointmentsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setModalOpen(false);
      reset();
    },
  });

  const events: CalendarEvent[] = (apptData?.data ?? []).map(a => ({
    id: a.id,
    title: `${a.patient?.firstName ?? ''} ${a.patient?.lastName ?? ''} — ${a.type}`,
    start: new Date(a.startTime),
    end: new Date(a.endTime),
    resource: a,
  }));

  function handleSelectEvent(event: CalendarEvent) {
    setSelectedAppt(event.resource);
    setDetailOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New Appointment
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { type: 'initial', label: 'Initial', color: '#2563eb' },
          { type: 'followup', label: 'Follow-up', color: '#16a34a' },
          { type: 'nutrition', label: 'Nutrition', color: '#ea580c' },
          { type: 'procedure', label: 'Procedure', color: '#7c3aed' },
          { type: 'phone', label: 'Phone', color: '#6b7280' },
        ].map(({ type, label, color }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      <Card padding={false} className="overflow-hidden">
        {isLoading ? (
          <div className="h-[600px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="p-4" style={{ height: '680px' }}>
            <BigCalendar
              localizer={localizer}
              events={events}
              view={view as Parameters<typeof BigCalendar>[0]['view']}
              onView={v => setView(v)}
              date={date}
              onNavigate={d => setDate(d)}
              onSelectEvent={handleSelectEvent}
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              eventPropGetter={event => ({
                style: typeColorStyle(event.resource.type),
              })}
              popup
              step={30}
              timeslots={2}
            />
          </div>
        )}
      </Card>

      {/* New Appointment Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset(); }} title="New Appointment" size="lg">
        <form onSubmit={handleSubmit(d => createMutation.mutateAsync(d))} className="space-y-4">
          {createMutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Failed to create appointment. Please try again.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
            <select
              {...register('patientId')}
              className={cn('w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
                errors.patientId ? 'border-red-300' : 'border-gray-300')}
            >
              <option value="">Select a patient...</option>
              {(patientsData?.data ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName} — {p.mrn}</option>
              ))}
            </select>
            {errors.patientId && <p className="mt-1 text-xs text-red-600">{errors.patientId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input type="datetime-local" {...register('startTime')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {errors.startTime && <p className="mt-1 text-xs text-red-600">{errors.startTime.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input type="datetime-local" {...register('endTime')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {errors.endTime && <p className="mt-1 text-xs text-red-600">{errors.endTime.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select {...register('type')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="initial">Initial Visit</option>
                <option value="followup">Follow-up</option>
                <option value="nutrition">Nutrition Consult</option>
                <option value="procedure">Procedure</option>
                <option value="phone">Phone Visit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select {...register('status')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input {...register('reason')} placeholder="Reason for visit..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea {...register('notes')} rows={2} placeholder="Additional notes..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); reset(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {isSubmitting && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Appointment
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      {selectedAppt && (
        <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Appointment Details">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 font-bold text-sm">
                {selectedAppt.patient?.firstName?.[0]}{selectedAppt.patient?.lastName?.[0]}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {selectedAppt.patient?.firstName} {selectedAppt.patient?.lastName}
                </p>
                <p className="text-sm text-gray-500">MRN: {selectedAppt.patient?.mrn}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
              <div>
                <p className="text-xs text-gray-500">Type</p>
                <StatusBadge status={selectedAppt.type} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <StatusBadge status={selectedAppt.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Start</p>
                <p className="text-sm font-medium">{moment(selectedAppt.startTime).format('MMM D, YYYY h:mm A')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">End</p>
                <p className="text-sm font-medium">{moment(selectedAppt.endTime).format('h:mm A')}</p>
              </div>
            </div>
            {selectedAppt.reason && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Reason</p>
                <p className="text-sm text-gray-800">{selectedAppt.reason}</p>
              </div>
            )}
            {selectedAppt.notes && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-800">{selectedAppt.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
