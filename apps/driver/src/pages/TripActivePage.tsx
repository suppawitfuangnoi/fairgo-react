import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient, socketEvents } from '@fairgo/api-client';
import { toast } from '@/lib/toast';

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
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const response = await apiFetch<Trip>('/api/v1/trips/active');
        if (response) setTrip(response);
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

    // Fallback poll every 12s
    pollRef.current = setInterval(fetchTrip, 12000);

    return () => {
      socket.off(socketEvents.ON_TRIP_STATUS, onTripStatus);
      socket.off('chat:message', onChatMessage);
      clearInterval(pollRef.current!);
    };
  }, [navigate, scrollChatToBottom]);

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
      await apiFetch(`/api/v1/trips/${trip.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
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

  useEffect(() => {
    if (chatOpen) { setUnreadCount(0); scrollChatToBottom(); }
  }, [chatOpen, scrollChatToBottom]);

  useEffect(() => {
    if (trip?.id) socketClient.joinRoom(`trip:${trip.id}`);
  }, [trip?.id]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center pb-6 relative">
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
              <div className="flex gap-2">
                <button
                  onClick={handleCallPassenger}
                  className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary-dark transition"
                >
                  <span className="material-symbols-outlined">call</span>
                </button>
                <button
                  onClick={() => setChatOpen(true)}
                  className="relative w-12 h-12 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                >
                  <span className="material-symbols-outlined">chat</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
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
