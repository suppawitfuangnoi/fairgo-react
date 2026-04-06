import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { avatarUrl } from '@/lib/assets';

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehiclePlate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rating: number;
  trips: number;
  userId: string;
  isFlagged?: boolean;
  rejectionReason?: string | null;
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    driverId: string;
    action: 'approve' | 'reject';
  } | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  // Rejection reason modal
  const [rejectModal, setRejectModal] = useState<{ driverId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // Flag modal
  const [flagModal, setFlagModal] = useState<{ driverId: string; name: string; currently: boolean } | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchDrivers();
  }, [tab]);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      let statusParam = '';
      if (tab === 'all') {
        statusParam = '';
      } else if (tab === 'approved') {
        statusParam = 'APPROVED';
      } else {
        statusParam = tab.toUpperCase();
      }
      const response = await apiFetch<{ drivers: Driver[] }>(
        `/admin/drivers?${statusParam ? `status=${statusParam}` : ''}`
      );
      setDrivers(response.drivers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (driverId: string) => {
    try {
      await apiFetch(`/admin/drivers/${driverId}/verify`, {
        method: 'POST',
        body: { status: 'APPROVED' },
      });
      showToast('Driver approved successfully', 'success');
      fetchDrivers();
      setConfirmDialog(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to approve driver', 'error');
    }
  };

  const handleReject = async (driverId: string) => {
    try {
      await apiFetch(`/admin/drivers/${driverId}/verify`, {
        method: 'POST',
        body: { status: 'REJECTED' },
      });
      showToast('Driver rejected', 'success');
      fetchDrivers();
      setConfirmDialog(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject driver', 'error');
    }
  };

  const handleRejectWithReason = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setRejectLoading(true);
    try {
      await apiFetch(`/admin/drivers/${rejectModal.driverId}/verify`, {
        method: 'POST',
        body: { status: 'REJECTED', rejectionReason: rejectReason.trim() },
      });
      showToast(`${rejectModal.name} rejected`);
      setRejectModal(null);
      setRejectReason('');
      fetchDrivers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject driver', 'error');
    } finally {
      setRejectLoading(false);
    }
  };

  const handleFlagToggle = async () => {
    if (!flagModal) return;
    if (!flagModal.currently && !flagReason.trim()) return;
    setFlagLoading(true);
    try {
      await apiFetch(`/admin/drivers/${flagModal.driverId}/flag`, {
        method: 'POST',
        body: flagModal.currently ? { flagged: false } : { flagged: true, reason: flagReason.trim() },
      });
      showToast(flagModal.currently ? 'Flag cleared' : `${flagModal.name} flagged`);
      setFlagModal(null);
      setFlagReason('');
      fetchDrivers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update flag', 'error');
    } finally {
      setFlagLoading(false);
    }
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'APPROVED':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
      case 'PENDING':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      case 'REJECTED':
        return 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('');

  const tabCounts = {
    all: drivers.length,
    pending: drivers.filter((d) => d.status === 'PENDING').length,
    approved: drivers.filter((d) => d.status === 'APPROVED').length,
    rejected: drivers.filter((d) => d.status === 'REJECTED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          User &amp; Driver Management
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Monitor, verify and manage platform participants in real-time.
        </p>
      </div>

      {/* Filters Section */}
      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <select
            value={tab === 'all' ? '' : tab.toUpperCase()}
            onChange={(e) => {
              if (e.target.value === '') setTab('all');
              else setTab(e.target.value.toLowerCase() as any);
            }}
            className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            expand_more
          </span>
        </div>
        <div className="relative">
          <select
            className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all"
          >
            <option>All Types</option>
            <option>Driver</option>
            <option>Passenger</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            expand_more
          </span>
        </div>
        <div className="relative">
          <select
            className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all"
          >
            <option>Rating: Any</option>
            <option>4.5+</option>
            <option>4.0+</option>
            <option>3.0+</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            star
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            </div>
          ) : drivers.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                    Rating
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                    Total Trips
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {drivers.map((driver) => (
                  <tr
                    key={driver.id}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      driver.status === 'PENDING' ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={avatarUrl(driver.name)} className="size-9 rounded-full object-cover" alt={driver.name} />
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            {driver.name}
                          </p>
                          <p className="text-xs text-slate-500">{driver.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-full">
                        Driver
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm font-bold">{driver.rating}</span>
                        <span
                          className="material-symbols-outlined text-yellow-400 text-sm"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-sm">
                      {driver.trips}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(
                          driver.status
                        )}`}
                      >
                        <span className={`size-1.5 rounded-full bg-current ${driver.status === 'PENDING' ? 'animate-pulse' : ''}`}></span>
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedDriver(driver)}
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="View Details"
                        >
                          <span className="material-symbols-outlined text-xl">visibility</span>
                        </button>
                        <button
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        {/* Flag / unflag */}
                        <button
                          onClick={() => setFlagModal({ driverId: driver.id, name: driver.name, currently: !!driver.isFlagged })}
                          className={`p-1.5 transition-colors ${driver.isFlagged ? 'text-rose-500 hover:text-rose-700' : 'text-slate-400 hover:text-rose-500'}`}
                          title={driver.isFlagged ? 'Remove flag' : 'Flag driver'}
                        >
                          <span className="material-symbols-outlined text-xl">flag</span>
                        </button>
                        {driver.status !== 'APPROVED' && (
                          <button
                            onClick={() =>
                              setConfirmDialog({ driverId: driver.id, action: 'approve' })
                            }
                            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                          >
                            Verify
                          </button>
                        )}
                        {driver.status !== 'REJECTED' && (
                          <button
                            onClick={() => setRejectModal({ driverId: driver.id, name: driver.name })}
                            className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-500">No drivers found</div>
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
              {confirmDialog.action === 'approve'
                ? 'Verify Driver?'
                : 'Reject Driver?'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              {confirmDialog.action === 'approve'
                ? 'This driver will be verified and can start accepting trips.'
                : 'This driver will be rejected and their application will be declined.'}
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
                  if (confirmDialog.action === 'approve') {
                    handleApprove(confirmDialog.driverId);
                  } else {
                    handleReject(confirmDialog.driverId);
                  }
                }}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-bold text-sm transition-colors ${
                  confirmDialog.action === 'approve'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Detail Modal */}
      {selectedDriver && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDriver(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Driver Details
              </h3>
              <button
                onClick={() => setSelectedDriver(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Name
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDriver.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Phone
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDriver.phone}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Vehicle
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDriver.vehicleType}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  License Plate
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDriver.vehiclePlate}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rating
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedDriver.rating}
                  </span>
                  <span
                    className="material-symbols-outlined text-yellow-400 text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Total Trips
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedDriver.trips}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Status
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full mt-1 ${getStatusColor(
                    selectedDriver.status
                  )}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {selectedDriver.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject with reason modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-1">
              Reject Driver
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Provide a reason for rejecting <span className="font-bold text-slate-700 dark:text-slate-200">{rejectModal.name}</span>. This will be stored with their profile.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete documentation, blurry license photo..."
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-red-400 outline-none resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 mb-4">{rejectReason.trim().length}/500 characters</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectWithReason}
                disabled={rejectLoading || !rejectReason.trim() || rejectReason.trim().length > 500}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {rejectLoading ? 'Rejecting…' : 'Reject Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag / unflag modal */}
      {flagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-1">
              {flagModal.currently ? 'Remove Flag' : 'Flag Driver'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {flagModal.currently
                ? `Clear the suspicious flag on ${flagModal.name}?`
                : `Flag ${flagModal.name} as suspicious. Provide a reason.`}
            </p>
            {!flagModal.currently && (
              <>
                <textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="e.g. Multiple complaints, suspicious behaviour..."
                  rows={3}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-400 outline-none resize-none"
                />
                <p className="text-xs text-slate-400 mt-1 mb-4">{flagReason.trim().length}/500 characters</p>
              </>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setFlagModal(null); setFlagReason(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagToggle}
                disabled={flagLoading || (!flagModal.currently && (!flagReason.trim() || flagReason.trim().length > 500))}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  flagModal.currently ? 'bg-slate-500 hover:bg-slate-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {flagLoading ? 'Saving…' : flagModal.currently ? 'Remove Flag' : 'Flag Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
