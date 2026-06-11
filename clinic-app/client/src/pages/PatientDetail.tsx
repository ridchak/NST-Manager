import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, TrendingDown, Calendar, FileText, Shield,
  Phone, Plus, Edit2, Loader2, Weight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { patientsApi, progressApi, appointmentsApi } from '../lib/api';
import { formatDate, formatDateTime, formatPhone, formatWeight, fullName, getBMICategory } from '../lib/utils';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge, { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { Patient, Appointment, ProgressEntry, InsuranceAuth } from '../types';

const TABS = ['Overview', 'Progress', 'Appointments', 'Forms', 'Insurance'] as const;
type Tab = typeof TABS[number];

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Overview');
  const [showProgress, setShowProgress] = useState(false);

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ['patient-stats', id],
    queryFn: () => patientsApi.getStats(id!),
    enabled: !!id,
  });

  const { data: chartData = [] } = useQuery({
    queryKey: ['progress-chart', id],
    queryFn: () => progressApi.getChart(id!),
    enabled: !!id && tab === 'Progress',
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<any>({
    defaultValues: { date: format(new Date(), 'yyyy-MM-dd') },
  });

  const progressMutation = useMutation({
    mutationFn: progressApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', id] });
      qc.invalidateQueries({ queryKey: ['progress-chart', id] });
      setShowProgress(false);
      reset();
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!patient) return <div className="text-center py-12 text-gray-500">Patient not found</div>;

  const latestProgress = patient.progressEntries?.[0];
  const bmiInfo = latestProgress?.bmi ? getBMICategory(latestProgress.bmi) : null;

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/patients')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 text-xl font-bold">
            {patient.firstName[0]}{patient.lastName[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{fullName(patient)}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              <span className="font-mono">MRN: {patient.mrn}</span>
              <span>DOB: {formatDate(patient.dob)}</span>
              <span>{patient.gender}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {stats && (
            <>
              <div className="text-center">
                <div className="font-bold text-gray-900">{formatWeight(stats.currentWeight)}</div>
                <div className="text-gray-500">Current</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-green-600">-{stats.totalWeightLost} lbs</div>
                <div className="text-gray-500">Total Lost</div>
              </div>
              {latestProgress?.bmi && (
                <div className="text-center">
                  <div className={`font-bold ${bmiInfo?.color}`}>{latestProgress.bmi.toFixed(1)}</div>
                  <div className="text-gray-500">BMI</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-900">Demographics</h3></CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Phone" value={formatPhone(patient.phone)} />
                  <InfoRow label="Email" value={patient.email} />
                  <InfoRow label="Address" value={[patient.address, patient.city, patient.state, patient.zip].filter(Boolean).join(', ')} />
                  <InfoRow label="Gender" value={patient.gender} />
                  <InfoRow label="eCW ID" value={patient.ecwId} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-900">Emergency Contact</h3></CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Name" value={patient.emergencyContactName} />
                  <InfoRow label="Phone" value={formatPhone(patient.emergencyContactPhone)} />
                </div>
              </CardBody>
            </Card>
            {patient.notes && (
              <Card>
                <CardHeader><h3 className="font-semibold text-gray-900">Clinical Notes</h3></CardHeader>
                <CardBody><p className="text-sm text-gray-700 whitespace-pre-wrap">{patient.notes}</p></CardBody>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-900">Insurance</h3></CardHeader>
              <CardBody className="space-y-3">
                {patient.insuranceInfos?.length ? patient.insuranceInfos.map(ins => (
                  <div key={ins.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ins.insuranceName}</span>
                      {ins.isPrimary && <Badge variant="info">Primary</Badge>}
                    </div>
                    <div className="text-gray-500">ID: {ins.insuranceId}</div>
                    {ins.groupNumber && <div className="text-gray-500">Group: {ins.groupNumber}</div>}
                  </div>
                )) : <span className="text-sm text-gray-400">No insurance on file</span>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-900">Quick Stats</h3></CardHeader>
              <CardBody className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total Visits</span><span className="font-medium">{stats?.appointmentCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Progress Records</span><span className="font-medium">{stats?.progressEntryCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Start Weight</span><span className="font-medium">{formatWeight(stats?.startWeight)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Current Weight</span><span className="font-medium">{formatWeight(stats?.currentWeight)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total Lost</span><span className="font-semibold text-green-600">-{stats?.totalWeightLost ?? 0} lbs</span></div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* Progress Tab */}
      {tab === 'Progress' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowProgress(true)}>Add Entry</Button>
          </div>
          {chartData.length > 1 && (
            <Card>
              <CardHeader><h3 className="font-semibold text-gray-900">Weight Over Time</h3></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData.map((e: any) => ({ date: format(parseISO(e.date), 'MM/dd'), weight: e.weight, bmi: e.bmi }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Weight (lbs)" />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date', 'Weight', 'BMI', 'BP', 'Glucose', 'A1C', 'Notes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(patient.progressEntries ?? []).map(e => (
                    <tr key={e.id} className="border-b border-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 font-medium">{formatWeight(e.weight)}</td>
                      <td className="px-4 py-3">{e.bmi ? <span className={getBMICategory(e.bmi).color}>{e.bmi.toFixed(1)}</span> : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{e.bloodPressure || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{e.glucose ? `${e.glucose} mg/dL` : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{e.a1c ? `${e.a1c}%` : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{e.notes || '—'}</td>
                    </tr>
                  ))}
                  {!(patient.progressEntries ?? []).length && (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">No progress entries yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Appointments Tab */}
      {tab === 'Appointments' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date', 'Type', 'Provider', 'Duration', 'Status', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(patient.appointments ?? []).map((a: Appointment) => (
                  <tr key={a.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(a.date)}</td>
                    <td className="px-4 py-3 capitalize">{a.type.replace(/-/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-600">{a.provider?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{a.duration} min</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.notes || '—'}</td>
                  </tr>
                ))}
                {!(patient.appointments ?? []).length && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No appointments</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Forms Tab */}
      {tab === 'Forms' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Form Type', 'Status', 'Submitted', 'Created'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(patient.intakeForms ?? []).map(f => (
                  <tr key={f.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 capitalize font-medium">{f.formType.replace(/-/g, ' ')}</td>
                    <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{f.submittedAt ? formatDateTime(f.submittedAt) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(f.createdAt)}</td>
                  </tr>
                ))}
                {!(patient.intakeForms ?? []).length && (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">No forms on file</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Insurance Tab */}
      {tab === 'Insurance' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900">Insurance Plans</h3></CardHeader>
            <CardBody className="space-y-3">
              {patient.insuranceInfos?.length ? patient.insuranceInfos.map(ins => (
                <div key={ins.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{ins.insuranceName}</span>
                    {ins.isPrimary && <Badge variant="info">Primary</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm text-gray-600">
                    <div><span className="font-medium">Member ID:</span> {ins.insuranceId}</div>
                    {ins.groupNumber && <div><span className="font-medium">Group:</span> {ins.groupNumber}</div>}
                    {ins.subscriberName && <div><span className="font-medium">Subscriber:</span> {ins.subscriberName}</div>}
                  </div>
                </div>
              )) : <span className="text-sm text-gray-400">No insurance on file</span>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900">Prior Authorizations</h3></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Service', 'Auth #', 'Status', 'Start', 'End', 'Notes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(patient.insuranceAuths ?? []).map((a: InsuranceAuth) => (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="px-4 py-3 font-medium">{a.serviceType}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{a.authNumber || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{a.startDate ? formatDate(a.startDate) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{a.endDate ? formatDate(a.endDate) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.notes || '—'}</td>
                    </tr>
                  ))}
                  {!(patient.insuranceAuths ?? []).length && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No authorizations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Add Progress Modal */}
      <Modal open={showProgress} onClose={() => { setShowProgress(false); reset(); }} title="Record Progress" size="md">
        <form onSubmit={handleSubmit(d => progressMutation.mutate({ ...d, patientId: id, weight: d.weight ? Number(d.weight) : undefined, bmi: d.bmi ? Number(d.bmi) : undefined, waist: d.waist ? Number(d.waist) : undefined, hips: d.hips ? Number(d.hips) : undefined, glucose: d.glucose ? Number(d.glucose) : undefined, a1c: d.a1c ? Number(d.a1c) : undefined, heartRate: d.heartRate ? Number(d.heartRate) : undefined }))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" {...register('date', { required: true })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
              <input type="number" step="0.1" {...register('weight')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BMI</label>
              <input type="number" step="0.1" {...register('bmi')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Pressure</label>
              <input {...register('bloodPressure')} placeholder="120/80" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heart Rate (bpm)</label>
              <input type="number" {...register('heartRate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Glucose (mg/dL)</label>
              <input type="number" step="0.1" {...register('glucose')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">A1C (%)</label>
              <input type="number" step="0.1" {...register('a1c')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Waist (in)</label>
              <input type="number" step="0.1" {...register('waist')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea {...register('notes')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => { setShowProgress(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || progressMutation.isPending}>Save Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>
      <div className="font-medium text-gray-900 mt-0.5">{value || '—'}</div>
    </div>
  );
}
