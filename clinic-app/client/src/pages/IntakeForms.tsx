import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { formsApi, patientsApi } from '../lib/api';
import { formatDate, fullName } from '../lib/utils';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge, { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { IntakeForm, FormTemplate } from '../types';

const FORM_TYPES = ['all', 'initial-intake', 'medical-history', 'consent', 'hipaa'];
const STATUSES = ['all', 'pending', 'submitted', 'reviewed'];

export default function IntakeForms() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'all' | 'pending' | 'submitted' | 'reviewed'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<IntakeForm | null>(null);
  const [newForm, setNewForm] = useState({ patientId: '', formType: 'initial-intake' as IntakeForm['formType'] });

  const { data } = useQuery({
    queryKey: ['forms', tab, typeFilter],
    queryFn: () => formsApi.list({
      status: tab === 'all' ? undefined : tab,
      formType: typeFilter === 'all' ? undefined : typeFilter,
      limit: 50,
    }),
  });

  const { data: patients } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.list({ limit: 200 }),
  });

  const { data: templates } = useQuery({
    queryKey: ['form-templates'],
    queryFn: formsApi.getTemplates,
  });

  const createMutation = useMutation({
    mutationFn: formsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forms'] }); setShowNew(false); },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id }: any) => formsApi.update(id, { status: 'reviewed' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forms'] }); setViewing(null); },
  });

  const forms: IntakeForm[] = data?.forms ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setTab(s as any)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === s ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && (
                <span className="ml-1.5 text-xs">
                  ({(data?.forms ?? []).filter((f: any) => f.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {FORM_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNew(true)}>Send Form</Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Patient', 'Form Type', 'Status', 'Submitted', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map(f => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.patient ? fullName(f.patient) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="capitalize">{f.formType.replace(/-/g, ' ')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{f.submittedAt ? formatDate(f.submittedAt) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(f.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewing(f)}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!forms.length && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No forms found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Send Form Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Send Intake Form" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient</label>
            <select
              value={newForm.patientId}
              onChange={e => setNewForm(f => ({ ...f, patientId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select patient...</option>
              {(patients?.patients ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{fullName(p)} — {p.mrn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Form Type</label>
            <select
              value={newForm.formType}
              onChange={e => setNewForm(f => ({ ...f, formType: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['initial-intake', 'medical-history', 'consent', 'hipaa'].map(t => (
                <option key={t} value={t}>{t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              disabled={!newForm.patientId}
              onClick={() => createMutation.mutate({ patientId: newForm.patientId, formType: newForm.formType, status: 'pending', data: {} })}
            >
              Create Form
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Form Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${viewing.formType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — ${viewing.patient ? fullName(viewing.patient) : ''}` : ''} size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <StatusBadge status={viewing.status} />
              <span>Submitted: {viewing.submittedAt ? format(new Date(viewing.submittedAt), 'MM/dd/yyyy h:mm a') : 'Not yet'}</span>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              {Object.keys(viewing.data).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Form is empty or not yet submitted</p>
              ) : (
                Object.entries(viewing.data).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs font-medium text-gray-500 uppercase">{k.replace(/([A-Z])/g, ' $1').trim()}</div>
                    <div className="text-sm text-gray-900 mt-0.5">{Array.isArray(v) ? v.join(', ') : String(v)}</div>
                  </div>
                ))
              )}
            </div>
            {viewing.status !== 'reviewed' && (
              <div className="flex justify-end">
                <Button onClick={() => reviewMutation.mutate({ id: viewing.id })} loading={reviewMutation.isPending}>
                  Mark as Reviewed
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
