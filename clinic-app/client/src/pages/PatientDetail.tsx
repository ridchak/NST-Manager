import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, User, Calendar, TrendingDown,
  FileText, Shield, Phone, Plus, Edit2
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { patientsApi, progressApi, appointmentsApi, formsApi } from '../lib/api';
import {
  formatDate, formatPhone, formatWeight, formatBP,
  calculateBMI, getBMICategory, cn
} from '../lib/utils';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { ProgressEntry } from '../types';

const tabs = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'progress', label: 'Progress', icon: TrendingDown },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'forms', label: 'Forms', icon: FileText },
  { id: 'insurance', label: 'Insurance', icon: Shield },
];

const progressSchema = z.object({
  date: z.string().min(1, 'Required'),
  weight: z.coerce.number().positive().optional(),
  bloodPressureSystolic: z.coerce.number().optional(),
  bloodPressureDiastolic: z.coerce.number().optional(),
  heartRate: z.coerce.number().optional(),
  waistCircumference: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type ProgressForm = z.infer<typeof progressSchema>;

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right">{value || '—'}</span>
    </div>
  );
}

function InputField({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        {...props}
        className={cn(
          'w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
          error ? 'border-red-300' : 'border-gray-300'
        )}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [addProgressOpen, setAddProgressOpen] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  const { data: chartData } = useQuery({
    queryKey: ['progress', 'chart', id],
    queryFn: () => progressApi.getChart(id!),
    enabled: !!id && activeTab === 'progress',
  });

  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['progress', id],
    queryFn: () => progressApi.list({ patientId: id, limit: 50 }),
    enabled: !!id && activeTab === 'progress',
  });

  const { data: appointmentsData, isLoading: apptsLoading } = useQuery({
    queryKey: ['appointments', id],
    queryFn: () => appointmentsApi.list({ patientId: id }),
    enabled: !!id && activeTab === 'appointments',
  });

  const { data: formsData, isLoading: formsLoading } = useQuery({
    queryKey: ['forms', id],
    queryFn: () => formsApi.list({ patientId: id }),
    enabled: !!id && activeTab === 'forms',
  });


  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProgressForm>({
    resolver: zodResolver(progressSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0] },
  });

  const addProgressMutation = useMutation({
    mutationFn: (d: ProgressForm) => progressApi.create({ ...d, patientId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress'] });
      setAddProgressOpen(false);
      reset({ date: new Date().toISOString().split('T')[0] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Patient not found.</p>
        <button onClick={() => navigate('/patients')} className="mt-2 text-blue-600 text-sm">
          ← Back to patients
        </button>
      </div>
    );
  }

  // Use already-loaded progressEntries from the patient object for the header,
  // fall back to the lazy progress query once the tab has been visited.
  const latestProgress = progressData?.data?.[0] ?? patient?.progressEntries?.[0];
  const bmiValue = latestProgress?.bmi ?? 0;
  const bmiInfo = getBMICategory(bmiValue);
  const chartPoints = (chartData ?? []).map(e => ({
    date: format(parseISO(e.date), 'MMM d'),
    weight: e.weight,
    bmi: e.bmi,
  }));

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate('/patients')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Patients
      </button>

      {/* Sticky patient header */}
      <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {patient.firstName[0]}{patient.lastName[0]}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{patient.firstName} {patient.lastName}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-blue-100 text-sm">
              <span>MRN: <span className="font-mono font-semibold text-white">{patient.mrn}</span></span>
              <span>DOB: {formatDate(patient.dob)}</span>
              <span>Phone: {formatPhone(patient.phone)}</span>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-blue-200 text-xs">Weight</p>
              <p className="text-white font-bold text-lg">{formatWeight(latestProgress?.weight)}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs">BMI</p>
              <p className="text-white font-bold text-lg">{bmiValue ? bmiValue.toFixed(1) : '—'}</p>
              {bmiValue > 0 && <p className="text-blue-200 text-xs">{bmiInfo.label}</p>}
            </div>
            <div>
              <p className="text-blue-200 text-xs">Status</p>
              <p className="text-white font-bold text-lg capitalize">{patient.status}</p>
            </div>
          </div>
          <button className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors self-start">
            <Edit2 className="w-4 h-4 text-white" />
          </button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader className=""><h3 className="font-semibold text-gray-900">Demographics</h3></CardHeader>
            <CardBody>
              <InfoRow label="Full Name" value={`${patient.firstName} ${patient.lastName}`} />
              <InfoRow label="Date of Birth" value={formatDate(patient.dob)} />
              <InfoRow label="Email" value={patient.email} />
              <InfoRow label="Phone" value={formatPhone(patient.phone)} />
              <InfoRow label="Address" value={patient.address ? `${patient.address}, ${patient.city}, ${patient.state} ${patient.zip}` : null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader className=""><h3 className="font-semibold text-gray-900">Emergency Contact</h3></CardHeader>
            <CardBody>
              <InfoRow label="Name" value={patient.emergencyContactName} />
              <InfoRow label="Phone" value={formatPhone(patient.emergencyContactPhone)} />
            </CardBody>
          </Card>
          {patient.insuranceInfos?.[0] && (
            <Card className="lg:col-span-2">
              <CardHeader className=""><h3 className="font-semibold text-gray-900">Primary Insurance</h3></CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-x-8">
                  <InfoRow label="Payer" value={patient.insuranceInfos[0].insuranceName} />
                  <InfoRow label="Member ID" value={patient.insuranceInfos[0].insuranceId} />
                  <InfoRow label="Group Number" value={patient.insuranceInfos[0].groupNumber} />
                  <InfoRow label="Subscriber" value={patient.insuranceInfos[0].subscriberName} />
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              onClick={() => setAddProgressOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>

          {/* Weight Chart */}
          {chartPoints.length > 0 && (
            <Card>
              <CardHeader className=""><h3 className="font-semibold text-gray-900">Weight History</h3></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartPoints}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(v: number) => [`${v} lbs`, 'Weight']}
                    />
                    <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}

          {/* Progress Table */}
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Date', 'Weight', 'BMI', 'BP', 'Heart Rate', 'Waist', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {progressLoading ? (
                    <tr><td colSpan={7} className="py-8 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" /></td></tr>
                  ) : (progressData?.data ?? []).map((e: ProgressEntry) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatWeight(e.weight)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.bmi?.toFixed(1) ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatBP(e.bloodPressureSystolic, e.bloodPressureDiastolic)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.heartRate ? `${e.heartRate} bpm` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.waistCircumference ? `${e.waistCircumference}"` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'appointments' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Date & Time', 'Type', 'Provider', 'Status', 'Reason'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {apptsLoading ? (
                  <tr><td colSpan={5} className="py-8 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" /></td></tr>
                ) : (appointmentsData?.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">No appointments found</td></tr>
                ) : (
                  (appointmentsData?.data ?? []).map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(a.startTime)} {format(parseISO(a.startTime), 'h:mm a')}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.type} /></td>
                      <td className="px-4 py-3 text-sm text-gray-700">{a.provider?.name ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-500">{a.reason || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'forms' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Form Type', 'Status', 'Sent', 'Completed', 'Expires'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {formsLoading ? (
                  <tr><td colSpan={5} className="py-8 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" /></td></tr>
                ) : (formsData?.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">No forms found</td></tr>
                ) : (
                  (formsData?.data ?? []).map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">{f.type.replace('-', ' ')}</td>
                      <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(f.sentAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(f.completedAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(f.expiresAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'insurance' && (
        <div className="space-y-4">
          {(patient.insuranceInfos ?? []).length === 0 ? (
            <Card><p className="text-sm text-gray-400 text-center py-6">No insurance information found</p></Card>
          ) : (
            (patient.insuranceInfos ?? []).map(ins => (
              <Card key={ins.id}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{ins.insuranceName}</h3>
                  {ins.isPrimary && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Primary</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-8">
                  <InfoRow label="Member ID" value={ins.insuranceId} />
                  <InfoRow label="Group Number" value={ins.groupNumber} />
                  <InfoRow label="Subscriber" value={ins.subscriberName} />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Add Progress Modal */}
      <Modal open={addProgressOpen} onClose={() => { setAddProgressOpen(false); reset(); }} title="Add Progress Entry">
        <form onSubmit={handleSubmit(d => addProgressMutation.mutateAsync(d))} className="space-y-4">
          <InputField label="Date *" type="date" {...register('date')} error={errors.date?.message} />
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Weight (lbs)" type="number" step="0.1" {...register('weight')} placeholder="185.5" />
            <InputField label="Waist (inches)" type="number" step="0.1" {...register('waistCircumference')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <InputField label="BP Systolic" type="number" {...register('bloodPressureSystolic')} placeholder="120" />
            <InputField label="BP Diastolic" type="number" {...register('bloodPressureDiastolic')} placeholder="80" />
            <InputField label="Heart Rate" type="number" {...register('heartRate')} placeholder="72" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Patient notes..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setAddProgressOpen(false); reset(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {isSubmitting && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Entry
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
