import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

type TripStatus =
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'PICKUP_CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

interface Trip {
  id: string;
  status: TripStatus;
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distance: string;
  duration: string;
}

const STATUS_PROGRESS: Record<TripStatus, number> = {
  DRIVER_ASSIGNED: 20,
  DRIVER_EN_ROUTE: 40,
  DRIVER_ARRIVED: 60,
  PICKUP_CONFIRMED: 75,
  IN_PROGRESS: 90,
  COMPLETED: 100,
};

const STATUS_LABELS: Record<TripStatus, string> = {
  DRIVER_ASSIGNED: 'Assigned',
  DRIVER_EN_ROUTE: 'En Route',
  DRIVER_ARRIVED: 'Arrived',
  PICKUP_CONFIRMED: 'In Progress',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

const STATUS_ACTIONS: Record<TripStatus, string> = {
  DRIVER_ASSIGNED: 'นำทางไปรับผู้โดยสาร',
  DRIVER_EN_ROUTE: 'ถึงจุดรับแล้ว',
  DRIVER_ARRIVED: 'ผู้โดยสารขึ้นรถแล้ว',
  PICKUP_CONFIRMED: 'ถึงปลายทางแล้ว',
  IN_PROGRESS: 'ถึงปลายทางแล้ว',
  COMPLETED: 'Completed',
};

const NEXT_STATUS: Record<TripStatus, TripStatus> = {
  DRIVER_ASSIGNED: 'DRIVER_EN_ROUTE',
  DRIVER_EN_ROUTE: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED: 'PICKUP_CONFIRMED',
  PICKUP_CONFIRMED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'COMPLETED',
};

export default function TripActivePage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const response = await apiFetch<Trip>('/trips/active');
        setTrip(response);
      } catch (err) {
        setError('Failed to load trip');
      }
    };

    fetchTrip();
    const interval = setInterval(fetchTrip, 5000);
    setPollInterval(interval);

    return () => clearInterval(interval);
  }, []);

  if (!trip) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">Loading trip...</p>
        </div>
      </div>
    );
  }

  const progress = STATUS_PROGRESS[trip.status];

  const handleNextStatus = async () => {
    if (trip.status === 'COMPLETED') {
      navigate(`/trip-summary/${trip.id}`, { replace: true });
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nextStatus = NEXT_STATUS[trip.status];
      await apiFetch(`/trips/${trip.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });

      setTrip({ ...trip, status: nextStatus });

      if (nextStatus === 'COMPLETED') {
        setTimeout(() => {
          navigate(`/trip-summary/${trip.id}`, { replace: true });
        }, 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trip status');
    } finally {
      setLoading(false);
    }
  };

  const handleCallPassenger = () => {
    window.location.href = `tel:${trip.passengerPhone}`;
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center pb-6">
      <div className="max-w-md w-full mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[850px]">
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">9:41</span>
          <div className="flex gap-1.5 items-center text-xs text-slate-900 dark:text-white">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        <div className="relative h-40 bg-gradient-to-b from-slate-100 to-transparent dark:from-slate-800 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full bg-no-repeat bg-cover bg-center opacity-60 dark:opacity-30"></div>
          <div className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Current Status</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {STATUS_LABELS[trip.status]}
            </h2>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                Trip Progress
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {progress}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-background-light dark:bg-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200">
                {trip.passengerName[0]}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white">{trip.passengerName}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{trip.passengerPhone}</p>
              </div>
              <button
                onClick={handleCallPassenger}
                className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary-dark transition"
              >
                <span className="material-symbols-outlined">call</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pickup</p>
                <p className="font-semibold text-slate-900 dark:text-white">{trip.pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Dropoff</p>
                <p className="font-semibold text-slate-900 dark:text-white">{trip.dropoffAddress}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-300 dark:border-slate-700">
                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fare</p>
                  <p className="font-bold text-primary">฿{trip.fare}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Distance</p>
                  <p className="font-bold text-slate-900 dark:text-white">{trip.distance}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Duration</p>
                  <p className="font-bold text-slate-900 dark:text-white">{trip.duration}</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm mt-4">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 mt-auto">
          <button
            onClick={handleNextStatus}
            disabled={loading || trip.status === 'COMPLETED'}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                Updating...
              </>
            ) : (
              <>
                <span>{STATUS_ACTIONS[trip.status]}</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
