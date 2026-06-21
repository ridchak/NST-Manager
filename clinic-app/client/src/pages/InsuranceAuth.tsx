import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Shield, Plus, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { insuranceApi, patientsApi } from '../lib/api';
import { formatDate, fullName } from '../lib/utils';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge, { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { InsuranceAuth } from '../types';

const STATUSES = ['all', 'pending', 'approved', 'denied', 'expired'];

export default function InsuranceAuthPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<InsuranceAuth | null>(null);

  const { data } = useQuery({
    queryKey: ['insurance', 'auths', status],
    queryFn: () => insuranceApi.list({ status: status === 'all' ? undefined : status, limit: 50 }),
  });

  const { data: stats } = useQuery({
    queryKey: ['insurance', 'stats'],
    queryFn: insuranceApi.getStats,
  });

  const { data: patients } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.list({ limit: 200 }),
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<any>();

  const createMutation = useMutation({
    mutationFn: insuranceApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insurance'] }); setShowNew(false); reset(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => insuranceApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insurance'] }); setSelected(null); },
  });

  const auths: InsuranceAuth[] = data?.auths ?? [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending" value={stats?.pending ?? '—'} icon={<Clock className="w-6 h-6 text-yellow-600" />} iconBg="bg-yellow-100" />
        <StatCard label="Approved" value={stats?.approved ?? '—'} icon={<CheckCircle className="w-6 h-6 text-green-600" />} iconBg="bg-green-100" />
        <StatCard label="Denied" value={stats?.denied ?? '—'} icon={<XCircle className="w-6 h-6 text-red-600" />} iconBg="bg-red-100" />
        <StatCard label="Expiring (30d)" value={stats?.expiringSoon ?? '—'} icon={<AlertTriangle className="w-6 h-6 text-orange-600" />} iconBg="bg-orange-100" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${status === s ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNew(true)}>New Auth Request</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Patient', 'Service', 'Insurance', 'Auth #', 'Status', 'Start', 'End', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auths.map(a => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.patient ? fullName(a.patient) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">{a.serviceType}</td>
                  <td className="px-4 py-3 text-gray-600">{a.insurance?.insuranceName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{a.authNumber || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{a.startDate ? formatDate(a.startDate) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.endDate ? formatDate(a.endDate) : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(a)} className="text-blue-600 hover:underline text-xs font-medium">Manage</button>
                  </td>
                </tr>
              ))}
              {!auths.length && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No authorizations found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Auth Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); reset(); }} title="New Authorization Request" size="lg">
        <form onSubmit={handleSubmit(d => createMutation.mutate({
          ...d,
          diagnosisCodes: d.diagnosisCodes ? d.diagnosisCodes.split(',').map((c: string) => c.trim()) : [],
          procedureCodes: d.procedureCodes ? d.procedureCodes.split(',').map((c: string) => c.trim()) : [],
          insuranceId: d.insuranceId || 'placeholder',
        }))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Plan *</label>
              <input {...register('insuranceName', { required: true })} placeholder="e.g. BlueCross BlueShield" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Type *</label>
              <input {...register('serviceType', { required: true })} placeholder="e.g. Medical Weight Loss Program" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diagnosis Codes (comma-separated)</label>
              <input {...register('diagnosisCodes')} placeholder="E66.01, E11.65" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Procedure Codes (comma-separated)</label>
              <input {...register('procedureCodes')} placeholder="99213, 99214" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" {...register('startDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" {...register('endDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea {...register('notes')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => { setShowNew(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Submit Request</Button>
          </div>
        </form>
      </Modal>

      {/* Manage Auth Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Authorization Details" size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Patient:</span><div className="font-medium">{selected.patient ? fullName(selected.patient) : '—'}</div></div>
              <div><span className="text-gray-500">Status:</span><div className="mt-0.5"><StatusBadge status={selected.status} /></div></div>
              <div><span className="text-gray-500">Service:</span><div className="font-medium">{selected.serviceType}</div></div>
              <div><span className="text-gray-500">Auth Number:</span><div className="font-mono font-medium">{selected.authNumber || '—'}</div></div>
              <div><span className="text-gray-500">Start:</span><div>{selected.startDate ? formatDate(selected.startDate) : '—'}</div></div>
              <div><span className="text-gray-500">End:</span><div>{selected.endDate ? formatDate(selected.endDate) : '—'}</div></div>
            </div>
            {selected.diagnosisCodes?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-1">Diagnosis Codes</div>
                <div className="flex flex-wrap gap-1">{selected.diagnosisCodes.map(c => <Badge key={c} variant="neutral">{c}</Badge>)}</div>
              </div>
            )}
            {selected.notes && <div><div className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</div><p className="text-sm">{selected.notes}</p></div>}

            <div className="border-t border-gray-200 pt-4">
              <div className="mb-3 text-sm font-medium text-gray-700">Update Status</div>
              <div className="flex flex-wrap gap-2">
                {['pending', 'approved', 'denied', 'expired'].map(s => (
                  <Button
                    key={s}
                    size="sm"
                    variant={selected.status === s ? 'primary' : 'outline'}
                    onClick={() => updateMutation.mutate({ id: selected.id, data: { status: s } })}
                    loading={updateMutation.isPending}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
              {selected.status === 'approved' && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auth Number</label>
                  <div className="flex gap-2">
                    <input
                      id="authNum"
                      defaultValue={selected.authNumber || ''}
                      placeholder="Enter auth number..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: selected.id, data: { authNumber: (document.getElementById('authNum') as HTMLInputElement).value } })}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
