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
  isFlagged?: boolean;
  flagReason?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    userId: string;
    action: 'block' | 'unblock';
  } | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Add User modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', role: 'CUSTOMER', password: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Edit User modal
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: '', status: '' });
  const [editLoading, setEditLoading] = useState(false);

  // Suspend with reason modal
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Flag modal
  const [flagModal, setFlagModal] = useState<{ userId: string; name: string; currently: boolean } | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);

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
      const response = await apiFetch<{ users: User[]; meta: { total: number; totalPages: number; page: number } }>(
        `/admin/users?${params}`
      );
      setUsers(response.users || []);
      if (response.meta) {
        setTotal(response.meta.total);
        setTotalPages(response.meta.totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!addForm.name || !addForm.phone) { showToast('Name and phone are required', 'error'); return; }
    setAddLoading(true);
    try {
      await apiFetch('/admin/users', { method: 'POST', body: addForm });
      showToast('User created successfully');
      setShowAddModal(false);
      setAddForm({ name: '', phone: '', email: '', role: 'CUSTOMER', password: '' });
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create user', 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditUser = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      await apiFetch(`/admin/users/${editUser.id}`, { method: 'PATCH', body: editForm });
      showToast('User updated successfully');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditUser(user);
    setEditForm({ name: user.name, email: user.email || '', phone: user.phone || '', role: user.role, status: user.status });
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

  const handleSuspendWithReason = async () => {
    if (!suspendModal || !suspendReason.trim()) return;
    setSuspendLoading(true);
    try {
      await apiFetch(`/admin/users/${suspendModal.userId}/suspend`, {
        method: 'POST',
        body: { reason: suspendReason.trim() },
      });
      showToast(`${suspendModal.name} suspended`);
      setSuspendModal(null);
      setSuspendReason('');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to suspend user', 'error');
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleUnsuspend = async (userId: string) => {
    try {
      await apiFetch(`/admin/users/${userId}/unsuspend`, { method: 'POST' });
      showToast('User reinstated');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to unsuspend user', 'error');
    }
  };

  const handleFlagToggle = async () => {
    if (!flagModal) return;
    if (flagModal.currently === false && !flagReason.trim()) return;
    setFlagLoading(true);
    try {
      await apiFetch(`/admin/users/${flagModal.userId}/flag`, {
        method: 'POST',
        body: flagModal.currently ? { flagged: false } : { flagged: true, reason: flagReason.trim() },
      });
      showToast(flagModal.currently ? 'Flag cleared' : `${flagModal.name} flagged`);
      setFlagModal(null);
      setFlagReason('');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update flag', 'error');
    } finally {
      setFlagLoading(false);
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
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
          >
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
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(
                            user.status
                          )}`}
                        >
                          <span className={`size-1.5 rounded-full bg-current ${user.status === 'PENDING_VERIFICATION' ? 'animate-pulse' : ''}`}></span>
                          {user.status === 'PENDING_VERIFICATION' ? 'Pending Verification' : user.status}
                        </span>
                        {user.isFlagged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
                            <span className="material-symbols-outlined text-[10px]">flag</span>
                            Flagged
                          </span>
                        )}
                        {user.suspendedReason && user.status === 'SUSPENDED' && (
                          <span className="text-[10px] text-slate-400 italic max-w-[140px] truncate" title={user.suspendedReason}>
                            {user.suspendedReason}
                          </span>
                        )}
                      </div>
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
                          onClick={() => openEditModal(user)}
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        {/* Flag / Unflag */}
                        <button
                          onClick={() => setFlagModal({ userId: user.id, name: user.name, currently: !!user.isFlagged })}
                          className={`p-1.5 transition-colors ${user.isFlagged ? 'text-rose-500 hover:text-rose-700' : 'text-slate-400 hover:text-rose-500'}`}
                          title={user.isFlagged ? 'Remove flag' : 'Flag user'}
                        >
                          <span className="material-symbols-outlined text-xl">flag</span>
                        </button>
                        {user.status === 'ACTIVE' ? (
                          <button
                            onClick={() => setSuspendModal({ userId: user.id, name: user.name })}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Suspend with reason"
                          >
                            <span className="material-symbols-outlined text-xl">block</span>
                          </button>
                        ) : user.status === 'SUSPENDED' ? (
                          <button
                            onClick={() => handleUnsuspend(user.id)}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors"
                            title="Reinstate"
                          >
                            Reinstate
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
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">
          Page <span className="font-bold text-slate-900 dark:text-white">{page}</span> of{' '}
          <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span>
          {total > 0 && (
            <> · <span className="font-bold text-slate-900 dark:text-white">{total.toLocaleString()}</span> total users</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          {/* Page number buttons — show up to 5 around current page */}
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  p === page
                    ? 'bg-primary text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && page < totalPages - 2 && (
            <>
              <span className="px-1 text-slate-400">...</span>
              <button onClick={() => setPage(totalPages)} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300">
                {totalPages}
              </button>
            </>
          )}
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
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

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New User</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'name', label: 'Full Name', type: 'text', placeholder: 'John Doe' },
                { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+66812345678' },
                { key: 'email', label: 'Email (optional)', type: 'email', placeholder: 'user@example.com' },
                { key: 'password', label: 'Password', type: 'password', placeholder: 'Temporary password' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
                  <input
                    type={type}
                    value={addForm[key as keyof typeof addForm]}
                    onChange={e => setAddForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Role</label>
                <select
                  value={addForm.role}
                  onChange={e => setAddForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="CUSTOMER">Customer (Passenger)</option>
                  <option value="DRIVER">Driver</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm">Cancel</button>
              <button
                onClick={handleAddUser}
                disabled={addLoading}
                className="flex-[2] px-4 py-2.5 bg-primary text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit User</h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'name', label: 'Full Name', type: 'text' },
                { key: 'phone', label: 'Phone', type: 'tel' },
                { key: 'email', label: 'Email', type: 'email' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key as keyof typeof editForm]}
                    onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="PENDING_VERIFICATION">Pending Verification</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUser(null)} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm">Cancel</button>
              <button
                onClick={handleEditUser}
                disabled={editLoading}
                className="flex-[2] px-4 py-2.5 bg-primary text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Suspend with reason modal ── */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-orange-500 text-2xl">block</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Suspend User</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Suspending <span className="font-bold text-slate-800 dark:text-slate-200">{suspendModal.name}</span>. Please provide a reason for the audit log.
            </p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Suspension reason (required)…"
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm mb-4 focus:ring-2 focus:ring-orange-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setSuspendModal(null); setSuspendReason(''); }}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspendWithReason}
                disabled={suspendLoading || !suspendReason.trim()}
                className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-orange-600 transition-colors"
              >
                {suspendLoading ? 'Suspending…' : 'Confirm Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Flag / unflag modal ── */}
      {flagModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-rose-500 text-2xl">flag</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {flagModal.currently ? 'Remove Flag' : 'Flag User'}
              </h3>
            </div>
            {flagModal.currently ? (
              <p className="text-sm text-slate-500 mb-6">
                Remove flag from <span className="font-bold text-slate-800 dark:text-slate-200">{flagModal.name}</span>?
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Flag <span className="font-bold text-slate-800 dark:text-slate-200">{flagModal.name}</span> for review. Reason will be recorded.
                </p>
                <textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="Flag reason (required)…"
                  rows={3}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm mb-4 focus:ring-2 focus:ring-rose-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
                />
              </>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setFlagModal(null); setFlagReason(''); }}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagToggle}
                disabled={flagLoading || (!flagModal.currently && !flagReason.trim())}
                className={`flex-1 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-colors ${
                  flagModal.currently ? 'bg-slate-500 hover:bg-slate-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {flagLoading ? 'Saving…' : flagModal.currently ? 'Remove Flag' : 'Flag User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
