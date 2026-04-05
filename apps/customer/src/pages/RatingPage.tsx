import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';

const FEEDBACK_TAGS = [
  'ราคาแฟร์',
  'คนขับใจดี',
  'รถสะอาด',
  'ตรงเวลา',
  'ปลอดภัย',
];

interface TripForRating {
  id: string;
  driverName: string;
  driverId: string;
  distance: number;
  duration: number;
  fare: number;
}

export default function RatingPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripForRating | null>(null);
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>(['ราคาแฟร์']);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      if (!tripId) return;
      try {
        const response = await apiFetch<TripForRating>(`/trips/${tripId}`);
        setTrip(response);
      } catch (err) {
        console.error('Failed to fetch trip:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
  }, [tripId]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitRating = async () => {
    if (!trip || rating === 0) return;

    setSubmitting(true);
    try {
      await apiFetch('/ratings', {
        method: 'POST',
        body: {
          tripId: trip.id,
          score: rating,
          tags: selectedTags,
          comment,
          toUserId: trip.driverId,
        },
      });

      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Failed to submit rating:', err);
      alert('ไม่สามารถบันทึกการให้คะแนนได้ โปรดลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">ไม่พบข้อมูล</p>
      </div>
    );
  }

  return (
    <main className="w-full max-w-md h-screen max-h-[900px] bg-white dark:bg-[#15262a] shadow-2xl relative overflow-hidden flex flex-col font-display">
      {/* Top Navigation / Close */}
      <header className="flex justify-between items-center p-6 pb-2 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-neutral-surface dark:hover:bg-neutral-surface-dark transition-colors text-slate-400 dark:text-slate-500"
        >
          <span className="material-icons-round text-2xl">close</span>
        </button>
        <span className="text-xs font-bold tracking-widest uppercase text-primary">
          Ride Completed
        </span>
        <div className="w-10"></div>
        {/* Spacer for visual balance */}
      </header>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-4 pb-24">
        {/* Driver Profile & Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary to-blue-400">
              <div className="w-full h-full overflow-hidden rounded-full border-4 border-white dark:border-[#15262a]">
                <img src={IMG.driverRating} className="w-full h-full object-cover rounded-full" alt="driver" />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 bg-white dark:bg-[#15262a] rounded-full p-1.5 shadow-md">
              <div className="bg-green-500 w-3 h-3 rounded-full"></div>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-1 text-slate-900 dark:text-white">
            การเดินทางเป็นไปได้ดีหรือไม่?
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            กับ <span className="font-semibold text-slate-800 dark:text-slate-200">{trip.driverName}</span>
          </p>

          {/* Trip Details Pill */}
          <div className="inline-flex items-center bg-neutral-surface dark:bg-neutral-surface-dark px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 gap-3">
            <div className="flex items-center gap-1">
              <span className="material-icons-round text-primary text-sm">
                near_me
              </span>
              <span>{trip.distance.toFixed(1)} km</span>
            </div>
            <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
            <div className="flex items-center gap-1">
              <span className="material-icons-round text-green-500 text-sm">
                payments
              </span>
              <span>฿{trip.fare.toFixed(2)}</span>
            </div>
            <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
            <span>{trip.duration} นาที</span>
          </div>
        </div>

        {/* Star Rating Section */}
        <div className="flex justify-center gap-2 mb-10">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="group transition-transform hover:scale-110 focus:outline-none"
            >
              <span
                className={`material-icons-round text-5xl drop-shadow-sm ${
                  star <= rating
                    ? 'text-yellow-400'
                    : 'text-slate-200 dark:text-slate-600'
                }`}
              >
                star
              </span>
            </button>
          ))}
        </div>

        {/* Feedback Chips */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 text-center">
            สิ่งที่ดีเยี่ยม?
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {FEEDBACK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-[#15262a]'
                    : 'bg-neutral-surface dark:bg-neutral-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent hover:border-primary/20'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Comment Box */}
        <div className="mb-6">
          <label className="sr-only" htmlFor="comment">
            เขียนความเห็น
          </label>
          <div className="relative">
            <textarea
              id="comment"
              placeholder="บอกเราเพิ่มเติมเกี่ยวกับการเดินทางของคุณ... (ไม่บังคับ)"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 150))}
              rows={4}
              className="w-full bg-neutral-surface dark:bg-neutral-surface-dark rounded-xl border-0 p-4 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-primary resize-none"
            />
            <div className="absolute bottom-3 right-3 text-xs text-slate-400">
              {comment.length}/150
            </div>
          </div>
        </div>

        {/* Favorite Driver Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 mb-4 bg-white dark:bg-[#15262a]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-600 dark:text-yellow-400">
              <span className="material-icons-round text-xl">favorite</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                เพิ่มคนขับรายนี้เป็นรายโปรด?
              </p>
              <p className="text-xs text-slate-500">จองง่ายขึ้นในครั้งต่อไป</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input className="sr-only peer" type="checkbox" defaultValue="" />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-[#15262a] dark:via-[#15262a]">
        <button
          onClick={handleSubmitRating}
          disabled={submitting || rating === 0}
          className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span>
            {submitting ? 'กำลังบันทึก...' : 'ส่งการให้คะแนน'}
          </span>
          <span className="material-icons-round text-lg">arrow_forward</span>
        </button>
      </div>
    </main>
  );
}
