import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Shield, TrendingDown, UserPlus, Plus, Clock } from 'lucide-react';
import { appointmentsApi, patientsApi, insuranceApi, progressApi } from '../lib/api';
import StatCard from '../components/ui/StatCard';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { formatTime, formatDate, fullName, formatWeight } from '../lib/utils';
import type { Appointment } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: todayAppts = [] } = useQuery({
    queryKey: ['appointments', 'today'],
    queryFn: appointmentsApi.getToday,
  });

  const { data: patientsData } = useQuery({
    queryKey: ['patients', 'list'],
    queryFn: () => patientsApi.list({ limit: 1 }),
  });

  const { data: authStats } = useQuery({
    queryKey: ['insurance', 'stats'],
    queryFn: insuranceApi.getStats,
  });

  const { data: recentProgress } = useQuery({
    queryKey: ['progress', 'recent'],
    queryFn: () => progressApi.list({ limit: 5 }),
  });

  const completed = (todayAppts as Appointment[]).filter(a => a.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Today's Appointments"
          value={`${completed}/${(todayAppts as Appointment[]).length}`}
          icon={<Calendar className="w-6 h-6 text-blue-600" />}
          iconBg="bg-blue-100"
        />
        <StatCard
          label="Total Patients"
          value={patientsData?.total ?? '—'}
          icon={<Users className="w-6 h-6 text-green-600" />}
          iconBg="bg-green-100"
        />
        <StatCard
          label="Pending Authorizations"
          value={authStats?.pending ?? '—'}
          icon={<Shield className="w-6 h-6 text-yellow-600" />}
          iconBg="bg-yellow-100"
        />
        <StatCard
          label="Expiring Auth (30d)"
          value={authStats?.expiringSoon ?? '—'}
          icon={<TrendingDown className="w-6 h-6 text-purple-600" />}
          iconBg="bg-purple-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Today's Schedule
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/schedule')}>View all</Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {(todayAppts as Appointment[]).length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No appointments today</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {(todayAppts as Appointment[]).slice(0, 6).map(appt => (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/patients/${appt.patientId}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-xs shrink-0">
                        {appt.patient?.firstName?.[0]}{appt.patient?.lastName?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{appt.patient ? fullName(appt.patient) : '—'}</div>
                        <div className="text-xs text-gray-500 capitalize">{appt.type.replace(/-/g, ' ')} · {appt.duration}min</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-gray-600">{formatTime(appt.date)}</span>
                      <StatusBadge status={appt.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-600" />
                Recent Progress
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/progress')}>View all</Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {!recentProgress?.entries?.length ? (
              <div className="text-center py-8 text-gray-400 text-sm">No recent entries</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentProgress.entries.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/patients/${e.patientId}`)}
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{e.patient ? fullName(e.patient) : '—'}</div>
                      <div className="text-xs text-gray-500">{formatDate(e.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">{formatWeight(e.weight)}</div>
                      {e.bmi && <div className="text-xs text-gray-500">BMI {e.bmi.toFixed(1)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900">Quick Actions</h2></CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => navigate('/patients')}>New Patient</Button>
            <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/schedule')}>New Appointment</Button>
            <Button variant="outline" icon={<Shield className="w-4 h-4" />} onClick={() => navigate('/insurance')}>New Auth Request</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
