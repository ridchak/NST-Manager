import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MapPin, Pencil, Phone, PhoneForwarded, Printer } from 'lucide-react';
import { errorMessage, practiceApi, type PracticeDetails } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import Card, { CardBody, CardHeader } from './ui/Card';

const DAYS = [
  { n: 1, name: 'Monday' }, { n: 2, name: 'Tuesday' }, { n: 3, name: 'Wednesday' }, { n: 4, name: 'Thursday' },
  { n: 5, name: 'Friday' }, { n: 6, name: 'Saturday' }, { n: 0, name: 'Sunday' },
];
const ZONES: Array<[string, string]> = [
  ['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii'],
];
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const input = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Form = {
  name: string; street: string; suite: string; city: string; state: string; zip: string; phone: string; fax: string; timezone: string;
  hours: Record<string, [string, string] | null>;
  extFrontDesk: string; extScheduling: string; extMedications: string; extBilling: string; notificationEmail: string;
};

const DEPARTMENTS: Array<{ key: 'extFrontDesk' | 'extScheduling' | 'extMedications' | 'extBilling'; label: string; help: string }> = [
  { key: 'extFrontDesk', label: 'Front desk', help: 'General questions, anything else, or asking for a person' },
  { key: 'extScheduling', label: 'Scheduling', help: 'New patients, sooner appointments, rescheduling, or a different provider' },
  { key: 'extMedications', label: 'Medications & prior authorization', help: 'Medication questions and prior authorizations' },
  { key: 'extBilling', label: 'Billing', help: 'Billing questions' },
];

const toForm = (p: PracticeDetails): Form => ({
  name: p.name, street: p.street, suite: p.suite ?? '', city: p.city, state: p.state, zip: p.zip,
  phone: p.phoneDisplay, fax: p.faxDisplay ?? '', timezone: p.timezone, hours: p.hoursByDay,
  extFrontDesk: p.extFrontDesk ?? '', extScheduling: p.extScheduling ?? '', extMedications: p.extMedications ?? '', extBilling: p.extBilling ?? '',
  notificationEmail: p.notificationEmail ?? '',
});

