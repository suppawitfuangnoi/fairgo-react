import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { socketClient, socketEvents } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { IMG } from '@/lib/assets';

const styles = `
  .map-bg {
    background-color: #e5e7eb;
    background-image:
      linear-gradient(#d1d5db 2px, transparent 2px),
      linear-gradient(90deg, #d1d5db 2px, transparent 2px);
    background-size: 40px 40px;
  }
  .dark .map-bg {
    background-color: #1f2937;
    background-image:
      linear-gradient(#374151 2px, transparent 2px),
      linear-gradient(90deg, #374151 2px, transparent 2px);
    background-size: 40px 40px;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;

interface ChatMessage {
  id: string;
  from: 'me' | 'customer';
  text: string;
  timestamp: Date;
}

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

function mapTrip(o: any): Trip {
  const passengerName =
    o.rideRequest?.customerProfile?.user?.name ||
    o.customerProfile?.user?.name ||
    o.customer?.name ||
    o.passengerName ||
    null;
  const passengerPhone =
    o.rideRequest?.customerProfile?.user?.phone ||
    o.customerProfile?.user?.phone ||
    o.customer?.phone ||
    o.passengerPhone ||
    '';
  return {
    id: o.id,
    status: o.status,
    passengerName: passengerName || passengerPhone || 'ผู้โดยสาร',
    passengerPhone,
    pickupAddress: o.pickupAddress || '',
    dropoffAddress: o.dropoffAddress || '',
    fare:
      o.lockedFare ??
      o.offer?.fareAmount ??
      o.acceptedOffer?.fareAmount ??
      o.offers?.find((of: any) => of.status === 'ACCEPTED')?.fareAmount ??
      o.fare ??
      0,
    distance: o.actualDistance
      ? `${Number(o.actualDistance).toFixed(1)} km`
      : o.estimatedDistance
      ? `${Number(o.estimatedDistance).toFixed(1)} km`
      : o.distance || '',
    duration: o.actualDuration
      ? `${o.actualDuration} min`
      : o.estimatedDuration
      ? `${o.estimatedDuration} min`
      : o.duration || '',
  };
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
  const { position } = useGeolocation();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  const tripRef = useRef<Trip | null>(null);

  // Keep positionRef in sync with position state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const response = await apiFetch<any>('/trips/active');
        if (response) {
          const mapped = mapTrip(response);
          setTrip(mapped);
          tripRef.current = mapped;
        }
        if (response?.status === 'COMPLETED') {
          navigate(`/trip-summary/${response.id}`, { replace: true });
        }
      } catch {
        setError('Failed to load trip');
      }
    };

    fetchTrip();

    // Socket: real-time status updates from customer/server
    const socket = socketClient.connect();
    const onTripStatus = (update: { id: string; status: TripStatus }) => {
      setTrip(prev => {
        if (!prev) return prev;
        return { ...prev, status: update.status };
      });
      if (update.status === 'COMPLETED') {
        navigate(`/trip-summary/${update.id}`, { replace: true });
      }
    };
    socket.on(socketEvents.ON_TRIP_STATUS, onTripStatus);

    // In-app chat: receive messages from customer
    const onChatMessage = (msg: { fromRole: string; text: string; timestamp: string }) => {
      if (msg.fromRole === 'CUSTOMER') {
        const newMsg: ChatMessage = {
          id: `${Date.now()}-customer`,
          from: 'customer',
          text: msg.text,
          timestamp: new Date(msg.timestamp),
        };
        setMessages(prev => [...prev, newMsg]);
        setUnreadCount(prev => prev + 1);
        scrollChatToBottom();
        toast.info(`ผู้โดยสาร: ${msg.text}`);
      }
    };
    socket.on('chat:message', onChatMessage);

    // Broadcast driver GPS location every 3 seconds
    const locationInterval = setInterval(() => {
      const pos = positionRef.current;
      if (tripRef.current?.id && pos) {
        socketClient.emit('driver:location', {
          tripId: tripRef.current.id,
          lat: pos.lat,
          lng: pos.lng,
          heading: 0,
        });
      }
    }, 3000);

    // Update location via REST API every 30 seconds
    const restLocationInterval = setInterval(async () => {
      const pos = positionRef.current;
      if (tripRef.current?.id && pos) {
        try {
          await apiFetch(`/trips/${tripRef.current.id}/location`, {
            method: 'PATCH',
            body: { lat: pos.lat, lng: pos.lng, heading: 0 },
          });
        } catch { /* ignore */ }
      }
    }, 30000);

    // Fallback poll every 12s
    pollRef.current = setInterval(fetchTrip, 12000);

    return () => {
      socket.off(socketEvents.ON_TRIP_STATUS, onTripStatus);
      socket.off('chat:message', onChatMessage);
      clearInterval(pollRef.current!);
      clearInterval(locationInterval);
      clearInterval(restLocationInterval);
    };
  }, [navigate, scrollChatToBottom]);

  // These hooks MUST be before any early return to satisfy Rules of Hooks
  useEffect(() => {
    if (chatOpen) { setUnreadCount(0); scrollChatToBottom(); }
  }, [chatOpen, scrollChatToBottom]);

  useEffect(() => {
    if (trip?.id) socketClient.joinRoom(`trip:${trip.id}`);
  }, [trip?.id]);

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
        toast.success('การเดินทางเสร็จสิ้น!');
        setTimeout(() => {
          navigate(`/trip-summary/${trip.id}`, { replace: true });
        }, 1000);
      }
    } catch (err) {
      toast.error('ไม่สามารถอัปเดตสถานะได้');
      setError(err instanceof Error ? err.message : 'Failed to update trip status');
    } finally {
      setLoading(false);
    }
  };

  const handleCallPassenger = () => {
    window.location.href = `tel:${trip.passengerPhone}`;
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !trip) return;
    const text = chatInput.trim();
    const newMsg: ChatMessage = { id: `${Date.now()}-me`, from: 'me', text, timestamp: new Date() };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    scrollChatToBottom();
    socketClient.emit('chat:message', { tripId: trip.id, text, fromRole: 'DRIVER' });
  };

  return (
    <>
      <style>{styles}</style>
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display relative overflow-hidden">
      {/* Interactive Map Layer (Background) */}
      {!chatOpen && (
        <div className="absolute inset-0 z-0 w-full h-full">
          <GoogleMap
            center={position}
            zoom={15}
            markers={[
              { lat: position.lat, lng: position.lng, color: 'green', pulse: true, label: 'ตำแหน่งของคุณ' },
              { lat: 13.7563, lng: 100.5018, color: 'blue', label: 'ผู้โดยสาร' },
            ]}
            className="absolute inset-0 w-full h-full"
            showTraffic={true}
          />
        </div>
      )}

      {/* Chat Panel Overlay */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 max-w-md mx-auto">
          <div className="flex items-center gap-3 px-4 pt-14 pb-4 border-b border-slate-100 dark:border-slate-800 shadow-sm">
            <button onClick={() => setChatOpen(false)} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-sm">person</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">{trip.passengerName}</p>
              <p className="text-xs text-emerald-500 font-medium">ผู้โดยสาร</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50 dark:bg-slate-800">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-slate-300 text-5xl mb-3 block">chat</span>
                <p className="text-slate-400 text-sm">เริ่มการสนทนากับผู้โดยสาร</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                {msg.from === 'customer' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mr-2 mt-auto shrink-0">
                    <span className="material-symbols-outlined text-slate-500 text-xs">person</span>
                  </div>
                )}
                <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  msg.from === 'me' ? 'bg-primary text-white rounded-br-sm' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-bl-sm'
                }`}>
                  <p>{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.from === 'me' ? 'text-white/70' : 'text-slate-400'}`}>
                    {msg.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 pb-8">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim()}
              className="w-11 h-11 rounded-full bg-primary disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-white text-xl">send</span>
            </button>
          </div>
        </div>
      )}

      {!chatOpen && (
        <>
          {/* Top Status Header & SOS */}
          <div className="fixed top-0 left-0 w-full z-[9998] pt-14 px-5 flex justify-between items-start pointer-events-none">
            {/* Status Pill */}
            <div className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-soft rounded-xl p-3 pr-5 flex items-center gap-3 max-w-[75%] border border-slate-100 dark:border-slate-700">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary text-xl">near_me</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">Status</p>
                <p className="text-sm font-bold leading-tight">
                  {trip.status === 'DRIVER_EN_ROUTE' || trip.status === 'DRIVER_ASSIGNED'
                    ? `Arriving in 5 mins`
                    : STATUS_LABELS[trip.status]}
                </p>
              </div>
            </div>
            {/* SOS / Safety Shield */}
            <button className="pointer-events-auto w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-soft flex items-center justify-center border border-slate-100 dark:border-slate-700 active:scale-95 transition-transform group">
              <span className="material-icons-round text-slate-400 group-hover:text-primary transition-colors text-2xl">shield</span>
            </button>
          </div>

          {/* Bottom Sheet (Driver Info & Controls) */}
          <div className="fixed bottom-0 left-0 w-full z-[9999]">
            {/* Floating Chat Bubble Indicator */}
            <div className="absolute -top-14 right-5 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-bounce">
              Driver is nearby!
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-t-3xl shadow-up p-6 pb-8 border-t border-slate-100 dark:border-slate-700">
              {/* Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full mx-auto mb-6"></div>

              {/* Driver Profile & Car */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 border-4 border-slate-50 dark:border-slate-700 shadow-sm">
                      <img src={IMG.passengerMale} className="w-full h-full object-cover rounded-full" alt="passenger" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 p-1 rounded-full">
                      <div className="flex items-center gap-0.5 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full border border-yellow-100 dark:border-yellow-700">
                        <span className="material-icons-round text-yellow-400 text-[10px]">star</span>
                        <span className="text-[10px] font-bold text-slate-700 dark:text-yellow-100">4.9</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{trip.passengerName}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Passenger</p>
                  </div>
                </div>
                {/* Fare Badge */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary tracking-tight">฿{trip.fare}</div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    <span className="material-icons-round text-[10px]">lock</span>
                    Price locked
                  </div>
                </div>
              </div>

              {/* Microcopy Message */}
              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg p-3 mb-6 flex items-start gap-3">
                <span className="material-icons-round text-primary text-lg mt-0.5">verified_user</span>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    ล็อกราคาแล้ว สบายใจได้
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Your fare is fixed. No surprises at the end of the trip.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  onClick={() => setChatOpen(true)}
                  className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold active:scale-[0.98] transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span className="material-icons-round text-xl">chat_bubble_outline</span>
                  Chat
                </button>
                <button
                  onClick={handleCallPassenger}
                  className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold active:scale-[0.98] transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span className="material-icons-round text-xl">call</span>
                  โทรหา
                </button>
              </div>

              {/* Primary Status Action Button */}
              {trip.status !== 'COMPLETED' && (
                <button
                  onClick={handleNextStatus}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-primary text-white font-bold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-all hover:bg-primary-dark disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-icons-round text-xl">arrow_forward</span>
                      {STATUS_ACTIONS[trip.status]}
                    </>
                  )}
                </button>
              )}

              {/* Bottom safe area spacer */}
              <div className="h-4 w-full"></div>
            </div>
          </div>
        </>
      )}
    </div>
  </>
  );
}
