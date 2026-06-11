import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { patientsApi } from '../lib/api';
import { formatDate, formatPhone, cn } from '../lib/utils';
import Card from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { Patient } from '../types';

const patientSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  dob: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

function InputField({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
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

export default function Patients() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['patients', page, search, status],
    queryFn: () => patientsApi.list({ page, limit, search: search || undefined, status: status || undefined }),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
  });

  const createMutation = useMutation({
    mutationFn: (d: PatientForm) => patientsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      setModalOpen(false);
      reset();
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function onSubmit(data: PatientForm) {
    await createMutation.mutateAsync(data);
  }

  const patients = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search patients..."
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </form>
          {/* Status filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Patient
        </button>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Patient', 'MRN', 'Date of Birth', 'Phone', 'Status', 'Last Visit', 'BMI', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    No patients found. Try adjusting your search.
                  </td>
                </tr>
              ) : (
                patients.map((p: Patient) => {
                  const lastProgress = p.progressEntries?.[0];
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                            {p.firstName[0]}{p.lastName[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                            <p className="text-xs text-gray-500">{p.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{p.mrn}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(p.dob)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatPhone(p.phone)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lastProgress ? formatDate(lastProgress.date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lastProgress?.bmi ? lastProgress.bmi.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/patients/${p.id}`); }}
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} · {data?.total ?? 0} patients
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Patient Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset(); }} title="Add New Patient" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {createMutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Failed to create patient. Please try again.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <InputField label="First Name *" {...register('firstName')} error={errors.firstName?.message} />
            <InputField label="Last Name *" {...register('lastName')} error={errors.lastName?.message} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Date of Birth *" type="date" {...register('dob')} error={errors.dob?.message} />
            <InputField label="Phone" type="tel" {...register('phone')} placeholder="(555) 555-5555" />
          </div>
          <InputField label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <InputField label="Address" {...register('address')} placeholder="123 Main St" />
          <div className="grid grid-cols-3 gap-4">
            <InputField label="City" {...register('city')} />
            <InputField label="State" {...register('state')} placeholder="CA" maxLength={2} />
            <InputField label="ZIP" {...register('zip')} />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Name" {...register('emergencyContactName')} />
              <InputField label="Phone" type="tel" {...register('emergencyContactPhone')} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); reset(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {isSubmitting && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Patient
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
