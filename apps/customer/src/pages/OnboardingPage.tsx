import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IMG } from '@/lib/assets';

const slides = [
  {
    title: 'ตั้งราคาที่คุณแฟร์',
    description:
      'เลือกราคาที่คุณพอใจ เสนอราคาได้เอง คนขับพร้อมรับข้อเสนอของคุณ เดินทางสบายใจในราคาที่คุณกำหนด',
  },
  {
    title: 'ค้นหาคนขับที่เหมาะสม',
    description:
      'ระบบจะจับคู่คุณกับคนขับที่ยอมรับราคาของคุณ ดูรายละเอียดคนขับและรถ ตัดสินใจแบบมั่นใจ',
  },
  {
    title: 'เดินทางปลอดภัยและแฟร์',
    description:
      'ทำการเดินทางด้วยความสบายใจ ราคาจะถูกล็อกไว้จากต้น ไม่มีค่าใช้จ่ายเพิ่มเติมนอกเหนือจากที่ตกลงไว้',
  },
];

export default function OnboardingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      navigate('/login', { replace: true });
    }
  };

  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="relative w-full max-w-md min-h-screen bg-background-light dark:bg-background-dark shadow-2xl overflow-hidden sm:rounded-[3rem] flex flex-col mx-auto" style={{ minHeight: '100dvh' }}>
      {/* Status Bar Area (Visual Only) */}
      <div className="absolute top-0 w-full h-12 flex justify-between items-center px-6 z-20 text-text-main dark:text-white">
        <span className="text-sm font-semibold">9:41</span>
        <div className="flex gap-1.5 items-center">
          <span className="material-icons-round text-sm">signal_cellular_alt</span>
          <span className="material-icons-round text-sm">wifi</span>
          <span className="material-icons-round text-[18px]">battery_full</span>
        </div>
      </div>

      {/* Skip Button */}
      <div className="absolute top-14 right-6 z-20">
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-text-muted hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors text-sm font-medium px-3 py-1 rounded-full hover:bg-primary/10"
        >
          ข้าม (Skip)
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-10 pb-24 relative z-10">
        {/* FairGo Logo - Top */}
        <div className="w-20 h-20 mb-4 flex items-center justify-center">
          <svg
            className="relative drop-shadow-lg"
            fill="none"
            height="100"
            viewBox="0 0 100 100"
            width="100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4772 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z"
              fill="#13c8ec"
            ></path>
            <path
              d="M45 27.5H65"
              stroke="white"
              strokeLinecap="round"
              strokeWidth="4"
            ></path>
            <path
              d="M45 57.5H55"
              stroke="white"
              strokeLinecap="round"
              strokeWidth="4"
            ></path>
          </svg>
        </div>

        {/* Illustration Container */}
        <div className="relative w-full aspect-square mb-10 flex items-center justify-center">
          {/* Abstract decorative background blob */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-primary/5 rounded-full blur-3xl scale-90 animate-pulse"></div>

          {/* Main Illustration - using real image */}
          <div className="relative w-full h-full animate-float flex items-center justify-center">
            <img src={IMG.onboardingIllustration} className="w-full h-full object-cover rounded-3xl" alt="onboarding" />
          </div>

          {/* Floating Badge Element overlaid on image */}
          <div className="absolute bottom-10 -right-2 bg-surface-light dark:bg-surface-dark p-4 rounded-2xl shadow-lg border border-primary/10 flex items-center gap-3 animate-bounce" style={{animationDuration: '3s'}}>
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <span className="material-icons-round">thumb_up</span>
            </div>
            <div>
              <p className="text-xs text-text-muted dark:text-gray-400">ราคาที่ตกลงกัน</p>
              <p className="text-sm font-bold text-text-main dark:text-white">฿120.00</p>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center w-full max-w-[300px] animate-fade-in" style={{animationDelay: '0.2s'}}>
          <h1 className="text-3xl font-bold text-text-main dark:text-white mb-4 leading-tight font-display">
            {slides[currentSlide].title.split('แฟร์').length > 1 ? (
              <>
                {slides[currentSlide].title.split('แฟร์')[0]}
                <span className="text-primary">แฟร์</span>
              </>
            ) : (
              slides[currentSlide].title
            )}
          </h1>
          <p className="text-text-muted dark:text-gray-400 text-base leading-relaxed font-display">
            {slides[currentSlide].description}
          </p>
        </div>
      </div>

      {/* Bottom Controls Area */}
      <div className="absolute bottom-0 w-full px-8 pb-10 pt-4 bg-gradient-to-t from-background-light via-background-light to-transparent dark:from-background-dark dark:via-background-dark z-20">
        <div className="flex flex-col items-center gap-8">
          {/* Pagination Indicators */}
          <div className="flex gap-2">
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`transition-all duration-300 rounded-full ${
                  idx === currentSlide
                    ? 'w-8 h-2 bg-primary'
                    : 'w-2 h-2 bg-gray-300 dark:bg-gray-700'
                }`}
              ></div>
            ))}
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleNext}
            className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center group font-display"
          >
            <span className="mr-2">{isLastSlide ? 'เริ่มใช้งาน' : 'ต่อไป'}</span>
            <span className="material-icons-round group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </div>

      {/* CSS animations from AllScreen */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
