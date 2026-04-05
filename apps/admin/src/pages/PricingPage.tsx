import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface PricingRule {
  id: string;
  vehicleType: 'TAXI' | 'MOTORCYCLE' | 'TUKTUK';
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  isActive: boolean;
}

export default function PricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [editData, setEditData] = useState<Partial<PricingRule>>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      const response = await apiFetch<PricingRule[]>('/admin/pricing');
      setRules(response || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rule: PricingRule) => {
    setEditingId(rule.id);
    setEditData(rule);
  };

  const handleSave = async (rule: PricingRule) => {
    try {
      await apiFetch(`/admin/pricing/${rule.id}`, {
        method: 'PATCH',
        body: editData,
      });
      showToast('Pricing updated successfully', 'success');
      fetchPricing();
      setEditingId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update pricing', 'error');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const vehicleIcons: Record<string, string> = {
    TAXI: 'local_taxi',
    MOTORCYCLE: 'two_wheeler',
    TUKTUK: 'agriculture',
  };

  if (error && !rules.length) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={fetchPricing}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Pricing Management
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Configure pricing rules for different vehicle types
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-12 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              {/* Card Header */}
              <div className="bg-gradient-to-r from-primary to-cyan-400 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{rule.vehicleType}</h3>
                    <p className="text-sm text-white/80">Pricing rules</p>
                  </div>
                  <span className="material-symbols-outlined text-3xl opacity-70">
                    {vehicleIcons[rule.vehicleType]}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-4">
                {editingId === rule.id ? (
                  // Edit Mode
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Base Fare (฿)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.baseFare || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, baseFare: parseFloat(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Per KM (฿)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.perKmRate || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, perKmRate: parseFloat(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Per Minute (฿)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.perMinuteRate || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, perMinuteRate: parseFloat(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Minimum Fare (฿)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.minimumFare || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, minimumFare: parseFloat(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Surge Multiplier
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editData.surgeMultiplier || 1}
                        onChange={(e) =>
                          setEditData({ ...editData, surgeMultiplier: parseFloat(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={editData.isActive || false}
                        onChange={(e) =>
                          setEditData({ ...editData, isActive: e.target.checked })
                        }
                        className="w-4 h-4 accent-primary"
                      />
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={() => handleSave(rule)}
                        className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  // View Mode
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Base Fare
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          ฿{rule.baseFare.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Per KM
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          ฿{rule.perKmRate.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Per Minute
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          ฿{rule.perMinuteRate.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Minimum
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          ฿{rule.minimumFare.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Surge Multiplier
                      </p>
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                        {rule.surgeMultiplier}x
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          rule.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      ></span>
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="w-full px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-dark transition-colors mt-4"
                    >
                      <span className="material-symbols-outlined mr-2 inline text-sm">
                        edit
                      </span>
                      Edit Pricing
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
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
    </div>
  );
}
