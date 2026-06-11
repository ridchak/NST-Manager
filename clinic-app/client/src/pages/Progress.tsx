import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { Search } from 'lucide-react';
import { progressApi, patientsApi } from '../lib/api';
import { formatDate, formatWeight, formatBP, getBMICategory, cn } from '../lib/utils';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import type { ProgressEntry } from '../types';

const BMI_RANGES = [
  { label: 'Underweight (<18.5)', min: 0, max: 18.5 },
  { label: 'Normal (18.5-24.9)', min: 18.5, max: 25 },
  { label: 'Overweight (25-29.9)', min: 25, max: 30 },
  { label: 'Obese I (30-34.9)', min: 30, max: 35 },
  { label: 'Obese II (35-39.9)', min: 35, max: 40 },
  { label: 'Obese III (40+)', min: 40, max: Infinity },
];

export default function Progress() {
  const [patientFilter, setPatientFilter] = useState('');
  const [startDate, setStartDate] = useState(
    format(subMonths(new Date(), 3), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: progressData, isLoading } = useQuery({
    queryKey: ['progress', 'all', patientFilter, startDate, endDate],
    queryFn: () => progressApi.list({
      limit: 100,
      patientId: patientFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const { data: patientsData } = useQuery({
    queryKey: ['patients', 'dropdown'],
    queryFn: () => patientsApi.list({ limit: 200 }),
  });

  const entries = progressData?.data ?? [];

  // BMI Distribution
  const bmiDistribution = BMI_RANGES.map(range => ({
    label: range.label.split('(')[0].trim(),
    count: entries.filter(e => e.bmi && e.bmi >= range.min && e.bmi < range.max).length,
  }));

  // Average weight over time (group by week)
  const weightOverTime = entries
    .filter(e => e.weight)
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce<{ date: string; avg: number; count: number }[]>((acc, e) => {
      const week = format(parseISO(e.date), 'MMM d');
      const existing = acc.find(x => x.date === week);
      if (existing) {
        existing.avg = (existing.avg * existing.count + (e.weight ?? 0)) / (existing.count + 1);
        existing.count++;
      } else {
        acc.push({ date: week, avg: e.weight ?? 0, count: 1 });
      }
      return acc;
    }, [])
    .map(x => ({ date: x.date, avgWeight: Math.round(x.avg * 10) / 10 }));

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Patient</label>
            <select
              value={patientFilter}
              onChange={e => setPatientFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
            >
              <option value="">All Patients</option>
              {(patientsData?.data ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-sm text-gray-500 pb-2">
            {entries.length} entries found
          </div>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="">
            <h3 className="font-semibold text-gray-900">Average Weight Over Time</h3>
          </CardHeader>
          <CardBody>
            {weightOverTime.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weightOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} lbs`, 'Avg Weight']}
                  />
                  <Line type="monotone" dataKey="avgWeight" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="">
            <h3 className="font-semibold text-gray-900">BMI Distribution</h3>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bmiDistribution} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: '#6b7280' }} width={80} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Patients" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Entries Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Progress Entries</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Patient', 'Date', 'Weight', 'BMI', 'Category', 'BP', 'Heart Rate', 'Notes'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-gray-400">
                    No progress entries found for the selected filters
                  </td>
                </tr>
              ) : (
                entries.map((e: ProgressEntry) => {
                  const bmiInfo = e.bmi ? getBMICategory(e.bmi) : null;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {e.patient?.firstName} {e.patient?.lastName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatWeight(e.weight)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.bmi?.toFixed(1) ?? '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {bmiInfo ? (
                          <span className={cn('font-medium', bmiInfo.color)}>{bmiInfo.label}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatBP(e.bloodPressureSystolic, e.bloodPressureDiastolic)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.heartRate ? `${e.heartRate} bpm` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{e.notes || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
