import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center">
      <div className="max-w-md w-full max-h-[850px] mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col">
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">9:41</span>
          <div className="flex gap-1.5 items-center text-xs text-slate-900 dark:text-white">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        <div className="absolute top-14 right-6 z-20">
          <button
            onClick={() => navigate('/login')}
            className="text-slate-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors text-sm font-medium px-3 py-1 rounded-full"
          >
            ข้าม
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 pt-10 pb-24">
          <div className="relative w-full aspect-square mb-10 flex items-center justify-center max-w-[200px]">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-primary/5 rounded-full blur-3xl scale-90 animate-pulse"></div>
            <div className="relative flex items-center justify-center">
              <span className="material-symbols-outlined text-7xl text-primary">{slide.icon}</span>
            </div>
          </div>

          <div className="text-center w-full max-w-[300px]">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4 leading-tight">{slide.title}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-base leading-relaxed">{slide.description}</p>
          </div>
        </div>

        <div className="absolute bottom-0 w-full px-8 pb-10 pt-4 bg-gradient-to-t from-white via-white to-transparent dark:from-slate-900 dark:via-slate-900 z-20">
          <div className="flex flex-col items-center gap-8">
            <div className="flex gap-2">
              {SLIDES.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentSlide ? 'w-8 bg-primary' : 'w-2 bg-gray-300 dark:bg-gray-700'
                  }`}
                ></div>
              ))}
            </div>

            <button
              onClick={handleNext}
              className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <span>{currentSlide === SLIDES.length - 1 ? 'เริ่มสมัคร' : 'ต่อไป'}</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
      </div>
    </div>
  );
}
