import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';

type Step = 'phone' | 'otp' | 'profile';

const Logo = () => (
  <svg className="w-full h-full" fill="none" height="100" viewBox="0 0 100 100" width="100" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4472 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z" fill="#13c8ec"/>
    <path d="M45 27.5H65" stroke="white" strokeLinecap="round" strokeWidth="4"/>
    <path d="M45 57.5H55" stroke="white" strokeLinecap="round" strokeWidth="4"/>
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRef, setOtpRef] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingAuth, setPendingAuth] = useState<{ user: any; at: string; rt?: string } | null>(null);

  // ── Step 1: Request OTP ─────────────────────────────────
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 9) {
      setError('Please enter a valid phone number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ otpRef: string }>('/auth/request-otp', {
        method: 'POST',
        body: { phone: '+66' + phone.slice(-9) },
      });
      setOtpRef(res.otpRef || '');
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      setError('Please enter a valid OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch<{ user: any; accessToken: string; refreshToken?: string; isNewUser?: boolean }>('/auth/verify-otp', {
        method: 'POST',
        body: { phone: '+66' + phone.slice(-9), code: otp, role: 'DRIVER' },
      });
      const { user, accessToken, refreshToken, isNewUser } = (response as any).data ?? response;

      // Guard: reject non-DRIVER accounts
      if (user.role && user.role !== 'DRIVER') {
        setError('เบอร์โทรนี้ลงทะเบียนเป็น Customer อยู่แล้ว\nกรุณาใช้เบอร์โทรอื่นสำหรับบัญชีคนขับ');
        return;
      }

      if (isNewUser || !user.name) {
        // New driver — collect name before continuing to onboarding
        setPendingAuth({ user, at: accessToken, rt: refreshToken });
        setStep('profile');
      } else {
        // Returning driver — go straight based on verificationStatus
        setAuth(user, accessToken, refreshToken);
        navigate(
          user.verificationStatus === 'APPROVED' ? '/home' : '/onboarding/profile',
          { replace: true }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save name ───────────────────────────────────
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!pendingAuth) return;
    setLoading(true);
    setError('');
    try {
      // Set token temporarily to allow the PATCH call
      localStorage.setItem('fg_access_token', pendingAuth.at);

      await apiFetch('/users/me', {
        method: 'PATCH',
        body: { name: name.trim() },
      });

      const updatedUser = { ...pendingAuth.user, name: name.trim() };
      setAuth(updatedUser, pendingAuth.at, pendingAuth.rt);
      navigate('/onboarding/profile', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center">
      <div className="max-w-md w-full max-h-[850px] mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col relative">

        {/* Status bar */}
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">9:41</span>
          <div className="flex gap-1.5 items-center text-xs text-slate-900 dark:text-white">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        {/* Step progress */}
        {step !== 'phone' && (
          <div className="px-6 pt-2 pb-0 flex gap-2">
            {(['phone', 'otp', 'profile'] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= (['phone', 'otp', 'profile'] as Step[]).indexOf(step) ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col justify-center">

          {/* ── STEP 1: PHONE ───────────────────────────── */}
          {step === 'phone' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 flex items-center justify-center mx-auto mb-6"><Logo /></div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Driver App</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Sign in or register as a driver</p>
              </div>

              <form onSubmit={handleRequestOTP} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Phone Number</label>
                  <div className="flex items-center bg-background-light dark:bg-slate-800 rounded-xl overflow-hidden">
                    <span className="px-4 text-slate-500 dark:text-slate-400 font-medium">+66</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                      placeholder="8XXXXXXXX"
                      maxLength={9}
                      autoFocus
                      className="flex-1 bg-transparent px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                {error && <ErrorBox msg={error} />}

                <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <Spinner /> : <><span>Send Code</span><span className="material-symbols-outlined">arrow_forward</span></>}
                </button>
              </form>
            </>
          )}

          {/* ── STEP 2: OTP ─────────────────────────────── */}
          {step === 'otp' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 flex items-center justify-center mx-auto mb-6"><Logo /></div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Enter OTP</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Sent to +66{phone.slice(-9)}
                </p>
              </div>

              <form onSubmit={handleVerifyOTP} className="space-y-4">
                {otpRef && (
                  <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">OTP Reference</p>
                    <p className="text-sm font-mono font-bold text-primary tracking-widest">{otpRef}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Verification Code</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-widest"
                  />
                </div>

                {error && <ErrorBox msg={error} />}

                <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <Spinner /> : <><span>Verify</span><span className="material-symbols-outlined">arrow_forward</span></>}
                </button>
              </form>

              <button onClick={() => setStep('phone')} className="w-full mt-3 text-primary font-semibold py-2 rounded-lg hover:bg-primary/5">
                Change Phone Number
              </button>
            </>
          )}

          {/* ── STEP 3: NAME (new driver) ────────────────── */}
          {step === 'profile' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 32 }}>badge</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Your Name</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">This will be shown to passengers</p>
              </div>

              <form onSubmit={handleSaveName} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(''); }}
                    placeholder="Somchai Jaidee"
                    autoFocus
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {error && <ErrorBox msg={error} />}

                <button type="submit" disabled={loading || !name.trim()} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <Spinner /> : <><span>Continue to Profile</span><span className="material-symbols-outlined">arrow_forward</span></>}
                </button>
              </form>
            </>
          )}

        </div>

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm whitespace-pre-line">
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <span>Loading...</span>
    </>
  );
}
