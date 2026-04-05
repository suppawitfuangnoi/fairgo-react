import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface TripForRating {
  id: string;
  customer?: { name: string; avatarUrl?: string };
  fare: number;
  distance: number;
  duration?: number;
}

const FEEDBACK_CHIPS = ['Polite passenger', 'On time', 'Easy to find', 'Great tipper', 'Good communication', 'Respectful'];

export default function RatingPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripForRating | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [addFavorite, setAddFavorite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrip();
  }, [tripId]);

  async function fetchTrip() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: TripForRating }>(`/api/v1/trips/${tripId}`);
      if (res.data) setTrip(res.data);
    } catch {
      // Fallback
      setTrip({ id: tripId!, fare: 0, distance: 0 });
    } finally {
      setLoading(false);
    }
  }

  function toggleChip(chip: string) {
    setSelectedChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  }

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/trips/${tripId}/rate`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          tags: selectedChips,
        }),
      });
      navigate('/home', { replace: true });
    } catch (err: any) {
      alert(err?.message || 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  }

  const displayRating = hoverRating || rating;

  const styles = `
    .star-filled {
      font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48;
      color: #fbbf24;
    }
    .star-empty {
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 48;
      color: #d1d5db;
    }
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .no-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <main className="w-full max-w-md h-screen max-h-[900px] bg-white dark:bg-[#15262a] shadow-2xl relative overflow-hidden flex flex-col mx-auto">
        {/* Top Navigation / Close */}
        <header className="flex justify-between items-center p-6 pb-2 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-neutral-surface dark:hover:bg-neutral-surface-dark transition-colors text-slate-400 dark:text-slate-500"
          >
            <span className="material-icons-round text-2xl">close</span>
          </button>
          <span className="text-xs font-bold tracking-widest uppercase text-primary">Ride Completed</span>
          <div className="w-10"></div>
        </header>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-4 pb-24">
        {loading ? (
          <div className="flex flex-col items-center pt-8">
            <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse mb-4"></div>
            <div className="h-6 w-48 bg-slate-100 dark:bg-slate-700 animate-pulse rounded-lg mb-2"></div>
            <div className="h-4 w-32 bg-slate-100 dark:bg-slate-700 animate-pulse rounded-lg"></div>
          </div>
        ) : (
          <>
            {/* Driver Profile & Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary to-blue-400">
                  {trip?.customer?.avatarUrl ? (
                    <img
                      src={trip.customer.avatarUrl}
                      alt="Driver"
                      className="w-full h-full object-cover rounded-full border-4 border-white dark:border-[#15262a]"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border-4 border-white dark:border-[#15262a] bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <span className="material-icons-round text-slate-400 dark:text-slate-300 text-3xl">person</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-white dark:bg-[#15262a] rounded-full p-1.5 shadow-md">
                  <div className="bg-green-500 w-3 h-3 rounded-full"></div>
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-1 text-slate-900 dark:text-white">How was your customer?</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
                with <span className="font-semibold text-slate-800 dark:text-slate-200">{trip?.customer?.name || 'Passenger'}</span>
              </p>

              {/* Trip Details Pill */}
              <div className="inline-flex items-center bg-neutral-surface dark:bg-neutral-surface-dark px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 gap-3">
                {trip?.distance != null && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="material-icons-round text-primary text-sm">near_me</span>
                      <span>{trip.distance.toFixed(1)} km</span>
                    </div>
                    <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
                  </>
                )}
                {trip?.fare != null && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="material-icons-round text-green-500 text-sm">payments</span>
                      <span>${trip.fare.toFixed(2)}</span>
                    </div>
                    {trip.duration && <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>}
                  </>
                )}
                {trip?.duration && <span>{trip.duration} min</span>}
              </div>
            </div>

            {/* Star Rating Section */}
            <div className="flex justify-center gap-2 mb-10">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="group transition-transform hover:scale-110 focus:outline-none"
                >
                  <span
                    className={`material-icons-round text-5xl drop-shadow-sm transition-colors ${
                      star <= displayRating
                        ? 'text-yellow-400'
                        : 'text-slate-200 dark:text-slate-600 group-hover:text-yellow-200'
                    }`}
                    style={{ fontVariationSettings: star <= displayRating ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>

            {/* Feedback Chips */}
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 text-center">What went well?</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {FEEDBACK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => toggleChip(chip)}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                      selectedChips.includes(chip)
                        ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-2 ring-primary ring-offset-2 dark:ring-offset-[#15262a]'
                        : 'bg-neutral-surface dark:bg-neutral-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent hover:border-primary/20'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment Box */}
            <div className="mb-6">
              <label className="sr-only" htmlFor="comment">Leave a comment</label>
              <div className="relative">
                <textarea
                  id="comment"
                  value={comment}
                  onChange={e => setComment(e.target.value.slice(0, 150))}
                  placeholder="Tell us more about the passenger... (optional)"
                  rows={4}
                  className="w-full bg-neutral-surface dark:bg-neutral-surface-dark rounded-xl border-0 p-4 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary resize-none outline-none"
                />
                <div className="absolute bottom-3 right-3 text-xs text-slate-400 dark:text-slate-500">
                  {comment.length}/150
                </div>
              </div>
            </div>

            {/* Add to Favorites Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 mb-4 bg-white dark:bg-[#15262a]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-600 dark:text-yellow-400">
                  <span className="material-icons-round text-xl">favorite</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Add driver to favorites?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Book them again easily next time.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={addFavorite}
                  onChange={e => setAddFavorite(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Sticky Bottom Action */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-[#15262a] dark:via-[#15262a]">
        <button
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Submit Feedback</span>
              <span className="material-icons-round text-lg">arrow_forward</span>
            </>
          )}
        </button>
        {rating === 0 && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">Please select a star rating to continue</p>
        )}
      </div>
    </main>
    </>
  );
}
