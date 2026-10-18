import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, ShieldCheck, ShieldAlert } from 'lucide-react';
import { auditApi, errorMessage, usersApi, type AuditFilters } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime } from '../lib/utils';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

interface AuditRow {
  id: number; at: string; actorType: string; actorId: string | null; actorEmail: string | null; actorRole: string | null;
  action: string; resource: string | null; resourceId: string | null; patientId: string | null;
  outcome: 'success' | 'denied' | 'failed'; statusCode: number | null; ip: string | null; detail: string | null;
  patient?: { firstName: string; lastName: string; mrn: string } | null;
}

const label = (s: string) => s.replace(/^assistant_/, 'assistant: ').replace(/_/g, ' ');
const inputCls = 'px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function AuditLog() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [integrity, setIntegrity] = useState<{ ok: boolean; checked: number; brokenAtId?: number; reason?: string } | null>(null);
  const [busy, setBusy] = useState<'verify' | 'export' | null>(null);
  const [problem, setProblem] = useState('');

  const filters: AuditFilters = {
    from: params.get('from') || undefined, to: params.get('to') || undefined, actorId: params.get('actorId') || undefined,
    patientId: params.get('patientId') || undefined, action: params.get('action') || undefined, outcome: params.get('outcome') || undefined,
  };
  const set = (key: keyof AuditFilters, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const isSuper = user?.role === 'superuser';
  const log = useQuery({ queryKey: ['audit', filters, page], queryFn: () => auditApi.list({ ...filters, page, limit: 50 }), enabled: isSuper });
  const actions = useQuery({ queryKey: ['audit-actions'], queryFn: auditApi.actions, enabled: isSuper });
  const people = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: isSuper });

  if (!isSuper) return <Card><p className="text-sm text-gray-500">Only a superuser can view the audit log.</p></Card>;

  const rows: AuditRow[] = log.data?.data ?? [];
  const totalPages: number = log.data?.totalPages ?? 1;
  const hasFilters = Object.values(filters).some(Boolean);

  async function verify() {
    setBusy('verify'); setProblem('');
    try { setIntegrity(await auditApi.verify()); } catch (e) { setProblem(errorMessage(e)); } finally { setBusy(null); }
  }
  async function exportCsv() {
    setBusy('export'); setProblem('');
    try { await auditApi.exportCsv(filters); } catch (e) { setProblem(errorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">From<input type="date" className={`${inputCls} block mt-1`} value={filters.from ?? ''} onChange={e => set('from', e.target.value)} /></label>
          <label className="text-xs text-gray-600">To<input type="date" className={`${inputCls} block mt-1`} value={filters.to ?? ''} onChange={e => set('to', e.target.value)} /></label>
          <label className="text-xs text-gray-600">Person
            <select className={`${inputCls} block mt-1`} value={filters.actorId ?? ''} onChange={e => set('actorId', e.target.value)}>
              <option value="">Everyone</option>
              {(people.data?.data ?? []).map((u: { id: string; name: string; email: string }) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Action
            <select className={`${inputCls} block mt-1`} value={filters.action ?? ''} onChange={e => set('action', e.target.value)}>
              <option value="">All actions</option>
              {(actions.data?.data ?? []).map((a: { action: string }) => <option key={a.action} value={a.action}>{label(a.action)}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Result
            <select className={`${inputCls} block mt-1`} value={filters.outcome ?? ''} onChange={e => set('outcome', e.target.value)}>
              <option value="">All</option><option value="success">Success</option><option value="denied">Denied</option><option value="failed">Failed</option>
            </select>
          </label>
          {hasFilters && <button onClick={() => { setParams({}, { replace: true }); setPage(1); }} className="text-sm text-blue-600 hover:underline pb-2">Clear filters</button>}
          <div className="ml-auto flex gap-2">
            <button onClick={verify} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-60">
              <ShieldCheck className="w-4 h-4" />{busy === 'verify' ? 'Checking…' : 'Verify integrity'}
            </button>
            <button onClick={exportCsv} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Download className="w-4 h-4" />{busy === 'export' ? 'Preparing…' : 'Export CSV'}
            </button>
          </div>
        </div>
        {filters.patientId && <p className="mt-3 text-sm text-gray-600">Showing everything recorded for one patient. <Link to={`/patients/${filters.patientId}`} className="text-blue-600 hover:underline">Open patient</Link></p>}
      </Card>

      {problem && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{problem}</div>}
      {integrity && (integrity.ok ? (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />
          Log is intact: all {integrity.checked.toLocaleString()} entries check out. None has been changed or removed.</div>
      ) : (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800 flex items-start gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span><strong>Tampering detected</strong> at entry #{integrity.brokenAtId}. {integrity.reason} Preserve the database and investigate.</span></div>
      ))}

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>{['When', 'Who', 'Action', 'Record', 'Patient', 'Result', 'From'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {log.isLoading && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading…</td></tr>}
              {log.isError && <tr><td colSpan={7} className="py-8 text-center text-red-600">Could not load the audit log.</td></tr>}
              {!log.isLoading && !log.isError && rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No entries match.</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className={r.outcome === 'success' ? '' : r.outcome === 'denied' ? 'bg-red-50/50' : 'bg-yellow-50/50'}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatDateTime(r.at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-gray-900">{r.actorType === 'assistant' ? 'Voice assistant' : r.actorEmail ?? 'Unknown'}</div>
                    {r.actorRole && <div className="text-xs text-gray-500">{r.actorRole}</div>}
                  </td>
                  <td className="px-4 py-2.5"><div className="font-medium text-gray-900 capitalize">{label(r.action)}</div>{r.detail && <div className="text-xs text-gray-500 max-w-xs truncate" title={r.detail}>{r.detail}</div>}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.resource ?? '—'}</td>
                  <td className="px-4 py-2.5">{r.patient ? <Link to={`/audit?patientId=${r.patientId}`} className="text-blue-600 hover:underline" onClick={() => { setPage(1); }}>{r.patient.firstName} {r.patient.lastName} <span className="text-xs text-gray-400">{r.patient.mrn}</span></Link> : r.patientId ? <span className="text-xs text-gray-400">removed record</span> : '—'}</td>
                  <td className="px-4 py-2.5"><Badge variant={r.outcome === 'success' ? 'success' : r.outcome === 'denied' ? 'danger' : 'warning'}>{r.outcome}</Badge></td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">{(log.data?.total ?? 0).toLocaleString()} entries · page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-gray-300 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-gray-300 disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </Card>
      <p className="text-xs text-gray-500">Entries record who did what and when. They never contain patient details, only which record was involved. They cannot be edited or deleted.</p>
    </div>
  );
}
