import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface Dispute {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  reporter: string;
  tripId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'open' | 'in_progress' | 'resolved' | 'all'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    disputeId: string;
    action: 'progress' | 'resolve';
  } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchDisputes();
  }, [tab]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const status = tab === 'all' ? '' : tab.toUpperCase();
      const response = await apiFetch<{ data: Dispute[] }>(
        `/admin/disputes?${status ? `status=${status}` : ''}`
      );
      setDisputes(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (disputeId: string, newStatus: string) => {
    try {
      await apiFetch(`/admin/disputes/${disputeId}`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      showToast(`Dispute ${newStatus.toLowerCase()}`, 'success');
      fetchDisputes();
      setConfirmDialog(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update dispute', 'error');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      case 'LOW':
        return 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400';
      case 'IN_PROGRESS':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      case 'RESOLVED':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const tabCounts = {
    all: disputes.length,
    open: disputes.filter((d) => d.status === 'OPEN').length,
    in_progress: disputes.filter((d) => d.status === 'IN_PROGRESS').length,
    resolved: disputes.filter((d) => d.status === 'RESOLVED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Disputes & Support
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage customer and driver disputes
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {[
          { key: 'all' as const, label: 'All', count: tabCounts.all },
          { key: 'open' as const, label: 'Open', count: tabCounts.open },
          { key: 'in_progress' as const, label: 'In Progress', count: tabCounts.in_progress },
          { key: 'resolved' as const, label: 'Resolved', count: tabCounts.resolved },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-primary text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            </div>
          ) : disputes.length > 0 ? (
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Reporter
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {disputes.map((dispute) => (
                  <tr
                    key={dispute.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {dispute.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {dispute.description.substring(0, 50)}...
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {dispute.reporter}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${getPriorityColor(
                          dispute.priority
                        )}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {dispute.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(
                          dispute.status
                        )}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {dispute.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(dispute.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedDispute(dispute)}
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-symbols-outlined text-xl">visibility</span>
                        </button>
                        {dispute.status === 'OPEN' && (
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                disputeId: dispute.id,
                                action: 'progress',
                              })
                            }
                            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {dispute.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                disputeId: dispute.id,
                                action: 'resolve',
                              })
                            }
                            className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-500">No disputes found</div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl text-white text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {confirmDialog.action === 'progress'
                ? 'Start Dispute Resolution?'
                : 'Mark as Resolved?'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              {confirmDialog.action === 'progress'
                ? 'This dispute will be moved to in progress status.'
                : 'This dispute will be marked as resolved.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const newStatus =
                    confirmDialog.action === 'progress' ? 'IN_PROGRESS' : 'RESOLVED';
                  handleStatusChange(confirmDialog.disputeId, newStatus);
                }}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-bold text-sm transition-colors ${
                  confirmDialog.action === 'progress'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Detail Modal */}
      {selectedDispute && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDispute(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Dispute Details
              </h3>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Title
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDispute.title}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Description
                </p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {selectedDispute.description}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Reporter
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDispute.reporter}
                </p>
              </div>
              {selectedDispute.tripId && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Trip ID
                  </p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white">
                    {selectedDispute.tripId}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Priority
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full mt-1 ${getPriorityColor(
                      selectedDispute.priority
                    )}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    {selectedDispute.priority}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full mt-1 ${getStatusColor(
                      selectedDispute.status
                    )}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    {selectedDispute.status}
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dates
                </p>
                <p className="text-sm text-slate-900 dark:text-white mt-2">
                  <span className="font-bold">Created:</span>{' '}
                  {new Date(selectedDispute.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-slate-900 dark:text-white">
                  <span className="font-bold">Updated:</span>{' '}
                  {new Date(selectedDispute.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
