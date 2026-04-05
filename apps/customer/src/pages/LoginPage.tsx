import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type Step = 'phone' | 'otp' | 'profile';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRef, setOtpRef] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [pendingAuth, setPendingAuth] = useState<{ user: any; at: string; rt: string } | null>(null);

  const navigate = useNavigate();
  const setLoggedIn = useAuthStore((state) => state.setLoggedIn);
  const countdownRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [countdown]);

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  // ── Step 1: Request OTP ─────────────────────────────────
  const handleRequestOTP = async () => {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setError('กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ otpRef: string }>('/auth/request-otp', {
        method: 'POST',
        body: { phone: phoneDigits },
      });
      setOtpRef(res.otpRef || '');
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถส่ง OTP ได้ โปรดลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────
  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setError('กรุณากรอก OTP 6 หลัก');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const response = await apiFetch('/auth/verify-otp', {
        method: 'POST',
        body: { phone: phoneDigits, code: otp, role: 'CUSTOMER' },
      });
      const { user, accessToken: at, refreshToken: rt, isNewUser } = (response as any).data ?? response;

      if (isNewUser || !user.name) {
        // New user — collect profile before finishing login
        setPendingAuth({ user, at, rt });
        setStep('profile');
      } else {
        // Returning user — finish immediately
        finishLogin(user, at, rt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP ไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save Profile ────────────────────────────────
  const handleCompleteProfile = async () => {
    if (!name.trim()) {
      setError('กรุณากรอกชื่อของคุณ');
      return;
    }
    if (!pendingAuth) return;
    setLoading(true);
    setError('');
    try {
      // Token is already set (needed for the PATCH call)
      localStorage.setItem('fg_access_token', pendingAuth.at);

      await apiFetch('/users/me', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });

      const updatedUser = {
        ...pendingAuth.user,
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      };
      finishLogin(updatedUser, pendingAuth.at, pendingAuth.rt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const finishLogin = (user: any, at: string, rt: string) => {
    localStorage.setItem('fg_access_token', at);
    localStorage.setItem('fg_refresh_token', rt);
    localStorage.setItem('fg_user', JSON.stringify(user));
    setLoggedIn(true);
    navigate('/home', { replace: true });
  };

  // ── Shared UI helpers ───────────────────────────────────
  const Logo = () => (
    <svg fill="none" height="64" viewBox="0 0 100 100" width="64" xmlns="http://www.w3.org/2000/svg" className="relative drop-shadow-lg">
      <path d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4772 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z" fill="#13c8ec"/>
      <path d="M45 27.5H65" stroke="white" strokeLinecap="round" strokeWidth="4"/>
      <path d="M45 57.5H55" stroke="white" strokeLinecap="round" strokeWidth="4"/>
    </svg>
  );

  const ErrorBox = () => error ? (
    <div className="w-full mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
      <p className="text-sm text-red-700 dark:text-red-200 whitespace-pre-line">{error}</p>
    </div>
  ) : null;

  // ── Step indicator ──────────────────────────────────────
  const stepNum = step === 'phone' ? 1 : step === 'otp' ? 2 : 3;

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark flex flex-col justify-between items-center px-6 py-8 font-display">

      {/* Progress dots */}
      {(step === 'otp' || step === 'profile') && (
        <div className="flex gap-2 pt-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 rounded-full transition-all duration-300 ${n <= stepNum ? 'bg-primary w-8' : 'bg-slate-200 dark:bg-slate-700 w-4'}`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center justify-center flex-1 w-full">

        {/* ── STEP 1: PHONE ─────────────────────────────── */}
        {step === 'phone' && (
          <>
            <div className="mb-8"><Logo /></div>
            <h1 className="text-3xl font-bold text-center mb-1 text-slate-900 dark:text-white">FAIRGO</h1>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-8">เข้าสู่ระบบ / สมัครสมาชิก</p>

            <ErrorBox />

            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                placeholder="081-234-5678"
                value={phone}
                onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleRequestOTP()}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
              />
            </div>

            <button
              onClick={handleRequestOTP}
              disabled={loading || phone.replace(/\D/g, '').length < 10}
              className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? 'กำลังส่ง...' : 'ขอรหัส OTP'}
            </button>
          </>
        )}

        {/* ── STEP 2: OTP ───────────────────────────────── */}
        {step === 'otp' && (
          <>
            <div className="mb-6"><Logo /></div>
            <h1 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">ยืนยันตัวตน</h1>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
              ส่ง OTP ไปที่ <span className="font-semibold text-slate-700 dark:text-slate-200">{phone}</span>
            </p>

            <ErrorBox />

            {otpRef && (
              <div className="w-full mb-4 p-3 bg-primary/10 border border-primary/30 rounded-xl text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">รหัสอ้างอิง OTP</p>
                <p className="text-sm font-mono font-bold text-primary tracking-widest">{otpRef}</p>
              </div>
            )}

            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">กรอก OTP (6 หลัก)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOTP()}
                maxLength={6}
                autoFocus
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center text-2xl tracking-widest font-mono transition-all"
              />
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all mb-4"
            >
              {loading ? 'กำลังตรวจสอบ...' : 'ยืนยัน OTP'}
            </button>

            {countdown > 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm">ขอ OTP ใหม่ได้ใน {countdown} วินาที</p>
            ) : (
              <button
                onClick={() => { setStep('phone'); setOtp(''); setCountdown(0); }}
                className="text-center text-primary hover:underline text-sm font-medium"
              >
                ← เปลี่ยนเบอร์โทร
              </button>
            )}
          </>
        )}

        {/* ── STEP 3: PROFILE (new user) ────────────────── */}
        {step === 'profile' && (
          <>
            <div className="mb-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 40 }}>person_add</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">สมัครสมาชิก</h1>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">กรอกข้อมูลเพื่อเริ่มใช้งาน FairGo</p>

            <ErrorBox />

            <div className="w-full mb-4">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                ชื่อ-นามสกุล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="สมชาย ใจดี"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCompleteProfile()}
                autoFocus
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
              />
            </div>

            <div className="w-full mb-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                อีเมล <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
              </label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
              />
            </div>

            {/* Phone summary */}
            <div className="w-full mb-6 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-400 text-lg">phone</span>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">เบอร์โทรศัพท์ที่ยืนยันแล้ว</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{phone}</p>
              </div>
            </div>

            <button
              onClick={handleCompleteProfile}
              disabled={loading || !name.trim()}
              className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? 'กำลังบันทึก...' : 'เริ่มใช้งาน FairGo →'}
            </button>
          </>
        )}

      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 dark:text-slate-400 mt-8">
        <p>ดำเนินการต่อเป็นการยอมรับ</p>
        <p className="text-primary hover:underline cursor-pointer">เงื่อนไขการให้บริการ</p>
      </div>
    </div>
  );
}
