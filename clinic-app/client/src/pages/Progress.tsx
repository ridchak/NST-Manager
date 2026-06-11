import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { progressApi, patientsApi } from '../lib/api';
import { formatDate, formatWeight, fullName, getBMICategory } from '../lib/utils';
import Card, { CardHeader, CardBody } from '../components/ui/Card';

export default function Progress() {
  const navigate = useNavigate();
  const [patientSearch, setPatientSearch] = useState('');

  const { data: progressData } = useQuery({
    queryKey: ['progress', 'clinic'],
    queryFn: () => progressApi.list({ limit: 50 }),
  });

  const entries = progressData?.entries ?? [];

  const bmiGroups: Record<string, number> = {
    'Normal (<25)': 0, 'Overweight (25-29)': 0, 'Obese I (30-34)': 0, 'Obese II (35-39)': 0, 'Obese III (40+)': 0,
  };
  entries.forEach((e: any) => {
    if (!e.bmi) return;
    if (e.bmi < 25) bmiGroups['Normal (<25)']++;
    else if (e.bmi < 30) bmiGroups['Overweight (25-29)']++;
    else if (e.bmi < 35) bmiGroups['Obese I (30-34)']++;
    else if (e.bmi < 40) bmiGroups['Obese II (35-39)']++;
    else bmiGroups['Obese III (40+)']++;
  });
  const bmiChartData = Object.entries(bmiGroups).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">BMI Distribution</h3></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bmiChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Patients" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">Summary</h3></CardHeader>
          <CardBody className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total entries</span>
              <span className="font-semibold">{progressData?.total ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Entries with weight</span>
              <span className="font-semibold">{entries.filter((e: any) => e.weight).length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Average BMI</span>
              <span className="font-semibold">
                {entries.filter((e: any) => e.bmi).length
                  ? (entries.filter((e: any) => e.bmi).reduce((s: number, e: any) => s + e.bmi, 0) / entries.filter((e: any) => e.bmi).length).toFixed(1)
                  : '—'}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="font-semibold text-gray-900">Recent Progress Entries</h3></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Patient', 'Date', 'Weight', 'BMI', 'BP', 'Glucose', 'Notes'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/patients/${e.patientId}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{e.patient ? fullName(e.patient) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 font-medium">{formatWeight(e.weight)}</td>
                  <td className="px-4 py-3">
                    {e.bmi ? (
                      <span className={getBMICategory(e.bmi).color}>{e.bmi.toFixed(1)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.bloodPressure || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{e.glucose ? `${e.glucose} mg/dL` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{e.notes || '—'}</td>
                </tr>
              ))}
              {!entries.length && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No progress entries recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
