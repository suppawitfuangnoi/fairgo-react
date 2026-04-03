import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

export default function SplashPage() {
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoggedIn) {
        navigate('/home', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [isLoggedIn, navigate]);

  return (
    <div className="min-h-screen bg-background-dark dark:bg-background-dark font-display flex items-center justify-center overflow-hidden">
      <div className="max-w-md w-full max-h-[850px] mx-auto bg-primary shadow-2xl overflow-hidden flex flex-col justify-between">
        <div className="absolute inset-0 bg-subtle-pattern pointer-events-none z-0"></div>

        <div className="relative z-20 w-full h-12 flex justify-between items-center px-6 pt-2 text-white/90">
          <span className="text-sm font-semibold">9:41</span>
          <div className="flex gap-1.5 items-center text-xs">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined rotate-90">battery_full</span>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-32 h-32 mb-8 relative flex items-center justify-center">
            <div className="absolute inset-0 bg-white/10 rounded-3xl blur-xl animate-pulse"></div>
            <svg className="relative drop-shadow-lg" fill="none" height="100" viewBox="0 0 100 100" width="100">
              <path d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4772 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z" fill="white"></path>
              <path d="M45 27.5H65" stroke="#13c8ec" strokeLinecap="round" strokeWidth="4"></path>
              <path d="M45 57.5H55" stroke="#13c8ec" strokeLinecap="round" strokeWidth="4"></path>
            </svg>
          </div>

          <h1 className="text-5xl font-extrabold text-white tracking-tight mb-2 drop-shadow-sm">FAIRGO</h1>

          <div className="text-center space-y-1">
            <p className="text-white/90 text-sm font-medium tracking-wide uppercase opacity-80 mb-2">For Drivers</p>
            <p className="text-white font-display text-lg font-medium leading-snug max-w-[280px]">แอปสำหรับคนขับ</p>
          </div>
        </div>

        <div className="relative z-10 w-full pb-12 flex flex-col items-center justify-end h-32">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
          <p className="text-white/40 text-xs font-display">v1.0.2</p>
        </div>

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-white/40 rounded-full z-30"></div>
      </div>
    </div>
  );
}
