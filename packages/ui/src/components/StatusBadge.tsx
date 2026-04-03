import React from 'react';
import type { TripStatus, RideRequestStatus, DriverVerificationStatus, RideOfferStatus } from '../../api-client/src/types';

// --- Trip Status ---
const TRIP_STATUS_MAP: Record<TripStatus, { label: string; className: string }> = {
  DRIVER_ASSIGNED:    { label: 'จัดคิวแล้ว',      className: 'bg-blue-100 text-blue-700' },
  DRIVER_EN_ROUTE:    { label: 'ไดร์เวอร์กำลังมา',  className: 'bg-primary/10 text-primary' },
  DRIVER_ARRIVED:    { label: 'ไดร์เวอร์ถึงแล้ว',  className: 'bg-cyan-100 text-cyan-700' },
  PICKUP_CONFIRMED:  { label: 'ยืนยันรับแล้ว',    className: 'bg-indigo-100 text-indigo-700' },
  IN_PROGRESS:       { label: 'กำลังเดินทาง',     className: 'bg-amber-100 text-amber-700' },
  COMPLETED:         { label: 'เสร็จสิ้น',         className: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:         { label: 'ยกเลิก',            className: 'bg-red-100 text-red-600' },
};

// --- Ride Request Status ---
const RIDE_STATUS_MAP: Record<RideRequestStatus, { label: string; className: string }> = {
  PENDING:   { label: 'รอไดร์เวอร์', className: 'bg-amber-100 text-amber-700' },
  MATCHING:  { label: 'กำลัง match', className: 'bg-primary/10 text-primary' },
  MATCHED:   { label: 'จับคู่แล้ว',   className: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'ยกเลิก',       className: 'bg-red-100 text-red-600' },
  EXPIRED:   { label: 'หมดเวลา',      className: 'bg-slate-100 text-slate-500' },
};

// --- Driver Verification Status ---
const DRIVER_STATUS_MAP: Record<DriverVerificationStatus, { label: string; className: string }> = {
  PENDING:  { label: 'รอตรวจสอบ', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'อนุมัติแล้ว',  className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'ปฏิเสธ',      className: 'bg-red-100 text-red-600' },
};

// --- Offer Status ---
const OFFER_STATUS_MAP: Record<RideOfferStatus, { label: string; className: string }> = {
  PENDING:   { label: 'รอการตอบรับ', className: 'bg-amber-100 text-amber-700' },
  ACCEPTED:  { label: 'ยอมรับแล้ว',   className: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: 'ปฏิเสธ',       className: 'bg-red-100 text-red-600' },
  EXPIRED:   { label: 'หมดเวลา',      className: 'bg-slate-100 text-slate-500' },
  WITHDRAWN: { label: 'ถอนข้อเสนอ',   className: 'bg-slate-100 text-slate-500' },
};

interface StatusBadgeProps {
  type: 'trip' | 'ride' | 'driver' | 'offer';
  status: string;
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({ type, status, showDot = true, className = '' }: StatusBadgeProps) {
  let label = status;
  let cls = 'bg-slate-100 text-slate-500';

  if (type === 'trip') {
    const m = TRIP_STATUS_MAP[status as TripStatus];
    if (m) { label = m.label; cls = m.className; }
  } else if (type === 'ride') {
    const m = RIDE_STATUS_MAP[status as RideRequestStatus];
    if (m) { label = m.label; cls = m.className; }
  } else if (type === 'driver') {
    const m = DRIVER_STATUS_MAP[status as DriverVerificationStatus];
    if (m) { label = m.label; cls = m.className; }
  } else if (type === 'offer') {
    const m = OFFER_STATUS_MAP[status as RideOfferStatus];
    if (m) { label = m.label; cls = m.className; }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls} ${className}`}
    >
      {showDot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
