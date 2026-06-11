import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Phone, MessageSquare, Voicemail, Settings, PhoneCall, PhoneIncoming, PhoneOutgoing, Send } from 'lucide-react';
import { phoneApi } from '../lib/api';
import { formatDateTime, formatDuration, formatPhone } from '../lib/utils';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge, { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';

const TABS = ['Calls', 'Messages', 'Voicemail', 'Settings'] as const;

export default function PhoneSystem() {
  const [tab, setTab] = useState<'Calls' | 'Messages' | 'Voicemail' | 'Settings'>('Calls');
  const [showDial, setShowDial] = useState(false);
  const [showSMS, setShowSMS] = useState(false);
  const { register: regDial, handleSubmit: submitDial, reset: resetDial } = useForm<any>();
  const { register: regSMS, handleSubmit: submitSMS, reset: resetSMS } = useForm<any>();

  const { data: config } = useQuery({ queryKey: ['phone', 'config'], queryFn: phoneApi.getConfig });
  const { data: calls } = useQuery({ queryKey: ['phone', 'calls'], queryFn: () => phoneApi.getCalls(30), enabled: tab === 'Calls' });
  const { data: messages } = useQuery({ queryKey: ['phone', 'messages'], queryFn: () => phoneApi.getMessages(30), enabled: tab === 'Messages' });
  const { data: voicemails } = useQuery({ queryKey: ['phone', 'voicemails'], queryFn: phoneApi.getVoicemails, enabled: tab === 'Voicemail' });

  const callMutation = useMutation({
    mutationFn: (toNumber: string) => phoneApi.makeCall(toNumber),
    onSuccess: () => { setShowDial(false); resetDial(); },
  });

  const smsMutation = useMutation({
    mutationFn: ({ toNumber, text }: any) => phoneApi.sendMessage(toNumber, text),
    onSuccess: () => { setShowSMS(false); resetSMS(); },
  });

  return (
    <div className="space-y-4">
      {/* RC Status */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${config?.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <div>
            <div className="text-sm font-medium text-gray-900">
              RingCentral Office@Hand — {config?.configured ? 'Connected' : 'Demo Mode'}
            </div>
            <div className="text-xs text-gray-500">{config?.note}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<PhoneCall className="w-4 h-4" />} size="sm" onClick={() => setShowDial(true)}>Dial</Button>
          <Button icon={<MessageSquare className="w-4 h-4" />} size="sm" variant="outline" onClick={() => setShowSMS(true)}>Send SMS</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'Calls' && <Phone className="w-4 h-4" />}
              {t === 'Messages' && <MessageSquare className="w-4 h-4" />}
              {t === 'Voicemail' && <Voicemail className="w-4 h-4" />}
              {t === 'Settings' && <Settings className="w-4 h-4" />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Call Log */}
      {tab === 'Calls' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Direction', 'From / To', 'Duration', 'Time', 'Result'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(calls ?? []).map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {c.direction === 'Inbound'
                          ? <PhoneIncoming className="w-4 h-4 text-green-600" />
                          : <PhoneOutgoing className="w-4 h-4 text-blue-600" />}
                        <Badge variant={c.direction === 'Inbound' ? 'success' : 'info'}>{c.direction}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.direction === 'Inbound' ? (c.from?.name || formatPhone(c.from?.phoneNumber)) : (c.to?.name || formatPhone(c.to?.phoneNumber))}</div>
                      <div className="text-xs text-gray-500">{c.direction === 'Inbound' ? formatPhone(c.from?.phoneNumber) : formatPhone(c.to?.phoneNumber)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDuration(c.duration)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(c.startTime)}</td>
                    <td className="px-4 py-3 text-gray-600">{c.result}</td>
                  </tr>
                ))}
                {!calls?.length && <tr><td colSpan={5} className="text-center py-12 text-gray-400">No calls in log</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Messages */}
      {tab === 'Messages' && (
        <Card>
          <div className="divide-y divide-gray-100">
            {(messages ?? []).map((m: any) => (
              <div key={m.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${m.readStatus === 'Unread' ? 'bg-blue-500' : 'bg-gray-200'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 text-sm">{m.from?.name || formatPhone(m.from?.phoneNumber)}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatDateTime(m.creationTime)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">{m.subject}</p>
                </div>
                <Badge variant={m.messageStatus === 'Received' ? 'info' : 'neutral'}>{m.messageStatus}</Badge>
              </div>
            ))}
            {!messages?.length && <div className="text-center py-12 text-gray-400">No messages</div>}
          </div>
        </Card>
      )}

      {/* Voicemail */}
      {tab === 'Voicemail' && (
        <Card>
          <div className="divide-y divide-gray-100">
            {(voicemails ?? []).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <Voicemail className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{v.from?.name || formatPhone(v.from?.phoneNumber)}</div>
                    <div className="text-xs text-gray-500">{formatDateTime(v.creationTime)} · {v.subject}</div>
                  </div>
                </div>
                <Badge variant={v.readStatus === 'Unread' ? 'warning' : 'neutral'}>{v.readStatus}</Badge>
              </div>
            ))}
            {!voicemails?.length && <div className="text-center py-12 text-gray-400">No voicemails</div>}
          </div>
        </Card>
      )}

      {/* Settings */}
      {tab === 'Settings' && (
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">RingCentral Office@Hand Configuration</h3></CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <div className={`w-3 h-3 rounded-full ${config?.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium">{config?.configured ? 'Connected' : 'Not configured — using demo data'}</span>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <p>To connect to RingCentral Office@Hand, set the following environment variables in <code className="bg-gray-100 px-1 rounded">server/.env</code>:</p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">{`RC_CLIENT_ID=your_client_id
RC_CLIENT_SECRET=your_client_secret
RC_SERVER_URL=https://platform.ringcentral.com
RC_USERNAME=your_ringcentral_username
RC_PASSWORD=your_ringcentral_password
RC_EXTENSION=your_extension_number`}</pre>
              <p>You can obtain these credentials from the <strong>RingCentral Developer Portal</strong>. Create an app with "Password Flow" OAuth grant type.</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Dial Modal */}
      <Modal open={showDial} onClose={() => { setShowDial(false); resetDial(); }} title="Make a Call" size="sm">
        <form onSubmit={submitDial(d => callMutation.mutate(d.toNumber))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input type="tel" {...regDial('toNumber', { required: true })} placeholder="+1 (555) 000-0000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => { setShowDial(false); resetDial(); }}>Cancel</Button>
            <Button type="submit" icon={<PhoneCall className="w-4 h-4" />} loading={callMutation.isPending}>Call</Button>
          </div>
        </form>
      </Modal>

      {/* SMS Modal */}
      <Modal open={showSMS} onClose={() => { setShowSMS(false); resetSMS(); }} title="Send SMS" size="sm">
        <form onSubmit={submitSMS(d => smsMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input type="tel" {...regSMS('toNumber', { required: true })} placeholder="+1 (555) 000-0000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea {...regSMS('text', { required: true })} rows={3} placeholder="Type your message..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => { setShowSMS(false); resetSMS(); }}>Cancel</Button>
            <Button type="submit" icon={<Send className="w-4 h-4" />} loading={smsMutation.isPending}>Send</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
