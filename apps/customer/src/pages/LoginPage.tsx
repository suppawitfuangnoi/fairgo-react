import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpRef, setOtpRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setLoggedIn = useAuthStore((state) => state.setLoggedIn);
  const countdownRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [countdown]);

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneInput(e.target.value));
    setError('');
  };

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
      setShowOTP(true);
      setCountdown(60);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ไม่สามารถส่ง OTP ได้ โปรดลองใหม่'
      );
    } finally {
      setLoading(false);
    }
  };

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

      const { user, accessToken, refreshToken } = (response as any).data ?? response;
      localStorage.setItem('fg_access_token', accessToken);
      localStorage.setItem('fg_refresh_token', refreshToken);
      localStorage.setItem('fg_user', JSON.stringify(user));

      setLoggedIn(true);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP ไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
    setError('');
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark flex flex-col justify-between items-center px-6 py-8 font-display">
      <div className="flex flex-col items-center justify-center flex-1 w-full">
        {/* Logo */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-4xl text-primary">
              local_taxi
            </span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-2 text-slate-900 dark:text-white">
          FAIRGO
        </h1>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
          ล็อกอินด้วยเบอร์โทรศัพท์
        </p>

        {/* Error Message */}
        {error && (
          <div className="w-full mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Phone or OTP Input */}
        {!showOTP ? (
          <>
            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                placeholder="081-234-5678"
                value={phone}
                onChange={handlePhoneChange}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
              />
            </div>

            <button
              onClick={handleRequestOTP}
              disabled={loading || phone.replace(/\D/g, '').length < 10}
              className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? 'กำลังส่ง...' : 'ขอ OTP'}
            </button>
          </>
        ) : (
          <>
            {otpRef && (
              <div className="w-full mb-4 p-3 bg-primary/10 border border-primary/30 rounded-xl text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">รหัสอ้างอิง OTP</p>
                <p className="text-sm font-mono font-bold text-primary tracking-widest">{otpRef}</p>
              </div>
            )}

            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                กรอก OTP (6 หลัก)
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={handleOTPChange}
                maxLength={6}
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
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
                ขอ OTP ใหม่ได้ใน {countdown} วินาที
              </p>
            ) : (
              <button
                onClick={() => {
                  setShowOTP(false);
                  setOtp('');
                  setCountdown(0);
                }}
                className="text-center text-primary hover:underline text-sm font-medium"
              >
                ขอ OTP ใหม่
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 dark:text-slate-400">
        <p>ดำเนินการต่อเป็นการยอมรับ</p>
        <p className="text-primary hover:underline cursor-pointer">
          เงื่อนไขการให้บริการ
        </p>
      </div>
    </div>
  );
}
