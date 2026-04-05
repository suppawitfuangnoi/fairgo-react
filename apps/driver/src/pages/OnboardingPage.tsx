import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IMG } from '@/lib/assets';

interface Slide {
  icon: string;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'flash_on',
    title: 'รับงานได้ทันที',
    description: 'ไม่ต้องรอ ได้งานทั้งวัน ทุกชั่วโมงที่คุณออนไลน์',
  },
  {
    icon: 'verified_user',
    title: 'ราคาแฟร์ ไม่มีค่าคอม',
    description: 'เลือกราคาเอง ไม่มีคอมชั่นลับ ได้เงินจริงทั้งหมด',
  },
  {
    icon: 'savings',
    title: 'ถอนเงินได้ทุกวัน',
    description: 'เสร็จงาน ถอนเงินได้เลย ไม่ต้องรอวันถัดไป',
  },
];

const styles = `
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
`;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      navigate('/login');
    }
  };

  const slide = SLIDES[currentSlide];

  return (
    <>
      <style>{styles}</style>
      <div className="bg-gray-100 font-display flex items-center justify-center min-h-screen">
        <div className="relative w-full max-w-md h-[844px] bg-background-light dark:bg-background-dark shadow-2xl overflow-hidden sm:rounded-[3rem] flex flex-col">
          {/* Status Bar Area */}
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
              onClick={() => navigate('/login')}
              className="text-text-muted hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors text-sm font-medium px-3 py-1 rounded-full"
            >
              ข้าม (Skip)
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 pt-10 pb-24 relative z-10">
            {/* Illustration Container */}
            <div className="relative w-full aspect-square mb-10 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-primary/5 rounded-full blur-3xl scale-90 animate-pulse"></div>
              <div className="relative w-full h-full animate-float">
                <img src={IMG.onboardingIllustration} className="w-full h-full object-cover" alt="onboarding" />
              </div>
            </div>

            {/* Text Content */}
            <div className="text-center w-full max-w-[300px] animate-fade-in">
              <h1 className="text-3xl font-bold text-text-main dark:text-white mb-4 leading-tight font-thai">
                {slide.title}
              </h1>
              <p className="text-text-muted dark:text-gray-400 text-base leading-relaxed font-thai">
                {slide.description}
              </p>
            </div>
          </div>

          {/* Bottom Controls Area */}
          <div className="absolute bottom-0 w-full px-8 pb-10 pt-4 bg-gradient-to-t from-background-light via-background-light to-transparent dark:from-background-dark dark:via-background-dark z-20">
            <div className="flex flex-col items-center gap-8">
              {/* Pagination Indicators */}
              <div className="flex gap-2">
                {SLIDES.map((_, idx) => (
                  <div
                    key={idx}
                    className={`rounded-full transition-all duration-300 ${
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
                className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center group"
              >
                <span className="font-thai mr-2">{currentSlide === SLIDES.length - 1 ? 'เริ่มสมัคร' : 'ต่อไป'}</span>
                <span className="material-icons-round group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
