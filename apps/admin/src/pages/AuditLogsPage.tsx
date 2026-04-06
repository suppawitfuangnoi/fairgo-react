import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user?: { name: string | null; phone: string } | null;
}

interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_COLOR: Record<string, string> = {
  APPROVE_DRIVER:            'bg-emerald-100 text-emerald-700',
  REJECT_DRIVER:             'bg-red-100 text-red-700',
  SUSPEND_USER:              'bg-orange-100 text-orange-700',
  UNSUSPEND_USER:            'bg-sky-100 text-sky-700',
  FLAG_USER:                 'bg-rose-100 text-rose-700',
  UNFLAG_USER:               'bg-slate-100 text-slate-600',
  FLAG_DRIVER:               'bg-rose-100 text-rose-700',
  UNFLAG_DRIVER:             'bg-slate-100 text-slate-600',
  DISPUTE_RESOLVED:          'bg-violet-100 text-violet-700',
  UPDATE_USER:               'bg-blue-100 text-blue-700',
  UPDATE_USER_STATUS_ACTIVE: 'bg-emerald-100 text-emerald-700',
  UPDATE_USER_STATUS_SUSPENDED: 'bg-red-100 text-red-700',
  ADMIN_OVERRIDE:            'bg-amber-100 text-amber-700',
  OTP_UNLOCK:                'bg-cyan-100 text-cyan-700',
};

const ACTION_GROUPS = [
  'APPROVE_DRIVER', 'REJECT_DRIVER',
  'SUSPEND_USER', 'UNSUSPEND_USER',
  'FLAG_USER', 'UNFLAG_USER', 'FLAG_DRIVER', 'UNFLAG_DRIVER',
  'DISPUTE_RESOLVED', 'ADMIN_OVERRIDE',
  'UPDATE_USER', 'OTP_UNLOCK',
];

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entity', entityFilter);
      const res = await apiFetch<{ logs: AuditLog[]; meta: Meta }>(`/admin/audit-logs?${params}`);
      setLogs(res.logs || []);
      setMeta(res.meta || meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatData = (data: Record<string, unknown> | null) => {
    if (!data) return null;
    return JSON.stringify(data, null, 2);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Audit Logs
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Complete record of all admin-sensitive actions — actor, entity, before/after state.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary"
        >
          <option value="">All Actions</option>
          {ACTION_GROUPS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary"
        >
          <option value="">All Entities</option>
          {['User', 'DriverProfile', 'Trip', 'Payment', 'OtpCode'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <button
          onClick={() => { setActionFilter(''); setEntityFilter(''); setPage(1); }}
          className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Clear Filters
        </button>

        <div className="ml-auto text-sm text-slate-500 self-center">
          {meta.total} total records
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actor</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity ID</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">IP</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading && !logs.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : !logs.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">No audit logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {log.user?.name ?? 'System'}
                        </div>
                        {log.user?.phone && (
                          <div className="text-[10px] text-slate-400">{log.user.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-600'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
                        {log.entity}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-slate-500">
                          {log.entityId ? log.entityId.slice(0, 12) + '…' : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(log.oldData || log.newData) && (
                          <span className={`material-symbols-outlined text-slate-400 text-base transition-transform ${
                            expandedId === log.id ? 'rotate-180' : ''
                          }`}>expand_more</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded diff row */}
                    {expandedId === log.id && (log.oldData || log.newData) && (
                      <tr key={`${log.id}-expanded`} className="bg-slate-50 dark:bg-slate-700/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {log.oldData && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Before</p>
                                <pre className="bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-300 text-xs rounded-lg p-3 overflow-x-auto max-h-40 whitespace-pre-wrap">
                                  {formatData(log.oldData)}
                                </pre>
                              </div>
                            )}
                            {log.newData && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">After</p>
                                <pre className="bg-emerald-50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg p-3 overflow-x-auto max-h-40 whitespace-pre-wrap">
                                  {formatData(log.newData)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
