import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface OtpLog {
  id: string;
  phone: string;
  otpRef: string;
  attemptCount: number;
  usedAt: string | null;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
}

export default function OtpLogsPage() {
  const [logs, setLogs] = useState<OtpLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchLogs = async (p = 1, phone = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (phone) params.set('phone', phone);
      const res = await apiFetch<any>(`/admin/otp-logs?${params}`);
      setLogs(res.logs || []);
      setTotal(res.meta?.total || 0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(1); }, []);

  const handleSearch = () => { setPage(1); fetchLogs(1, phoneFilter); };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const getStatus = (log: OtpLog) => {
    if (log.usedAt) return { label: 'ใช้แล้ว', color: 'bg-green-100 text-green-700' };
    if (isExpired(log.expiresAt)) return { label: 'หมดอายุ', color: 'bg-slate-100 text-slate-500' };
    if (log.attemptCount >= 5) return { label: 'ล็อก', color: 'bg-red-100 text-red-600' };
    if (log.attemptCount > 0) return { label: `${log.attemptCount} ครั้ง`, color: 'bg-amber-100 text-amber-700' };
    return { label: 'รอดำเนินการ', color: 'bg-blue-100 text-blue-700' };
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">OTP Logs</h1>
        <p className="text-gray-500 text-sm mt-1">ประวัติการส่ง OTP ทั้งหมด (ไม่แสดงรหัส OTP จริง)</p>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={phoneFilter}
          onChange={e => setPhoneFilter(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="ค้นหาด้วยเบอร์โทรศัพท์..."
          className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition"
        >
          ค้นหา
        </button>
        <button
          onClick={() => { setPhoneFilter(''); fetchLogs(1); }}
          className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          รีเซ็ต
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'ทั้งหมด', value: total, color: 'text-slate-700' },
          { label: 'ใช้แล้ว', value: logs.filter(l => l.usedAt).length, color: 'text-green-600' },
          { label: 'หมดอายุ', value: logs.filter(l => !l.usedAt && isExpired(l.expiresAt)).length, color: 'text-slate-500' },
          { label: 'พยายาม > 0', value: logs.filter(l => l.attemptCount > 0).length, color: 'text-amber-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 font-semibold uppercase mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">ไม่พบข้อมูล</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">เบอร์โทรศัพท์</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Ref</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">สถานะ</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">พยายาม</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">IP</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">สร้างเมื่อ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">ใช้เมื่อ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">หมดอายุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {logs.map(log => {
                  const status = getStatus(log);
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{log.phone}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{log.otpRef}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${log.attemptCount >= 5 ? 'text-red-500' : log.attemptCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {log.attemptCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ipAddress || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-green-600">{log.usedAt ? formatDate(log.usedAt) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(log.expiresAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => { setPage(p => p - 1); fetchLogs(page - 1, phoneFilter); }}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-40 hover:bg-gray-50 transition"
          >
            ก่อนหน้า
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">หน้า {page} / {Math.ceil(total / 50)}</span>
          <button
            onClick={() => { setPage(p => p + 1); fetchLogs(page + 1, phoneFilter); }}
            disabled={page >= Math.ceil(total / 50)}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-40 hover:bg-gray-50 transition"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