export default function PracticePanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: p, isLoading, isError } = useQuery({ queryKey: ['practice'], queryFn: practiceApi.get });
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const canEdit = user?.role === 'superuser';

  const save = useMutation({
    mutationFn: (f: Form) => practiceApi.save({ ...f, suite: f.suite || null, fax: f.fax || null, notificationEmail: f.notificationEmail || null }),
    onSuccess: () => { setForm(null); setError(''); qc.invalidateQueries({ queryKey: ['practice'] }); },
    onError: e => setError(errorMessage(e)),
  });

  if (isLoading) return <Card><p className="text-sm text-gray-400">Loading…</p></Card>;
  if (isError || !p) return <Card><p className="text-sm text-red-600">Could not load the practice details.</p></Card>;

  const setHours = (day: number, value: [string, string] | null) => setForm(f => f && ({ ...f, hours: { ...f.hours, [day]: value } }));

  return (
    <div className="space-y-4">
      {p.overriddenByEnvironment && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          The server has an hours override set (OFFICE_HOURS / OFFICE_TZ), so the phone assistant is using that instead of the hours below.
        </div>
      )}

      {!form ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                {canEdit && <button onClick={() => { setError(''); setForm(toForm(p)); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"><Pencil className="w-4 h-4" />Edit</button>}
              </div>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-3 text-sm">
                <div className="flex gap-3"><MapPin className="w-5 h-5 text-blue-600 shrink-0" /><div><dt className="text-gray-500">Address</dt><dd className="text-gray-900">{p.street}{p.suite ? `, ${p.suite}` : ''}<br />{p.city}, {p.state} {p.zip}</dd></div></div>
                <div className="flex gap-3"><Phone className="w-5 h-5 text-blue-600 shrink-0" /><div><dt className="text-gray-500">Phone</dt><dd className="text-gray-900">{p.phoneDisplay}</dd></div></div>
                <div className="flex gap-3"><Printer className="w-5 h-5 text-blue-600 shrink-0" /><div><dt className="text-gray-500">Fax</dt><dd className="text-gray-900">{p.faxDisplay ?? '—'}</dd></div></div>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900 flex items-center gap-2"><PhoneForwarded className="w-4 h-4 text-blue-600" />Call routing</h3></CardHeader>
            <CardBody>
              <table className="text-sm w-full">
                <tbody>
                  {DEPARTMENTS.map(d => (
                    <tr key={d.key} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-6 font-medium text-gray-900 whitespace-nowrap">{d.label}</td>
                      <td className="py-2 pr-6 text-gray-900">{p[d.key] ? `ext ${p[d.key]}` : <span className="text-gray-400">not set</span>}</td>
                      <td className="py-2 text-gray-500">{d.help}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-3">During office hours the phone assistant transfers callers to these extensions. After hours it takes a message instead. {p.notificationEmail ? `New-request notices are emailed to ${p.notificationEmail} (no patient details are ever included).` : 'No notification email is set.'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600" />Office hours</h3></CardHeader>
            <CardBody>
              <table className="text-sm">
                <tbody>
                  {DAYS.map(d => {
                    const h = p.hoursByDay[String(d.n)];
                    return <tr key={d.n}><td className="pr-8 py-1 text-gray-600">{d.name}</td><td className={h ? 'text-gray-900' : 'text-gray-400'}>{h ? `${clock(h[0])} to ${clock(h[1])}` : 'Closed'}</td></tr>;
                  })}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-3">Times are {ZONES.find(z => z[0] === p.timezone)?.[1] ?? p.timezone} time. The phone assistant uses these hours to decide whether the office is open, so keep them current (for example on holidays).</p>
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <label className="block text-sm text-gray-700">Practice name<input className={input} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm text-gray-700 sm:col-span-2">Street<input className={input} required value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">Suite<input className={input} value={form.suite} onChange={e => setForm({ ...form, suite: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">City<input className={input} required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">State<input className={input} required maxLength={2} value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })} /></label>
              <label className="block text-sm text-gray-700">ZIP<input className={input} required inputMode="numeric" maxLength={5} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">Phone<input className={input} required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">Fax<input className={input} value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">Time zone
                <select className={input} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>
                  {ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  {!ZONES.some(z => z[0] === form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                </select>
              </label>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Call routing (office extensions)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEPARTMENTS.map(d => (
                  <label key={d.key} className="block text-sm text-gray-700">{d.label}
                    <input className={input} inputMode="numeric" placeholder="e.g. 101" value={form[d.key]} onChange={e => setForm({ ...form, [d.key]: e.target.value })} />
                    <span className="text-xs text-gray-500">{d.help}</span>
                  </label>
                ))}
              </div>
              <label className="block text-sm text-gray-700 mt-3">Email for new-request notices
                <input className={input} type="email" placeholder="info@yourpractice.com" value={form.notificationEmail} onChange={e => setForm({ ...form, notificationEmail: e.target.value })} />
                <span className="text-xs text-gray-500">Contains no patient details, only that a request is waiting in the app. Requires email (SMTP) to be set up on the server.</span>
              </label>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Office hours</p>
              <div className="space-y-2">
                {DAYS.map(d => {
                  const h = form.hours[String(d.n)];
                  return (
                    <div key={d.n} className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="w-24 text-gray-700">{d.name}</span>
                      <label className="flex items-center gap-1.5 text-gray-600"><input type="checkbox" checked={!!h} onChange={e => setHours(d.n, e.target.checked ? ['08:00', '17:00'] : null)} />Open</label>
                      {h ? (
                        <>
                          <input type="time" required aria-label={`${d.name} opens`} className="px-2 py-1 border border-gray-300 rounded-lg" value={h[0]} onChange={e => setHours(d.n, [e.target.value, h[1]])} />
                          <span className="text-gray-500">to</span>
                          <input type="time" required aria-label={`${d.name} closes`} className="px-2 py-1 border border-gray-300 rounded-lg" value={h[1]} onChange={e => setHours(d.n, [h[0], e.target.value])} />
                        </>
                      ) : <span className="text-gray-400">Closed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
              <button type="submit" disabled={save.isPending} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">Save</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
