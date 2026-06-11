import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, Search, ChevronRight, Loader2 } from 'lucide-react';
import { patientsApi } from '../lib/api';
import { formatDate, formatPhone, fullName } from '../lib/utils';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import type { Patient } from '../types';

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

function useDebounce(value: string, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useState(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  });
  return debouncedValue;
}

export default function Patients() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useQuery({
    queryKey: ['patients', debouncedSearch, page],
    queryFn: () => patientsApi.list({ search: debouncedSearch, page, limit: 20 }),
  });

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<any>();

  const createMutation = useMutation({
    mutationFn: patientsApi.create,
    onSuccess: (p: Patient) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      setShowAdd(false);
      reset();
      navigate(`/patients/${p.id}`);
    },
  });

  const patients: Patient[] = data?.patients ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, MRN, phone..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>
          Add Patient
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Patient', 'MRN', 'DOB', 'Phone', 'Email', 'Visits', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No patients found</td></tr>
              ) : patients.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/patients/${p.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-semibold shrink-0">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <span className="font-medium text-gray-900">{fullName(p)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.mrn}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(p.dob)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatPhone(p.phone)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p._count?.appointments ?? 0}</td>
                  <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">{total} patients total</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-gray-600">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); reset(); }} title="Add New Patient" size="lg">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input {...register('firstName', { required: true })} className="input" />
              {errors.firstName && <span className="text-xs text-red-500">Required</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input {...register('lastName', { required: true })} className="input" />
              {errors.lastName && <span className="text-xs text-red-500">Required</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
              <input type="date" {...register('dob', { required: true })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
              <select {...register('gender', { required: true })} className="input">
                <option value="">Select...</option>
                {GENDERS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" {...register('email')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" {...register('phone')} placeholder="(555) 000-0000" className="input" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input {...register('address')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input {...register('city')} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select {...register('state')} className="input">
                  <option value="">—</option>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input {...register('zip')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name</label>
              <input {...register('emergencyContactName')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone</label>
              <input type="tel" {...register('emergencyContactPhone')} className="input" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea {...register('notes')} rows={3} className="input" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => { setShowAdd(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Create Patient</Button>
          </div>
        </form>
      </Modal>

      <style>{`.input { @apply w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500; }`}</style>
    </div>
  );
}
