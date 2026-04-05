import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient, socketEvents } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { IMG } from '@/lib/assets';

interface ActiveTrip {
  id: string;
  status: 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';
  driverName: string;
  driverRating: number;
  driverPhone: string;
  vehiclePlate: string;
  fare: number;
  estimatedArrival: number;
}

interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
}

interface ChatMessage {
  id: string;
  from: 'me' | 'driver';
  text: string;
  timestamp: Date;
}

// Bangkok bounding box for SVG mapping (rough)
const BBOX = { latMin: 13.60, latMax: 13.90, lngMin: 100.35, lngMax: 100.70 };

function latLngToSvgPercent(lat: number, lng: number) {
  const x = ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * 100;
  const y = (1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * 100;
  return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(85, y)) };
}

export default function TripActivePage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout>>();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const tripIdRef = useRef<string | null>(null);

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const response = await apiFetch<ActiveTrip>('/trips/active');
        if (response.status === 'COMPLETED') {
          navigate(`/trip-summary/${response.id}`, { replace: true });
        } else {
          setTrip(response);
          tripIdRef.current = response.id;
        }
      } catch (err) {
        console.error('Failed to fetch active trip:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrip();

    const socket = socketClient.connect();

    // Trip status updates
    const onTripStatus = (update: { id: string; status: string; estimatedArrival?: number }) => {
      setTrip(prev => {
        if (!prev) return prev;
        const updated = { ...prev, status: update.status as ActiveTrip['status'], estimatedArrival: update.estimatedArrival ?? prev.estimatedArrival };
        if (update.status === 'COMPLETED') navigate(`/trip-summary/${prev.id}`, { replace: true });
        if (update.status === 'DRIVER_ARRIVED') toast.success('คนขับมาถึงแล้ว!');
        if (update.status === 'IN_PROGRESS') toast.info('เริ่มการเดินทางแล้ว');
        return updated;
      });
    };

    // Driver location real-time
    const onDriverLocation = (loc: { lat: number; lng: number; heading?: number }) => {
      setDriverLocation(loc);
    };

    // In-app chat message received
    const onChatMessage = (msg: { fromRole: string; text: string; timestamp: string }) => {
      if (msg.fromRole === 'DRIVER') {
        const newMsg: ChatMessage = {
          id: `${Date.now()}-driver`,
          from: 'driver',
          text: msg.text,
          timestamp: new Date(msg.timestamp),
        };
        setMessages(prev => [...prev, newMsg]);
        setUnreadCount(prev => prev + 1);
        scrollChatToBottom();
        toast.info(`คนขับ: ${msg.text}`);
      }
    };

    socket.on(socketEvents.ON_TRIP_STATUS, onTripStatus);
    socket.on(socketEvents.ON_DRIVER_LOCATION, onDriverLocation);
    socket.on('chat:message', onChatMessage);

    pollIntervalRef.current = setInterval(fetchTrip, 10000);

    return () => {
      socket.off(socketEvents.ON_TRIP_STATUS, onTripStatus);
      socket.off(socketEvents.ON_DRIVER_LOCATION, onDriverLocation);
      socket.off('chat:message', onChatMessage);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [navigate, scrollChatToBottom]);

  // Join trip room when tripId is known
  useEffect(() => {
    if (trip?.id) {
      socketClient.joinRoom(`trip:${trip.id}`);
    }
  }, [trip?.id]);

  // Scroll chat when opened
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0);
      scrollChatToBottom();
    }
  }, [chatOpen, scrollChatToBottom]);

  const handleCancelTrip = async () => {
    if (!trip) return;
    try {
      await apiFetch(`/trips/${trip.id}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' },
      });
      navigate('/home', { replace: true });
    } catch {
      toast.error('ยกเลิกไม่สำเร็จ');
    }
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !trip) return;
    const text = chatInput.trim();
    const newMsg: ChatMessage = { id: `${Date.now()}-me`, from: 'me', text, timestamp: new Date() };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    scrollChatToBottom();
    socketClient.emit('chat:message', { tripId: trip.id, text, fromRole: 'CUSTOMER' });
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'DRIVER_EN_ROUTE': return 'คนขับกำลังมา';
      case 'DRIVER_ARRIVED': return 'คนขับมาถึงแล้ว!';
      case 'IN_PROGRESS': return 'กำลังเดินทาง';
      default: return 'กำลังเตรียมการ';
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="w-full max-w-md mx-auto h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <span className="material-icons-round text-6xl text-slate-400 mb-4">info</span>
          <p className="text-slate-600">ไม่พบการเดินทางที่ใช้งานอยู่</p>
        </div>
      </div>
    );
  }

  // Map SVG positions
  const carPos = driverLocation
    ? latLngToSvgPercent(driverLocation.lat, driverLocation.lng)
    : { x: 45, y: 55 }; // Default mock position

  const destPos = { x: 78, y: 75 };

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-slate-100 overflow-hidden relative flex flex-col font-display shadow-2xl">

      {/* ── MAP ── */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <img src={IMG.mapBackground} className="absolute inset-0 w-full h-full object-cover" alt="map" />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Route path */}
          <path
            d={`M ${carPos.x} ${carPos.y} Q 60 60 ${destPos.x} ${destPos.y}`}
            fill="none"
            stroke="#13c8ec"
            strokeWidth="1.5"
            strokeDasharray="3 2"
            opacity="0.8"
          />
        </svg>

        {/* Driver Car — animates smoothly as location updates */}
        <div
          className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-[1200ms] ease-in-out"
          style={{ left: `${carPos.x}%`, top: `${carPos.y}%` }}
        >
          <div
            className="bg-white p-2 rounded-full shadow-lg border-2 border-primary"
            style={{ transform: driverLocation?.heading ? `rotate(${driverLocation.heading}deg)` : undefined }}
          >
            <span className="material-icons-round text-primary text-xl block">directions_car</span>
          </div>
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping pointer-events-none scale-150"></div>
        </div>

        {/* Destination Pin */}
        <div
          className="absolute z-10 transform -translate-x-1/2 -translate-y-full"
          style={{ left: `${destPos.x}%`, top: `${destPos.y}%` }}
        >
          <div className="bg-slate-900 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md mb-1 whitespace-nowrap text-center">
            ปลายทาง
          </div>
          <span className="material-icons-round text-slate-900 text-3xl block text-center drop-shadow-md">location_on</span>
        </div>
      </div>

      {/* ── TOP STATUS BAR ── */}
      <div className="absolute top-0 left-0 w-full z-20 pt-12 px-5 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md shadow-lg rounded-xl p-3 pr-5 flex items-center gap-3 max-w-[75%] border border-slate-100">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-icons-round text-primary text-xl">near_me</span>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">สถานะ</p>
            <p className="text-sm font-bold leading-tight">
              {getStatusText(trip.status)}{' '}
              {trip.estimatedArrival > 0 && (
                <span className="text-primary">{trip.estimatedArrival} นาที</span>
              )}
            </p>
          </div>
        </div>

        {/* Location indicator — shows real-time dot */}
        <div className="pointer-events-auto bg-white/95 shadow-lg rounded-full w-12 h-12 flex items-center justify-center border border-slate-100">
          <div className="relative">
            <span className="material-icons-round text-slate-400 text-xl">my_location</span>
            {driverLocation && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse"></span>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM SHEET ── */}
      <div className="absolute bottom-0 left-0 w-full z-30">
        <div className="bg-white rounded-t-3xl shadow-2xl p-6 pb-8 border-t border-slate-100">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>

          {/* Driver info */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-4 border-slate-50 shadow-sm overflow-hidden">
                  <img src={IMG.driverSomsak} className="w-full h-full object-cover rounded-full" alt="driver" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
                  <div className="flex items-center gap-0.5 bg-yellow-50 px-1.5 py-0.5 rounded-full border border-yellow-100">
                    <span className="material-icons-round text-yellow-400 text-[10px]">star</span>
                    <span className="text-[10px] font-bold text-slate-700">{trip.driverRating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{trip.driverName}</h2>
                <p className="text-sm text-slate-500">{trip.vehiclePlate}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">฿{trip.fare}</div>
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                <span className="material-icons-round text-[10px]">lock</span>ล็อกราคาแล้ว
              </div>
            </div>
          </div>

          {/* Fair price lock notice */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-5 flex items-start gap-3">
            <span className="material-icons-round text-primary text-lg mt-0.5">verified_user</span>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ล็อกราคาแล้ว สบายใจได้</p>
              <p className="text-xs text-slate-500 mt-0.5">ราคาถูกล็อกแล้ว ไม่มีค่าใช้จ่ายเพิ่มเติม</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => setChatOpen(true)}
              className="relative flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold active:scale-95 transition-all"
            >
              <span className="material-icons-round text-xl">chat_bubble_outline</span>แชท
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadCount}
                </span>
              )}
            </button>
            <a
              href={`tel:${trip.driverPhone}`}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              <span className="material-icons-round text-xl">call</span>โทรหาคนขับ
            </a>
          </div>

          {trip.status === 'DRIVER_EN_ROUTE' && (
            <button
              onClick={handleCancelTrip}
              className="w-full py-3 border border-red-400 text-red-500 font-semibold rounded-xl hover:bg-red-50 transition"
            >
              ยกเลิกการเดินทาง
            </button>
          )}
        </div>
      </div>

      {/* ── CHAT PANEL (slides up) ── */}
      {chatOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          {/* Chat Header */}
          <div className="flex items-center gap-3 px-4 pt-14 pb-4 border-b border-slate-100 bg-white shadow-sm">
            <button onClick={() => setChatOpen(false)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
              <span className="material-icons-round text-slate-600">arrow_back</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-icons-round text-primary text-sm">person</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{trip.driverName}</p>
              <p className="text-xs text-emerald-500 font-medium">กำลังเดินทาง</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <span className="material-icons-round text-slate-300 text-5xl mb-3 block">chat</span>
                <p className="text-slate-400 text-sm">เริ่มการสนทนากับคนขับ</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                {msg.from === 'driver' && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-auto shrink-0">
                    <span className="material-icons-round text-primary text-xs">person</span>
                  </div>
                )}
                <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  msg.from === 'me'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white text-slate-900 rounded-bl-sm border border-slate-100'
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

          {/* Input */}
          <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-3 pb-8">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 bg-slate-100 rounded-full px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim()}
              className="w-11 h-11 rounded-full bg-primary disabled:opacity-40 flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              <span className="material-icons-round text-white text-xl">send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
