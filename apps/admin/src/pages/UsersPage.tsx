import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { avatarUrl } from '@/lib/assets';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    userId: string;
    action: 'block' | 'unblock';
  } | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search, role, status]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(role && { role }),
        ...(status && { status }),
      });
      const response = await apiFetch<{ users: User[] }>(
        `/admin/users?${params}`
      );
      setUsers(response.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async (userId: string) => {
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: { status: 'SUSPENDED' },
      });
      showToast('User blocked successfully', 'success');
      fetchUsers();
      setConfirmDialog(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to block user', 'error');
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      });
      showToast('User reactivated successfully', 'success');
      fetchUsers();
      setConfirmDialog(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reactivate user', 'error');
    }
  };

  const exportCSV = () => {
    if (!users.length) return;
    const headers = ['Name', 'Email', 'Phone', 'Role', 'Status', 'Created Date'];
    const rows = users.map((u) => [
      u.name,
      u.email,
      u.phone,
      u.role,
      u.status,
      new Date(u.createdAt).toLocaleDateString(),
    ]);

    const csv =
      '\ufeff' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
      case 'PENDING_VERIFICATION':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            User &amp; Driver Management
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Monitor, verify and manage platform participants in real-time.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">file_download</span>
            Export Data
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-xl">add</span>
            Add New User
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex-1 min-w-[300px]">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              search
            </span>
            <input
              type="text"
              placeholder="Search by name, email, or ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-primary text-sm text-slate-900 dark:text-white placeholder-slate-500 transition-all"
            />
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              expand_more
            </span>
          </div>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
              className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all"
            >
              <option value="">All Types</option>
              <option value="CUSTOMER">Passenger</option>
              <option value="DRIVER">Driver</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              expand_more
            </span>
          </div>
          <button
            onClick={() => fetchUsers()}
            className="p-2.5 text-slate-500 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            </div>
          ) : users.length > 0 ? (
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
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      user.status === 'PENDING_VERIFICATION' ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={avatarUrl(user.name)} className="size-9 rounded-full object-cover" alt={user.name} />
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            {user.name}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-full capitalize">
                        {user.role === 'DRIVER' ? 'Driver' : 'Passenger'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm font-bold">4.8</span>
                        <span
                          className="material-symbols-outlined text-yellow-400 text-sm"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-sm">--</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(
                          user.status
                        )}`}
                      >
                        <span className={`size-1.5 rounded-full bg-current ${user.status === 'PENDING_VERIFICATION' ? 'animate-pulse' : ''}`}></span>
                        {user.status === 'PENDING_VERIFICATION' ? 'Pending Verification' : user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-symbols-outlined text-xl">visibility</span>
                        </button>
                        <button
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        {user.status === 'ACTIVE' ? (
                          <button
                            onClick={() =>
                              setConfirmDialog({ userId: user.id, action: 'block' })
                            }
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Block"
                          >
                            <span className="material-symbols-outlined text-xl">block</span>
                          </button>
                        ) : user.status === 'SUSPENDED' ? (
                          <button
                            onClick={() =>
                              setConfirmDialog({ userId: user.id, action: 'unblock' })
                            }
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors"
                            title="Reactivate"
                          >
                            Reactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-500">No users found</div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Showing <span className="font-bold text-slate-900 dark:text-white">1</span> to <span className="font-bold text-slate-900 dark:text-white">5</span> of <span className="font-bold text-slate-900 dark:text-white">1,420</span> results
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">
            1
          </button>
          <button className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-bold">
            2
          </button>
          <button className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-bold">
            3
          </button>
          <span className="px-2">...</span>
          <button className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-bold">
            284
          </button>
          <button
            onClick={() => setPage(page + 1)}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Total Users
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black">12,482</span>
            <span className="text-xs font-bold text-emerald-500 flex items-center gap-0.5 mb-1">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              12%
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Active Drivers
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black">1,240</span>
            <span className="text-xs font-bold text-emerald-500 flex items-center gap-0.5 mb-1">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              8%
            </span>
          </div>
        </div>
        <div className="bg-primary/10 border-primary/30 p-6 rounded-xl border shadow-sm">
          <p className="text-sm font-bold text-primary uppercase tracking-wider mb-1">
            Pending Verifications
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-primary">24</span>
            <span className="text-xs font-bold bg-primary text-white px-1.5 py-0.5 rounded-full mb-1">
              Action Required
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Avg. Platform Rating
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black">4.85</span>
            <div className="flex items-center text-yellow-400 mb-1">
              <span
                className="material-symbols-outlined text-sm"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
            </div>
          </div>
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
              {confirmDialog.action === 'block' ? 'Block User?' : 'Reactivate User?'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              {confirmDialog.action === 'block'
                ? 'This user will be blocked and unable to access the platform.'
                : 'This user will regain access to the platform.'}
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
                  if (confirmDialog.action === 'block') {
                    handleBlockUser(confirmDialog.userId);
                  } else {
                    handleUnblockUser(confirmDialog.userId);
                  }
                }}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-bold text-sm transition-colors ${
                  confirmDialog.action === 'block'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                User Details
              </h3>
              <button
                onClick={() => setSelectedUser(null)}
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
                  {selectedUser.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Email
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedUser.email}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Phone
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedUser.phone}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Role
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                  {selectedUser.role}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Status
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full mt-1 ${getStatusColor(
                    selectedUser.status
                  )}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {selectedUser.status}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Joined
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {new Date(selectedUser.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
