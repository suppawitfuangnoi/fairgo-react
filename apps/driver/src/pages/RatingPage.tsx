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

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-white flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-6 pt-12 pb-2 z-10 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>
        <span className="text-xs font-bold tracking-widest uppercase text-primary">Ride Completed</span>
        <div className="w-10"></div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-32">
        {loading ? (
          <div className="flex flex-col items-center pt-8">
            <div className="w-24 h-24 rounded-full bg-slate-100 animate-pulse mb-4"></div>
            <div className="h-6 w-48 bg-slate-100 animate-pulse rounded-lg mb-2"></div>
            <div className="h-4 w-32 bg-slate-100 animate-pulse rounded-lg"></div>
          </div>
        ) : (
          <>
            {/* Customer Profile */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary to-blue-400">
                  {trip?.customer?.avatarUrl ? (
                    <img
                      src={trip.customer.avatarUrl}
                      alt="Customer"
                      className="w-full h-full object-cover rounded-full border-4 border-white"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border-4 border-white bg-slate-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-slate-400 text-3xl">person</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-white rounded-full p-1.5 shadow-md">
                  <div className="bg-green-500 w-3 h-3 rounded-full"></div>
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-1 text-slate-900">How was your customer?</h1>
              <p className="text-slate-500 text-sm mb-4">
                with <span className="font-semibold text-slate-800">{trip?.customer?.name || 'Passenger'}</span>
              </p>

              {/* Trip Details Pill */}
              <div className="inline-flex items-center bg-slate-50 px-4 py-2 rounded-lg text-xs font-medium text-slate-600 gap-3">
                {trip?.distance != null && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-primary text-sm">near_me</span>
                      <span>{trip.distance.toFixed(1)} km</span>
                    </div>
                    <div className="w-px h-3 bg-slate-300"></div>
                  </>
                )}
                {trip?.fare != null && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-green-500 text-sm">payments</span>
                      <span>${trip.fare.toFixed(2)}</span>
                    </div>
                    {trip.duration && <div className="w-px h-3 bg-slate-300"></div>}
                  </>
                )}
                {trip?.duration && <span>{trip.duration} min</span>}
              </div>
            </div>

            {/* Star Rating */}
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
                    className={`material-symbols-outlined text-5xl drop-shadow-sm transition-colors ${
                      star <= displayRating
                        ? 'text-yellow-400'
                        : 'text-slate-200 group-hover:text-yellow-200'
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
              <h2 className="text-sm font-semibold text-slate-900 mb-4 text-center">What went well?</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {FEEDBACK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => toggleChip(chip)}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                      selectedChips.includes(chip)
                        ? 'bg-primary text-white shadow-lg ring-2 ring-primary ring-offset-2'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent hover:border-primary/20'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-6">
              <div className="relative">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value.slice(0, 150))}
                  placeholder="Tell us more about the passenger... (optional)"
                  rows={4}
                  className="w-full bg-slate-50 rounded-xl border-0 p-4 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary resize-none outline-none"
                />
                <div className="absolute bottom-3 right-3 text-xs text-slate-400">
                  {comment.length}/150
                </div>
              </div>
            </div>

            {/* Add to Favorites */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 mb-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg text-yellow-600">
                  <span className="material-symbols-outlined text-xl">favorite</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Add to preferred customers?</p>
                  <p className="text-xs text-slate-500">Prioritize their requests in future.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={addFavorite}
                  onChange={e => setAddFavorite(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Sticky Submit */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent">
        <button
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          className="w-full bg-primary hover:bg-[#0ea5c6] text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Submit Feedback</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </>
          )}
        </button>
        {rating === 0 && (
          <p className="text-center text-xs text-slate-400 mt-2">Please select a star rating to continue</p>
        )}
      </div>
    </div>
  );
}
