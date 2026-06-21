import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, RefreshCw, Database, Phone, Users } from 'lucide-react';
import { phoneApi } from '../lib/api';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge from '../components/ui/Badge';

const TABS = ['Integrations', 'Users'] as const;

export default function Settings() {
  const [tab, setTab] = useState<'Integrations' | 'Users'>('Integrations');

  const { data: rcConfig } = useQuery({ queryKey: ['phone', 'config'], queryFn: phoneApi.getConfig });

  const integrations = [
    {
      name: 'RingCentral Office@Hand',
      description: 'Phone system integration for call logging, click-to-call, and SMS',
      connected: rcConfig?.configured ?? false,
      icon: <Phone className="w-6 h-6 text-blue-600" />,
      envVars: ['RC_CLIENT_ID', 'RC_CLIENT_SECRET', 'RC_USERNAME', 'RC_PASSWORD', 'RC_EXTENSION'],
    },
    {
      name: 'eClinicalWorks (eCW)',
      description: 'EHR integration for patient and appointment synchronization',
      connected: false,
      icon: <Database className="w-6 h-6 text-purple-600" />,
      envVars: ['ECW_BASE_URL', 'ECW_USERNAME', 'ECW_PASSWORD'],
    },
  ];

  const mockUsers = [
    { id: '1', name: 'Dr. Sarah Johnson', email: 'admin@clinic.com', role: 'admin' },
    { id: '2', name: 'Dr. Michael Chen', email: 'provider@clinic.com', role: 'provider' },
  ];

  return (
    <div className="space-y-4">
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

      {tab === 'Integrations' && (
        <div className="space-y-4">
          {integrations.map(int => (
            <Card key={int.name}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                      {int.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{int.name}</h3>
                        {int.connected
                          ? <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>
                          : <Badge variant="warning"><XCircle className="w-3 h-3 mr-1" />Not configured</Badge>}
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{int.description}</p>
                      <div className="text-xs text-gray-400">
                        Required env vars:{' '}
                        {int.envVars.map(v => (
                          <code key={v} className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 mr-1">{v}</code>
                        ))}
                      </div>
                    </div>
                  </div>
                  {int.connected && (
                    <button className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Sync now
                    </button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}

          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900">Configuration</h3></CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600 mb-3">
                Configure integrations by creating a <code className="bg-gray-100 px-1 rounded">server/.env</code> file from the example:
              </p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">{`# Copy server/.env.example to server/.env
cp clinic-app/server/.env.example clinic-app/server/.env

# Then fill in your credentials`}</pre>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'Users' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Staff Accounts
              </h3>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Name', 'Email', 'Role', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockUsers.map(u => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-semibold">
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'provider' ? 'info' : 'neutral'}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-blue-600 hover:underline text-xs font-medium">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
