import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      const token = localStorage.getItem('fg_access_token');
      if (token) {
        navigate('/home', { replace: true });
      } else {
        navigate('/onboarding', { replace: true });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="w-full max-w-sm mx-auto h-screen bg-primary flex flex-col justify-between items-center overflow-hidden relative">
      {/* Subtle Overlay Pattern for Texture */}
      <div className="absolute inset-0 bg-subtle-pattern pointer-events-none z-0"></div>

      {/* Status Bar Placeholder (iOS Style) */}
      <div className="relative z-20 w-full h-12 flex justify-between items-center px-6 pt-2 text-white/90">
        <span className="text-sm font-semibold">9:41</span>
        <div className="flex gap-1.5 items-center">
          <span className="material-icons-round text-[16px]">signal_cellular_alt</span>
          <span className="material-icons-round text-[16px]">wifi</span>
          <span className="material-icons-round text-[16px] rotate-90">battery_full</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
        {/* Logo Container */}
        <div className="w-32 h-32 mb-8 relative flex items-center justify-center">
          {/* Outer Glow/Ring */}
          <div className="absolute inset-0 bg-white/10 rounded-3xl blur-xl animate-pulse"></div>
          {/* Logo Icon */}
          {/* Constructing the 'F' + Road concept using SVG */}
          <svg
            className="relative drop-shadow-lg"
            fill="none"
            height="100"
            viewBox="0 0 100 100"
            width="100"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* The Road / F Shape */}
            <path
              d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4772 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z"
              fill="white"
            ></path>
            {/* Road Dashes to imply movement within the F */}
            <path
              d="M45 27.5H65"
              stroke="#13c8ec"
              strokeLinecap="round"
              strokeWidth="4"
            ></path>
            <path
              d="M45 57.5H55"
              stroke="#13c8ec"
              strokeLinecap="round"
              strokeWidth="4"
            ></path>
          </svg>
        </div>

        {/* Brand Name */}
        <h1 className="text-5xl font-extrabold text-white tracking-tight mb-2 drop-shadow-sm">
          FAIRGO
        </h1>

        {/* Tagline Group */}
        <div className="text-center space-y-1">
          <p className="text-white/90 text-sm font-medium tracking-wide uppercase opacity-80 mb-2 font-display">
            Ride Your Way
          </p>
          {/* Thai Tagline */}
          <p className="text-white font-display text-lg font-medium leading-snug max-w-[280px]">
            ราคาที่คุณพอใจ<br />
            เพื่อนร่วมทางที่ไว้ใจได้
          </p>
        </div>
      </div>

      {/* Bottom Loading Indicator Area */}
      <div className="relative z-10 w-full pb-12 flex flex-col items-center justify-end h-32">
        {/* Simple spinner */}
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
        {/* Version number or small legal text (optional but common) */}
        <p className="text-white/40 text-xs font-display">v1.0.2</p>
      </div>

      {/* iOS Home Indicator */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-white/40 rounded-full z-30"></div>
    </div>
  );
}
