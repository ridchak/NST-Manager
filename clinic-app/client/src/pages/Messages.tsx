import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { messagesApi } from '../lib/api';
import { formatDateTime, cn } from '../lib/utils';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

const typeLabels: Record<string, string> = {
  refill: 'Refill',
  'side-effect': 'Side effect',
  'prior-auth': 'Prior auth',
  'check-in': 'Check-in',
  'med-question': 'Med question',
  callback: 'Callback',
  general: 'General',
};

interface StaffMessage {
  id: string;
  type: string;
  priority: 'normal' | 'urgent';
  subject: string;
  body: string;
  status: 'open' | 'done';
  createdAt: string;
  patient?: { id: string; firstName: string; lastName: string; mrn: string } | null;
}

interface CallLog {
  id: string;
  callId: string;
  callerPhone?: string | null;
  verified: boolean;
  startedAt: string;
  patient?: { firstName: string; lastName: string } | null;
  events: Array<{ at: string; tool: string; outcome: string }>;
}

export default function Messages() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'messages' | 'calls'>('messages');
  const [status, setStatus] = useState<'open' | 'done'>('open');

  const messages = useQuery({ queryKey: ['messages', status], queryFn: () => messagesApi.list({ status }) });
  const calls = useQuery({ queryKey: ['calls'], queryFn: messagesApi.calls, enabled: tab === 'calls' });
  const toggle = useMutation({
    mutationFn: (m: StaffMessage) => messagesApi.setStatus(m.id, m.status === 'open' ? 'done' : 'open'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });

  const list: StaffMessage[] = messages.data?.data ?? [];
  const callList: CallLog[] = calls.data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-gray-200">
        {([['messages', 'Staff messages'], ['calls', 'Assistant call log']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2',
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'messages' && (
        <>
          <div className="flex gap-2">
            {(['open', 'done'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn('px-3 py-1.5 text-sm rounded-lg border',
                  status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
              >
                {s === 'open' ? 'Needs action' : 'Completed'}
              </button>
            ))}
          </div>

          {messages.isError && <Card><p className="text-sm text-red-600">Could not load messages.</p></Card>}
          {!messages.isLoading && !messages.isError && list.length === 0 && (
            <Card><p className="text-sm text-gray-400 text-center py-6">{status === 'open' ? 'Nothing waiting. You are all caught up.' : 'No completed messages yet.'}</p></Card>
          )}

          <div className="space-y-3">
            {list.map(m => (
              <Card key={m.id} className={cn(m.priority === 'urgent' && m.status === 'open' && 'border-red-300 bg-red-50/40')}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {m.priority === 'urgent' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="w-3.5 h-3.5" />Urgent</span>}
                      <Badge variant="info">{typeLabels[m.type] ?? m.type}</Badge>
                      <span className="text-xs text-gray-500">{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="font-medium text-gray-900">{m.subject}</p>
                    <p className="text-sm text-gray-600 whitespace-pre-line mt-1">{m.body}</p>
                  </div>
                  <button
                    onClick={() => toggle.mutate(m)}
                    disabled={toggle.isPending}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                  >
                    {m.status === 'open' ? <><Check className="w-4 h-4" />Mark done</> : <><RotateCcw className="w-4 h-4" />Reopen</>}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'calls' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>{['Started', 'Caller', 'Patient', 'Verified', 'What happened'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {calls.isLoading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">Loading…</td></tr>
                ) : callList.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-400">No assistant calls yet.</td></tr>
                ) : callList.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(c.startedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.callerPhone ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-sm">{c.verified ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.events.map(e => `${e.tool.replace(/_/g, ' ')}: ${e.outcome.replace(/_/g, ' ')}`).join(' → ')}</td>
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
