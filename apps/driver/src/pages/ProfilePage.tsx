import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';
import BottomNav from '@/components/BottomNav';

interface DriverProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  rating?: number;
  totalTrips?: number;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
  isOnline?: boolean;
  isVerified?: boolean;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', vehicleModel: '', vehiclePlate: '', vehicleColor: '' });

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: DriverProfile }>('/api/v1/users/me');
      if (res.data) {
        setProfile(res.data);
        setForm({
          name: res.data.name || '',
          phone: res.data.phone || '',
          vehicleModel: res.data.vehicleModel || '',
          vehiclePlate: res.data.vehiclePlate || '',
          vehicleColor: res.data.vehicleColor || '',
        });
      }
    } catch {
      // Use auth store user as fallback
      if (user) {
        const p: DriverProfile = { id: user.id, name: user.name, email: user.email, phone: '', rating: 4.8, totalTrips: 234 };
        setProfile(p);
        setForm({ name: p.name, phone: '', vehicleModel: '', vehiclePlate: '', vehicleColor: '' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      await fetchProfile();
      setEditing(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const menuItems = [
    { icon: 'history', label: 'Trip History', onClick: () => navigate('/history') },
    { icon: 'account_balance_wallet', label: 'Earnings & Wallet', onClick: () => navigate('/earnings') },
    { icon: 'help_outline', label: 'Help & Support', onClick: () => {} },
    { icon: 'description', label: 'Terms & Privacy', onClick: () => {} },
  ];

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col relative">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-6 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="p-2 rounded-full hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-slate-600">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-slate-800">My Profile</h1>
          <div className="ml-auto">
            <button
              onClick={() => setEditing(!editing)}
              className="text-sm font-semibold text-primary"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="relative mb-3">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-4 border-white shadow-md">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="material-symbols-outlined text-primary text-4xl">person</span>
              )}
            </div>
            {profile?.isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-primary w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
                <span className="material-symbols-outlined text-white text-xs">check</span>
              </div>
            )}
          </div>
          {loading ? (
            <div className="h-6 w-36 bg-slate-100 animate-pulse rounded-lg mb-2"></div>
          ) : (
            <h2 className="text-xl font-bold text-slate-900">{profile?.name || user?.name || 'Driver'}</h2>
          )}
          <p className="text-sm text-slate-500">{profile?.email || user?.email}</p>

          {/* Stats */}
          <div className="flex gap-8 mt-4">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800">{profile?.rating?.toFixed(1) ?? '4.8'}</p>
              <p className="text-xs text-slate-400">Rating</p>
            </div>
            <div className="w-px bg-slate-100"></div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800">{profile?.totalTrips ?? 0}</p>
              <p className="text-xs text-slate-400">Trips</p>
            </div>
            <div className="w-px bg-slate-100"></div>
            <div className="text-center">
              <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${profile?.isVerified ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                <span className="material-symbols-outlined text-xs">{profile?.isVerified ? 'verified' : 'pending'}</span>
                {profile?.isVerified ? 'Verified' : 'Pending'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Status</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 pb-28">

        {/* Edit Form */}
        {editing && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Edit Information</h3>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'Full Name', icon: 'person' },
                { key: 'phone', label: 'Phone', icon: 'phone' },
                { key: 'vehicleModel', label: 'Vehicle Model', icon: 'directions_car' },
                { key: 'vehiclePlate', label: 'License Plate', icon: 'badge' },
                { key: 'vehicleColor', label: 'Vehicle Color', icon: 'palette' },
              ].map(({ key, label, icon }) => (
                <div key={key}>
                  <label className="text-xs text-slate-500 mb-1 block">{label}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{icon}</span>
                    <input
                      type="text"
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-4 bg-primary text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}

        {/* Vehicle Info */}
        {!editing && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">directions_car</span>
              <h3 className="text-sm font-bold text-slate-800">Vehicle Info</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Model', value: profile?.vehicleModel || 'Not set', icon: 'directions_car' },
                { label: 'Plate', value: profile?.vehiclePlate || 'Not set', icon: 'badge' },
                { label: 'Color', value: profile?.vehicleColor || 'Not set', icon: 'palette' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 text-sm">{icon}</span>
                    <span className="text-sm text-slate-500">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Account Info */}
        {!editing && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">account_circle</span>
              <h3 className="text-sm font-bold text-slate-800">Account</h3>
            </div>
            <div className="space-y-1">
              {[
                { label: 'Phone', value: profile?.phone || 'Not set', icon: 'phone' },
                { label: 'Email', value: profile?.email || user?.email || '', icon: 'email' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 text-sm">{icon}</span>
                    <span className="text-sm text-slate-500">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[160px] text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Menu Items */}
        {!editing && (
          <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
            {menuItems.map(({ icon, label, onClick }, i) => (
              <button
                key={label}
                onClick={onClick}
                className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left ${i < menuItems.length - 1 ? 'border-b border-slate-50' : ''}`}
              >
                <span className="material-symbols-outlined text-slate-400">{icon}</span>
                <span className="text-sm font-medium text-slate-700 flex-1">{label}</span>
                <span className="material-symbols-outlined text-slate-300 text-sm">chevron_right</span>
              </button>
            ))}
          </div>
        )}

        {/* Logout */}
        {!editing && (
          <button
            onClick={handleLogout}
            className="w-full bg-red-50 text-red-500 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            Log Out
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
