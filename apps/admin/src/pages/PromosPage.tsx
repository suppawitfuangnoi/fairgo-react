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

type FormData = {
  code: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: string;
  maxDiscount: string;
  minFare: string;
  maxRedemptions: string;
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: FormData = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  maxDiscount: '',
  minFare: '',
  maxRedemptions: '',
  validFrom: '',
  validUntil: '',
};

// Format a UTC ISO date string to Thai locale date (date-only, no time shift)
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Convert "YYYY-MM-DD" (date input value) to UTC midnight ISO string
function toUtcMidnight(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

// Convert UTC ISO string back to "YYYY-MM-DD" for date input default value
function toDateInputValue(isoStr: string): string {
  return isoStr.slice(0, 10); // "2026-04-09T00:00:00.000Z" → "2026-04-09"
}

// Parse Zod error JSON into a readable Thai/English message
function parseApiError(msg: string): string {
  try {
    const arr = JSON.parse(msg);
    if (Array.isArray(arr)) {
      return arr
        .map((e: { path?: string[]; message?: string }) => {
          const field = e.path?.join('.') || 'field';
          const message = e.message || 'invalid';
          const fieldLabels: Record<string, string> = {
            code: 'Code',
            discountValue: 'Discount Value',
            discountType: 'Discount Type',
            validFrom: 'Valid From',
            validUntil: 'Valid Until',
            maxDiscount: 'Max Discount',
            minFare: 'Min Fare',
            maxRedemptions: 'Max Redemptions',
          };
          return `${fieldLabels[field] ?? field}: ${message}`;
        })
        .join(' · ');
    }
  } catch { /* not JSON */ }
  return msg;
}

export default function PromosPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<Coupon[]>('/admin/coupons');
      setCoupons(res || []);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลคูปองได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormData(EMPTY_FORM);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = (coupon: Coupon) => {
    setEditTarget(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxDiscount: coupon.maxDiscount != null ? String(coupon.maxDiscount) : '',
      minFare: coupon.minFare != null ? String(coupon.minFare) : '',
      maxRedemptions: coupon.maxRedemptions != null ? String(coupon.maxRedemptions) : '',
      validFrom: toDateInputValue(coupon.validFrom),
      validUntil: toDateInputValue(coupon.validUntil),
    });
    setFormError('');
    setModalMode('edit');
  };

  const validateForm = (): string | null => {
    if (!formData.code.trim()) return 'กรุณากรอก Coupon Code';
    if (formData.code.trim().length < 3) return 'Coupon Code ต้องมีอย่างน้อย 3 ตัวอักษร';
    if (!formData.discountValue || isNaN(parseFloat(formData.discountValue)) || parseFloat(formData.discountValue) <= 0)
      return 'กรุณากรอก Discount Value ให้ถูกต้อง (ต้องมากกว่า 0)';
    if (formData.discountType === 'PERCENTAGE' && parseFloat(formData.discountValue) > 100)
      return 'Discount Percentage ต้องไม่เกิน 100%';
    if (!formData.validFrom) return 'กรุณาเลือก Valid From';
    if (!formData.validUntil) return 'กรุณาเลือก Valid Until';
    if (formData.validFrom >= formData.validUntil) return 'Valid Until ต้องมาหลัง Valid From';
    return null;
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      discountType: formData.discountType,
      discountValue: parseFloat(formData.discountValue),
      validFrom: toUtcMidnight(formData.validFrom),
      validUntil: toUtcMidnight(formData.validUntil),
    };
    if (formData.description.trim()) payload.description = formData.description.trim();
    if (formData.maxDiscount) payload.maxDiscount = parseFloat(formData.maxDiscount);
    if (formData.minFare) payload.minFare = parseFloat(formData.minFare);
    if (formData.maxRedemptions) payload.maxRedemptions = parseInt(formData.maxRedemptions);
    return payload;
  };

  const handleSubmit = async () => {
    setFormError('');
    const validationError = validateForm();
    if (validationError) { setFormError(validationError); return; }

    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const payload = { ...buildPayload(), code: formData.code.toUpperCase().trim() };
        const res = await apiFetch<Coupon>('/admin/coupons', { method: 'POST', body: payload });
        setCoupons((prev) => [res, ...prev]);
        showToast('สร้างคูปองสำเร็จ');
      } else if (modalMode === 'edit' && editTarget) {
        const payload = buildPayload();
        const res = await apiFetch<Coupon>(`/admin/coupons/${editTarget.id}`, { method: 'PATCH', body: payload });
        setCoupons((prev) => prev.map((c) => (c.id === editTarget.id ? res : c)));
        showToast('แก้ไขคูปองสำเร็จ');
      }
      setModalMode(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setFormError(parseApiError(raw));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      await apiFetch(`/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        body: { isActive: !coupon.isActive },
      });
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c)));
      showToast(`${coupon.isActive ? 'ปิด' : 'เปิด'}ใช้งานคูปองแล้ว`);
    } catch {
      showToast('ไม่สามารถเปลี่ยนสถานะคูปองได้', 'error');
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`ยืนยันลบคูปอง "${coupon.code}"?`)) return;
    try {
      await apiFetch(`/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      showToast('ลบคูปองแล้ว');
    } catch {
      showToast('ไม่สามารถลบคูปองได้', 'error');
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

  const field = (
    label: string,
    children: React.ReactNode,
    required = false,
    hint?: string,
  ) => (
    <div>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition';

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm flex items-center gap-2 transition-all ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          <span className="material-symbols-outlined text-base">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Promo Codes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage discount coupons for the platform</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm shadow-primary/20 transition-all"
        >
          <span className="material-symbols-outlined text-base">add</span>
          New Coupon
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: coupons.length, icon: 'local_offer', color: 'text-primary' },
          { label: 'Active', value: coupons.filter((c) => c.isActive && !isExpired(c.validUntil) && !isNotStarted(c.validFrom)).length, icon: 'check_circle', color: 'text-emerald-500' },
          { label: 'Expired', value: coupons.filter((c) => isExpired(c.validUntil)).length, icon: 'schedule', color: 'text-red-500' },
          { label: 'Redemptions', value: coupons.reduce((s, c) => s + c.currentRedemptions, 0), icon: 'confirmation_number', color: 'text-amber-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
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
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${filterActive === f ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-primary/40'}`}
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
                    <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-mono font-bold text-slate-900 dark:text-white tracking-wider">{coupon.code}</p>
                      {coupon.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{coupon.description}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-primary">
                        {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : `฿${coupon.discountValue.toFixed(2)}`}
                      </span>
                      {coupon.maxDiscount != null && (
                        <span className="text-xs text-slate-400 block">max ฿{coupon.maxDiscount.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {coupon.minFare != null ? `฿${coupon.minFare.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-700 dark:text-slate-300 text-xs">{formatDate(coupon.validFrom)}</p>
                      <p className="text-slate-400 text-xs">→ {formatDate(coupon.validUntil)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-slate-900 dark:text-white font-semibold">{coupon.currentRedemptions}</span>
                      {coupon.maxRedemptions != null && (
                        <span className="text-slate-400 text-xs"> / {coupon.maxRedemptions}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(coupon)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => openEdit(coupon)}
                          title="Edit coupon"
                          className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          title={coupon.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-2 rounded-lg transition-colors ${coupon.isActive ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                        >
                          <span className="material-symbols-outlined text-base">{coupon.isActive ? 'toggle_on' : 'toggle_off'}</span>
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(coupon)}
                          title="Delete coupon"
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">{modalMode === 'edit' ? 'edit' : 'local_offer'}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {modalMode === 'edit' ? `แก้ไข ${editTarget?.code}` : 'New Promo Code'}
                </h2>
              </div>
              <button onClick={() => setModalMode(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-600 dark:text-red-400 flex gap-2">
                  <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5">error</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Code (create only) */}
              {modalMode === 'create' && field('Code',
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="เช่น SUMMER30"
                  maxLength={20}
                  className={`${inputCls} font-mono tracking-widest`}
                />,
                true,
                'ตัวอักษรพิมพ์ใหญ่ ไม่มีช่องว่าง 3-20 ตัวอักษร',
              )}

              {/* Description */}
              {field('Description',
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="เช่น ส่วนลด 30% สำหรับการเดินทางแรก"
                  className={inputCls}
                />,
              )}

              {/* Discount Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                {field('ประเภทส่วนลด',
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' })}
                    className={inputCls}
                  >
                    <option value="PERCENTAGE">เปอร์เซ็นต์ (%)</option>
                    <option value="FIXED">จำนวนเงิน (฿)</option>
                  </select>,
                  true,
                )}
                {field(`มูลค่าส่วนลด ${formData.discountType === 'PERCENTAGE' ? '(%)' : '(฿)'}`,
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === 'PERCENTAGE' ? '30' : '50'}
                    min="0"
                    max={formData.discountType === 'PERCENTAGE' ? '100' : undefined}
                    step="0.01"
                    className={inputCls}
                  />,
                  true,
                )}
              </div>

              {/* Max Discount + Min Fare */}
              <div className="grid grid-cols-2 gap-3">
                {field('ส่วนลดสูงสุด (฿)',
                  <input
                    type="number"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    placeholder="ไม่จำกัด"
                    min="0"
                    step="0.01"
                    className={inputCls}
                  />,
                  false,
                  'สำหรับ % เพื่อกำหนดเพดานส่วนลด',
                )}
                {field('ราคาขั้นต่ำ (฿)',
                  <input
                    type="number"
                    value={formData.minFare}
                    onChange={(e) => setFormData({ ...formData, minFare: e.target.value })}
                    placeholder="ไม่กำหนด"
                    min="0"
                    step="0.01"
                    className={inputCls}
                  />,
                )}
              </div>

              {/* Max Redemptions */}
              {field('จำนวนใช้งานสูงสุด',
                <input
                  type="number"
                  value={formData.maxRedemptions}
                  onChange={(e) => setFormData({ ...formData, maxRedemptions: e.target.value })}
                  placeholder="ว่างไว้ = ไม่จำกัด"
                  min="1"
                  step="1"
                  className={inputCls}
                />,
              )}

              {/* Valid From / Until — type="date" to avoid timezone offset bug */}
              <div className="grid grid-cols-2 gap-3">
                {field('วันเริ่มต้น',
                  <input
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className={inputCls}
                  />,
                  true,
                )}
                {field('วันหมดอายุ',
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    min={formData.validFrom || undefined}
                    className={inputCls}
                  />,
                  true,
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setModalMode(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-sm shadow-primary/20"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-base">{modalMode === 'edit' ? 'save' : 'add'}</span>
                )}
                {submitting ? 'กำลังบันทึก...' : modalMode === 'edit' ? 'บันทึกการแก้ไข' : 'สร้างคูปอง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
