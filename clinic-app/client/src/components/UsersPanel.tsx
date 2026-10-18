import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Phone, Plus, Unlock, UserCheck, UserX } from 'lucide-react';
import { errorMessage, usersApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import Card, { CardBody, CardHeader } from './ui/Card';
import Badge from './ui/Badge';
import Modal from './ui/Modal';
import { formatPhone } from '../lib/utils';

const LEVELS = [
  { id: 'user', label: 'User', blurb: 'View records and add new ones. Cannot edit existing records or delete.' },
  { id: 'admin', label: 'Admin', blurb: 'Everything a user can do, plus edit existing records, including insurance authorizations.' },
  { id: 'superuser', label: 'Superuser', blurb: 'Full control: delete records, manage accounts, unlock locked accounts.' },
] as const;

interface Account {
  id: string; email: string; name: string; role: 'user' | 'admin' | 'superuser';
  isProvider: boolean; active: boolean; locked: boolean; extension: string | null; cellPhone: string | null;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function UsersPanel() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', isProvider: false, extension: '', cellPhone: '' });
  const [phoneFor, setPhoneFor] = useState<Account | null>(null);
  const [phones, setPhones] = useState({ extension: '', cellPhone: '' });
  const [newPassword, setNewPassword] = useState('');

  const isSuper = me?.role === 'superuser';
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: isSuper });
  const accounts: Account[] = data?.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const run = <T,>(fn: (x: T) => Promise<unknown>, after?: () => void) =>
    useMutation({ mutationFn: fn, onSuccess: () => { setError(''); refresh(); after?.(); }, onError: e => setError(errorMessage(e)) });

  const create = run(() => usersApi.create({ ...form, extension: form.extension || undefined, cellPhone: form.cellPhone || undefined } as never), () => { setAdding(false); setForm({ name: '', email: '', password: '', role: 'user', isProvider: false, extension: '', cellPhone: '' }); });
  const update = run(({ id, patch }: { id: string; patch: Record<string, unknown> }) => usersApi.update(id, patch));
  const unlock = run((id: string) => usersApi.unlock(id));
  const savePhones = run(() => usersApi.update(phoneFor!.id, { extension: phones.extension, cellPhone: phones.cellPhone }), () => setPhoneFor(null));
  const reset = run(() => usersApi.resetPassword(resetFor!.id, newPassword), () => { setResetFor(null); setNewPassword(''); });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-semibold text-gray-900">Access levels</h3></CardHeader>
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-3">
            {LEVELS.map(l => (
              <div key={l.id} className={`rounded-lg border p-3 ${me?.role === l.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <dt className="font-medium text-gray-900">{l.label}{me?.role === l.id && <span className="ml-2 text-xs text-blue-700">(you)</span>}</dt>
                <dd className="text-sm text-gray-600 mt-1">{l.blurb}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-gray-500 mt-3">Accounts lock for 30 minutes after 5 failed sign-ins. A superuser can unlock them sooner.</p>
        </CardBody>
      </Card>

      {!isSuper ? (
        <Card><p className="text-sm text-gray-500">Only a superuser can add or change accounts.</p></Card>
      ) : (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Accounts</h3>
            <button onClick={() => { setError(''); setAdding(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Add user
            </button>
          </div>
          {error && <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Name', 'Access level', 'Prescriber', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
                {accounts.map(a => {
                  const self = a.id === me?.id;
                  return (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="px-4 py-3"><div className="font-medium text-gray-900">{a.name}</div><div className="text-xs text-gray-500">{a.email}</div>{(a.extension || a.cellPhone) && <div className="text-xs text-gray-500">{a.extension ? `ext ${a.extension}` : ''}{a.extension && a.cellPhone ? ' · ' : ''}{a.cellPhone ? formatPhone(a.cellPhone) : ''}</div>}</td>
                      <td className="px-4 py-3">
                        <select
                          value={a.role}
                          disabled={self || update.isPending}
                          title={self ? 'You cannot change your own access level' : undefined}
                          onChange={e => update.mutate({ id: a.id, patch: { role: e.target.value } })}
                          className="px-2 py-1 border border-gray-300 rounded-lg bg-white disabled:bg-gray-50"
                        >
                          {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={a.isProvider} disabled={update.isPending}
                          onChange={e => update.mutate({ id: a.id, patch: { isProvider: e.target.checked } })} aria-label={`${a.name} is a prescriber`} />
                      </td>
                      <td className="px-4 py-3">
                        {!a.active ? <Badge variant="neutral">Deactivated</Badge> : a.locked ? <Badge variant="danger">Locked</Badge> : <Badge variant="success">Active</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          {a.locked && <button onClick={() => unlock.mutate(a.id)} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-medium"><Unlock className="w-3.5 h-3.5" />Unlock</button>}
                          <button onClick={() => { setError(''); setPhones({ extension: a.extension ?? '', cellPhone: a.cellPhone ?? '' }); setPhoneFor(a); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-medium"><Phone className="w-3.5 h-3.5" />Phone numbers</button>
                          <button onClick={() => { setError(''); setResetFor(a); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-medium"><KeyRound className="w-3.5 h-3.5" />Reset password</button>
                          {!self && (
                            <button onClick={() => update.mutate({ id: a.id, patch: { active: !a.active } })} className="inline-flex items-center gap-1 text-gray-600 hover:underline text-xs font-medium">
                              {a.active ? <><UserX className="w-3.5 h-3.5" />Deactivate</> : <><UserCheck className="w-3.5 h-3.5" />Reactivate</>}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add user">
        <form onSubmit={e => { e.preventDefault(); create.mutate(undefined as never); }} className="space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <input className={inputCls} placeholder="Full name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} type="password" placeholder="Temporary password (10+ characters)" required minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}: {l.blurb}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Extension (optional)" inputMode="numeric" value={form.extension} onChange={e => setForm({ ...form, extension: e.target.value })} />
            <input className={inputCls} placeholder="Cell phone (optional)" value={form.cellPhone} onChange={e => setForm({ ...form, cellPhone: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isProvider} onChange={e => setForm({ ...form, isProvider: e.target.checked })} /> Prescriber (can be booked and receive transferred calls)</label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={create.isPending} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-60">Create user</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!phoneFor} onClose={() => setPhoneFor(null)} title={`Phone numbers for ${phoneFor?.name ?? ''}`}>
        <form onSubmit={e => { e.preventDefault(); savePhones.mutate(undefined as never); }} className="space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <label className="block text-sm text-gray-700">Office extension<input className={inputCls} inputMode="numeric" value={phones.extension} onChange={e => setPhones({ ...phones, extension: e.target.value })} /></label>
          <label className="block text-sm text-gray-700">Cell phone<input className={inputCls} value={phones.cellPhone} onChange={e => setPhones({ ...phones, cellPhone: e.target.value })} /></label>
          <p className="text-xs text-gray-500">Used when the phone assistant transfers a medication question to this person: the extension during office hours, the cell phone after hours. Leave blank to remove.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPhoneFor(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={savePhones.isPending} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-60">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset password for ${resetFor?.name ?? ''}`}>
        <form onSubmit={e => { e.preventDefault(); reset.mutate(undefined as never); }} className="space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <input className={inputCls} type="password" placeholder="New password (10+ characters)" required minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <p className="text-xs text-gray-500">This also unlocks the account. Share the new password securely.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setResetFor(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={reset.isPending} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-60">Reset password</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
