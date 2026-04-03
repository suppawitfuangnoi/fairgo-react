import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface TripSummary {
  id: string;
  fare: number;
  baseFare: number;
  fairPriceDeal?: number;
  distance: number;
  duration?: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime?: string;
  dropoffTime?: string;
  customer?: { name: string; avatarUrl?: string; rating?: number };
  paymentMethod?: string;
  status: string;
}

export default function TripSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrip();
  }, [id]);

  async function fetchTrip() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: TripSummary }>(`/api/v1/trips/${id}`);
      if (res.data) setTrip(res.data);
    } catch {
      // Minimal fallback
    } finally {
      setLoading(false);
    }
  }

  function formatTime(dateStr?: string) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function handleGoHome() {
    navigate('/home', { replace: true });
  }

  function handleRateCustomer() {
    navigate(`/rating/${id}`);
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col relative overflow-hidden">
      {/* Decorative Header Gradient */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/20 to-transparent pointer-events-none z-0"></div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto relative z-10 px-6 pt-12 pb-28">
        {loading ? (
          <div className="flex flex-col items-center pt-8 animate-pulse">
            <div className="w-20 h-20 rounded-full bg-slate-200 mb-6"></div>
            <div className="h-8 w-48 bg-slate-200 rounded-lg mb-2"></div>
            <div className="h-4 w-32 bg-slate-200 rounded-lg mb-8"></div>
            <div className="w-full bg-white rounded-2xl h-48"></div>
          </div>
        ) : (
          <>
            {/* Success Header */}
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center shadow-lg mb-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Trip Complete!</h1>
              <p className="text-slate-500">Great job on completing the ride.</p>
            </div>

            {/* Receipt Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-primary/10 overflow-hidden mb-6">
              {/* Total Earned */}
              <div className="bg-primary/5 p-6 text-center border-b border-dashed border-primary/20">
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">You Earned</p>
                <h2 className="text-4xl font-bold text-primary">
                  ${(trip?.fare ?? 0).toFixed(2)}
                </h2>
              </div>

              {/* Route Details */}
              <div className="p-6">
                <div className="relative pl-8 border-l-2 border-slate-100 space-y-8">
                  {/* Pickup */}
                  <div className="relative">
                    <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full border-4 border-white bg-slate-300"></div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold mb-0.5">{formatTime(trip?.pickupTime)}</p>
                      <p className="text-slate-900 font-medium">{trip?.pickupAddress || 'Pickup location'}</p>
                    </div>
                  </div>
                  {/* Dropoff */}
                  <div className="relative">
                    <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full border-4 border-white bg-primary"></div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold mb-0.5">{formatTime(trip?.dropoffTime)}</p>
                      <p className="text-slate-900 font-medium">{trip?.dropoffAddress || 'Dropoff location'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="px-6 pb-6 pt-2 flex items-center justify-between border-t border-slate-100 mt-2">
                <div className="flex items-center gap-3 pt-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden">
                    {trip?.customer?.avatarUrl ? (
                      <img src={trip.customer.avatarUrl} alt="customer" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-slate-400">person</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{trip?.customer?.name || 'Passenger'}</p>
                    <p className="text-xs text-slate-500">
                      {trip?.distance?.toFixed(1) ?? 0} km
                      {trip?.duration ? ` • ${trip.duration} min` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRateCustomer}
                  className="flex items-center gap-1 pt-4 text-xs font-semibold text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  Rate
                </button>
              </div>
            </div>

            {/* Earnings Breakdown */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">receipt_long</span>
                Earnings Breakdown
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Base Fare</span>
                  <span className="text-slate-900 font-medium">${(trip?.baseFare ?? trip?.fare ?? 0).toFixed(2)}</span>
                </div>
                {trip?.fairPriceDeal != null && trip.fairPriceDeal > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-primary font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">handshake</span>
                      Fair Price Deal
                    </span>
                    <span className="text-primary font-bold">-${trip.fairPriceDeal.toFixed(2)}</span>
                  </div>
                )}
                <div className="h-px bg-slate-100 my-1"></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-900 font-bold">Total Earned</span>
                  <span className="text-primary font-bold text-lg">${(trip?.fare ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-slate-400">Payment</span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">credit_card</span>
                    {trip?.paymentMethod || 'Card'}
                  </span>
                </div>
              </div>
            </div>

            {/* Report Issue */}
            <div className="text-center mb-8">
              <button className="text-sm text-slate-400 hover:text-primary transition-colors">
                Report an issue with this trip
              </button>
            </div>
          </>
        )}
      </div>

      {/* Fixed Bottom CTA */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t border-slate-100 p-6 z-20 pb-8">
        <button
          onClick={handleGoHome}
          className="w-full bg-primary hover:bg-[#0ea5c6] text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 group"
        >
          Go Home
          <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
