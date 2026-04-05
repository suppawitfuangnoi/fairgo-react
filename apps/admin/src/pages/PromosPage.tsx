import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  maxDiscount: number | null;
  minFare: number | null;
  maxRedemptions: number | null;
  currentRedemptions: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
  _count?: { redemptions: number };
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
  discountValue: '',
  maxDiscount: '',
  minFare: '',
  maxRedemptions: '',
  validFrom: '',
  validUntil: '',
};

export default function PromosPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ data: Coupon[] }>('/admin/coupons');
      setCoupons(res.data || []);
    } catch {
      showToast('Failed to load coupons', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      await apiFetch(`/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        body: { isActive: !coupon.isActive },
      });
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
      );
      showToast(`Coupon ${coupon.isActive ? 'deactivated' : 'activated'} successfully`);
    } catch {
      showToast('Failed to update coupon', 'error');
    }
  };

  const handleCreate = async () => {
    setFormError('');
    if (!formData.code || !formData.discountValue || !formData.validFrom || !formData.validUntil) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        code: formData.code.toUpperCase(),
        description: formData.description || undefined,
        discountType: formData.discountType,
        discountValue: parseFloat(formData.discountValue),
        validFrom: formData.validFrom,
        validUntil: formData.validUntil,
      };
      if (formData.maxDiscount) payload.maxDiscount = parseFloat(formData.maxDiscount);
      if (formData.minFare) payload.minFare = parseFloat(formData.minFare);
      if (formData.maxRedemptions) payload.maxRedemptions = parseInt(formData.maxRedemptions);

      const res = await apiFetch<{ data: Coupon }>('/admin/coupons', {
        method: 'POST',
        body: payload,
      });
      setCoupons((prev) => [res.data, ...prev]);
      setShowModal(false);
      setFormData(EMPTY_FORM);
      showToast('Coupon created successfully');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create coupon');
    } finally {
      setSubmitting(false);
    }
  };

  const isExpired = (validUntil: string) => new Date(validUntil) < new Date();
  const isNotStarted = (validFrom: string) => new Date(validFrom) > new Date();

  const getStatusBadge = (coupon: Coupon) => {
    if (!coupon.isActive)
      return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">Inactive</span>;
    if (isExpired(coupon.validUntil))
      return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">Expired</span>;
    if (isNotStarted(coupon.validFrom))
      return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600">Scheduled</span>;
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">Active</span>;
  };

  const filtered = coupons.filter((c) => {
    if (filterActive === 'active' && !c.isActive) return false;
    if (filterActive === 'inactive' && c.isActive) return false;
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm flex items-center gap-2 transition-all ${
            toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Promo Codes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage discount coupons for the platform
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormData(EMPTY_FORM); setFormError(''); }}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm shadow-primary/20 transition-all"
        >
          <span className="material-symbols-outlined text-base">add</span>
          New Coupon
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: coupons.length, icon: 'local_offer', color: 'text-primary' },
          { label: 'Active', value: coupons.filter((c) => c.isActive && !isExpired(c.validUntil)).length, icon: 'check_circle', color: 'text-emerald-500' },
          { label: 'Expired', value: coupons.filter((c) => isExpired(c.validUntil)).length, icon: 'schedule', color: 'text-red-500' },
          { label: 'Redemptions', value: coupons.reduce((s, c) => s + c.currentRedemptions, 0), icon: 'confirmation_number', color: 'text-amber-500' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex items-center gap-3"
          >
            <span className={`material-symbols-outlined text-2xl ${stat.color}`}>{stat.icon}</span>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-base">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                filterActive === f
                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-primary/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3">local_offer</span>
            <p className="font-medium">No coupons found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  {['Code', 'Discount', 'Min Fare', 'Validity', 'Redemptions', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                          {coupon.code}
                        </p>
                        {coupon.description && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">
                            {coupon.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-primary">
                        {coupon.discountType === 'PERCENTAGE'
                          ? `${coupon.discountValue}%`
                          : `฿${coupon.discountValue.toFixed(2)}`}
                      </span>
                      {coupon.maxDiscount && (
                        <span className="text-xs text-slate-400 block">
                          max ฿{coupon.maxDiscount.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {coupon.minFare ? `฿${coupon.minFare.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-700 dark:text-slate-300 text-xs">
                        {formatDate(coupon.validFrom)}
                      </p>
                      <p className="text-slate-400 text-xs">→ {formatDate(coupon.validUntil)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {coupon.currentRedemptions}
                      </span>
                      {coupon.maxRedemptions && (
                        <span className="text-slate-400 text-xs">
                          {' '}/ {coupon.maxRedemptions}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(coupon)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleActive(coupon)}
                        title={coupon.isActive ? 'Deactivate' : 'Activate'}
                        className={`p-2 rounded-lg transition-colors ${
                          coupon.isActive
                            ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {coupon.isActive ? 'toggle_on' : 'toggle_off'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Coupon Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">local_offer</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">New Promo Code</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}

              {/* Code */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER30"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono tracking-widest focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Summer campaign 30% off"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                />
              </div>

              {/* Discount Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed (฿)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === 'PERCENTAGE' ? '30' : '50'}
                    min="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  />
                </div>
              </div>

              {/* Max Discount + Min Fare */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Max Discount (฿)
                  </label>
                  <input
                    type="number"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    placeholder="optional"
                    min="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Min Fare (฿)
                  </label>
                  <input
                    type="number"
                    value={formData.minFare}
                    onChange={(e) => setFormData({ ...formData, minFare: e.target.value })}
                    placeholder="optional"
                    min="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  />
                </div>
              </div>

              {/* Max Redemptions */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                  Max Redemptions
                </label>
                <input
                  type="number"
                  value={formData.maxRedemptions}
                  onChange={(e) => setFormData({ ...formData, maxRedemptions: e.target.value })}
                  placeholder="Leave blank for unlimited"
                  min="1"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                />
              </div>

              {/* Valid From / Until */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Valid From <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                    Valid Until <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm shadow-primary/20"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-base">add</span>
                )}
                {submitting ? 'Creating...' : 'Create Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
