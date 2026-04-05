import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRef, setOtpRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      setError('Please enter a valid OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch<{
        user: any;
        accessToken: string;
        refreshToken?: string;
      }>('/auth/verify-otp', {
        method: 'POST',
        body: {
          phone: '+66' + phone.slice(-9),
          code: otp,
          role: 'DRIVER',
        },
      });
      const { user, accessToken, refreshToken } = (response as any).data ?? response;
      setAuth(user, accessToken, refreshToken);

      if (user.verificationStatus === 'PENDING' || !user.verificationStatus) {
        navigate('/onboarding/profile', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center">
      <div className="max-w-md w-full max-h-[850px] mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col">
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold">9:41</span>
          <div className="flex gap-1.5 items-center text-xs">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-12 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-white text-3xl">phone</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              {step === 'phone' ? 'Your Phone' : 'Enter OTP'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {step === 'phone'
                ? 'Sign in with your phone number'
                : 'Check SMS for verification code'}
            </p>
          </div>

          <form onSubmit={step === 'phone' ? handleRequestOTP : handleVerifyOTP} className="space-y-4">
            {step === 'phone' ? (
              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Phone Number
                </label>
                <div className="flex items-center bg-background-light dark:bg-slate-800 rounded-xl overflow-hidden">
                  <span className="px-4 text-slate-500 dark:text-slate-400 font-medium">+66</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="8XXXXXXXX"
                    maxLength="9"
                    className="flex-1 bg-transparent px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                {otpRef && (
                  <div className="mb-3 p-3 bg-primary/10 border border-primary/30 rounded-xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">OTP Reference</p>
                    <p className="text-sm font-mono font-bold text-primary tracking-widest">{otpRef}</p>
                  </div>
                )}
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  maxLength="6"
                  className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-widest"
                />
              </div>
            )}

            {error && <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>{step === 'phone' ? 'Send Code' : 'Verify'}</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {step === 'otp' && (
            <button
              onClick={() => setStep('phone')}
              className="w-full mt-3 text-primary font-semibold py-2 rounded-lg hover:bg-primary/5"
            >
              Change Phone Number
            </button>
          )}
        </div>

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
      </div>
    </div>
  );
}
