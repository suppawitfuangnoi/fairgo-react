import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';

const FEATURES = [
  'ติดตามเที่ยวแบบเรียลไทม์',
  'ยืนยันและจัดการคนขับ',
  'ควบคุมนโยบายราคา',
  'สถิติและรายงาน',
];

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await apiFetch<{
        user: { id: string; email: string; name: string; role: string };
        accessToken: string;
        refreshToken: string;
      }>('/auth/admin-login', {
        method: 'POST',
        body: { email, password },
      });
      const { user, accessToken, refreshToken } = response;
      setAuth(
        { id: user.id, email: user.email, name: user.name, role: user.role as 'admin' | 'super_admin' },
        accessToken,
        refreshToken
      );
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0fbddf 0%, #13c8ec 45%, #0ea5c6 100%)' }}
      >
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/10 rounded-full" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 bg-white/10 rounded-full" />
        <div className="absolute top-1/3 -right-12 w-48 h-48 bg-white/10 rounded-full" />

        <div className="relative z-10 flex flex-col items-center text-white text-center max-w-sm">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-8 shadow-xl">
            <svg viewBox="0 0 24 24" fill="white" className="w-12 h-12">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
          </div>

          <h1 className="text-5xl font-extrabold tracking-wider mb-2 drop-shadow-md">FAIRGO</h1>
          <p className="text-lg font-medium text-white/90 mb-10">ระบบจัดการแอดมิน</p>

          <div className="space-y-4 text-left w-full">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <span className="text-white/90 font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-gray-50 p-8 relative">
        <div className="absolute top-6 right-8">
          <button className="text-sm font-semibold text-gray-500 hover:text-primary transition-colors px-3 py-1 rounded-lg hover:bg-primary/10">
            EN
          </button>
        </div>

        {/* Mobile brand */}
        <div className="lg:hidden mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg,#13c8ec,#0ea5c6)' }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-wider text-gray-900">FAIRGO</h1>
          <p className="text-sm text-gray-500">ระบบจัดการแอดมิน</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">เข้าสู่ระบบ</h2>
            <p className="text-sm text-gray-400 mb-7">กรอกข้อมูลแอดมินเพื่อดำเนินการต่อ</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">อีเมล</label>
                <div className="relative">
                  <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" style={{fontSize:'18px'}}>email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@fairgo.app"
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">รหัสผ่าน</label>
                <div className="relative">
                  <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" style={{fontSize:'18px'}}>lock</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="material-icons-round" style={{fontSize:'18px'}}>{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="material-icons-round text-red-500" style={{fontSize:'18px'}}>error</span>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#13c8ec,#0ea5c6)' }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>กำลังเข้าสู่ระบบ...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons-round" style={{fontSize:'18px'}}>login</span>
                    <span>เข้าสู่แดชบอร์ด</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">© 2025 FAIRGO Co., Ltd. Thailand</p>
        </div>
      </div>
    </div>
  );
}
