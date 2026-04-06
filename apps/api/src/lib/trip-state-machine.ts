/**
 * FAIRGO — Central Trip State Machine
 *
 * Single source of truth for all trip status transitions, role permissions,
 * terminal states, and display metadata.
 *
 * All status-changing routes MUST import from here instead of maintaining
 * their own lists. This ensures:
 *   - No duplicated / diverged rules
 *   - Role enforcement is tested in one place
 *   - New statuses only need to be added here
 *
 * ── Transition map (13 statuses) ─────────────────────────────────────────────
 *
 *   DRIVER_ASSIGNED
 *     → DRIVER_EN_ROUTE              (DRIVER, ADMIN)
 *     → CANCELLED_BY_DRIVER          (DRIVER, ADMIN)  *note required
 *     → CANCELLED_BY_PASSENGER       (CUSTOMER, ADMIN)
 *     → CANCELLED                    (CUSTOMER, DRIVER, ADMIN)
 *     → NO_SHOW_DRIVER               (CUSTOMER, ADMIN)
 *
 *   DRIVER_EN_ROUTE
 *     → DRIVER_ARRIVED               (DRIVER, ADMIN)
 *     → CANCELLED_BY_DRIVER          (DRIVER, ADMIN)  *note required
 *     → CANCELLED_BY_PASSENGER       (CUSTOMER, ADMIN)  *note required
 *     → CANCELLED                    (CUSTOMER, DRIVER, ADMIN)
 *     → NO_SHOW_DRIVER               (CUSTOMER, ADMIN)
 *
 *   DRIVER_ARRIVED
 *     → PICKUP_CONFIRMED             (DRIVER, ADMIN)
 *     → NO_SHOW_PASSENGER            (DRIVER, ADMIN)
 *     → CANCELLED_BY_DRIVER          (DRIVER, ADMIN)  *note required
 *     → CANCELLED_BY_PASSENGER       (CUSTOMER, ADMIN)  *note required
 *     → CANCELLED                    (CUSTOMER, DRIVER, ADMIN)
 *
 *   PICKUP_CONFIRMED
 *     → IN_PROGRESS                  (DRIVER, ADMIN)
 *     → CANCELLED                    (ADMIN only)
 *
 *   IN_PROGRESS
 *     → ARRIVED_DESTINATION          (DRIVER, ADMIN)
 *     → COMPLETED                    (ADMIN, SYSTEM)  — emergency admin close
 *     → CANCELLED                    (ADMIN only)
 *
 *   ARRIVED_DESTINATION
 *     → AWAITING_CASH_CONFIRMATION   (DRIVER, ADMIN)  — cash payment flow
 *     → COMPLETED                    (DRIVER, ADMIN, SYSTEM)  — card payment
 *
 *   AWAITING_CASH_CONFIRMATION
 *     → COMPLETED                    (DRIVER, ADMIN, SYSTEM)  — cash confirmed
 *
 * Terminal (no outgoing transitions):
 *   COMPLETED, CANCELLED, CANCELLED_BY_PASSENGER, CANCELLED_BY_DRIVER,
 *   NO_SHOW_PASSENGER, NO_SHOW_DRIVER
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type TripStatus =
  | "DRIVER_ASSIGNED"
  | "DRIVER_EN_ROUTE"
  | "DRIVER_ARRIVED"
  | "PICKUP_CONFIRMED"
  | "IN_PROGRESS"
  | "ARRIVED_DESTINATION"
  | "AWAITING_CASH_CONFIRMATION"
  | "COMPLETED"
  | "CANCELLED"
  | "CANCELLED_BY_PASSENGER"
  | "CANCELLED_BY_DRIVER"
  | "NO_SHOW_PASSENGER"
  | "NO_SHOW_DRIVER";

export type ActorRole = "DRIVER" | "CUSTOMER" | "ADMIN" | "SYSTEM";

interface TransitionRule {
  allowedRoles: ActorRole[];
  /** Whether a note/reason must be provided to perform this transition */
  requireNote?: boolean;
}

// ── Transition map ─────────────────────────────────────────────────────────────
// Key format: "FROM_STATUS:TO_STATUS"

export const TRANSITION_MAP: Record<string, TransitionRule> = {
  // ── Normal driver flow ──
  "DRIVER_ASSIGNED:DRIVER_EN_ROUTE":               { allowedRoles: ["DRIVER", "ADMIN"] },
  "DRIVER_EN_ROUTE:DRIVER_ARRIVED":                { allowedRoles: ["DRIVER", "ADMIN"] },
  "DRIVER_ARRIVED:PICKUP_CONFIRMED":               { allowedRoles: ["DRIVER", "ADMIN"] },
  "PICKUP_CONFIRMED:IN_PROGRESS":                  { allowedRoles: ["DRIVER", "ADMIN"] },
  "IN_PROGRESS:ARRIVED_DESTINATION":               { allowedRoles: ["DRIVER", "ADMIN"] },
  "ARRIVED_DESTINATION:AWAITING_CASH_CONFIRMATION":{ allowedRoles: ["DRIVER", "ADMIN"] },
  "AWAITING_CASH_CONFIRMATION:COMPLETED":          { allowedRoles: ["DRIVER", "ADMIN", "SYSTEM"] },

  // Direct completion paths (card payment or admin close)
  "ARRIVED_DESTINATION:COMPLETED":                 { allowedRoles: ["DRIVER", "ADMIN", "SYSTEM"] },
  "IN_PROGRESS:COMPLETED":                         { allowedRoles: ["ADMIN", "SYSTEM"] }, // emergency

  // ── Driver cancellations (driver can cancel before pickup confirmed) ──
  "DRIVER_ASSIGNED:CANCELLED_BY_DRIVER":           { allowedRoles: ["DRIVER", "ADMIN"], requireNote: true },
  "DRIVER_EN_ROUTE:CANCELLED_BY_DRIVER":           { allowedRoles: ["DRIVER", "ADMIN"], requireNote: true },
  "DRIVER_ARRIVED:CANCELLED_BY_DRIVER":            { allowedRoles: ["DRIVER", "ADMIN"], requireNote: true },

  // ── Customer cancellations ──
  "DRIVER_ASSIGNED:CANCELLED_BY_PASSENGER":        { allowedRoles: ["CUSTOMER", "ADMIN"] },
  "DRIVER_EN_ROUTE:CANCELLED_BY_PASSENGER":        { allowedRoles: ["CUSTOMER", "ADMIN"], requireNote: true },
  "DRIVER_ARRIVED:CANCELLED_BY_PASSENGER":         { allowedRoles: ["CUSTOMER", "ADMIN"], requireNote: true },

  // ── Generic CANCELLED (admin can cancel at any pre-terminal stage) ──
  "DRIVER_ASSIGNED:CANCELLED":                     { allowedRoles: ["CUSTOMER", "DRIVER", "ADMIN"] },
  "DRIVER_EN_ROUTE:CANCELLED":                     { allowedRoles: ["CUSTOMER", "DRIVER", "ADMIN"] },
  "DRIVER_ARRIVED:CANCELLED":                      { allowedRoles: ["CUSTOMER", "DRIVER", "ADMIN"] },
  "PICKUP_CONFIRMED:CANCELLED":                    { allowedRoles: ["ADMIN"] },
  "IN_PROGRESS:CANCELLED":                         { allowedRoles: ["ADMIN"] },
  "ARRIVED_DESTINATION:CANCELLED":                 { allowedRoles: ["ADMIN"] },
  "AWAITING_CASH_CONFIRMATION:CANCELLED":          { allowedRoles: ["ADMIN"] },

  // ── No-show ──
  "DRIVER_ARRIVED:NO_SHOW_PASSENGER":              { allowedRoles: ["DRIVER", "ADMIN"] },
  "DRIVER_ASSIGNED:NO_SHOW_DRIVER":                { allowedRoles: ["CUSTOMER", "ADMIN"] },
  "DRIVER_EN_ROUTE:NO_SHOW_DRIVER":                { allowedRoles: ["CUSTOMER", "ADMIN"] },
};

// ── Terminal & cancellation sets ───────────────────────────────────────────────

export const TERMINAL_STATUSES = new Set<TripStatus>([
  "COMPLETED",
  "CANCELLED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "NO_SHOW_PASSENGER",
  "NO_SHOW_DRIVER",
]);

export const CANCELLATION_STATUSES = new Set<TripStatus>([
  "CANCELLED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "NO_SHOW_PASSENGER",
  "NO_SHOW_DRIVER",
]);

export const ACTIVE_STATUSES = new Set<TripStatus>([
  "DRIVER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  "AWAITING_CASH_CONFIRMATION",
]);

// ── Helper predicates ──────────────────────────────────────────────────────────

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status as TripStatus);
}

export function isCancellation(status: string): boolean {
  return CANCELLATION_STATUSES.has(status as TripStatus);
}

export function isActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status as TripStatus);
}

export function requiresNote(from: string, to: string): boolean {
  return TRANSITION_MAP[`${from}:${to}`]?.requireNote ?? false;
}

// ── Transition validation ──────────────────────────────────────────────────────

export type TransitionResult =
  | { ok: true }
  | { ok: false; httpStatus: number; message: string };

/**
 * Validates whether an actor of `role` may transition `from` → `to`.
 * Returns `{ ok: true }` on success or `{ ok: false, httpStatus, message }` on failure.
 *
 * Note: same-status transitions (idempotent) are handled by the caller.
 */
export function validateTransition(
  from: string,
  to: string,
  actorRole: ActorRole
): TransitionResult {
  if (isTerminal(from)) {
    return {
      ok: false,
      httpStatus: 422,
      message: `Trip is in terminal status '${from}' and cannot be changed. Contact admin for overrides.`,
    };
  }

  const key = `${from}:${to}`;
  const rule = TRANSITION_MAP[key];

  if (!rule) {
    const allowed = getAllowedTransitions(from, actorRole);
    return {
      ok: false,
      httpStatus: 422,
      message:
        `Invalid transition: ${from} → ${to}. ` +
        `Allowed for ${actorRole}: [${allowed.join(", ") || "none"}]`,
    };
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    const whoCanDo = rule.allowedRoles.join(" or ");
    return {
      ok: false,
      httpStatus: 403,
      message: `Role '${actorRole}' cannot perform transition ${from} → ${to}. Only ${whoCanDo} may do this.`,
    };
  }

  return { ok: true };
}

/**
 * Returns the list of statuses reachable from `from` by `role` (optional filter).
 */
export function getAllowedTransitions(from: string, role?: ActorRole): TripStatus[] {
  const result: TripStatus[] = [];
  for (const [key, rule] of Object.entries(TRANSITION_MAP)) {
    const colonIdx = key.indexOf(":");
    const f = key.slice(0, colonIdx);
    const t = key.slice(colonIdx + 1) as TripStatus;
    if (f !== from) continue;
    if (role && !rule.allowedRoles.includes(role)) continue;
    result.push(t);
  }
  return result;
}

// ── Display metadata ───────────────────────────────────────────────────────────

export const STATUS_META: Record<
  TripStatus,
  { label: string; labelTh: string; emoji: string; color: string }
> = {
  DRIVER_ASSIGNED:            { label: "Driver Assigned",       labelTh: "กำหนดคนขับแล้ว",   emoji: "👤", color: "blue" },
  DRIVER_EN_ROUTE:            { label: "Driver En Route",       labelTh: "คนขับกำลังมา",      emoji: "🚗", color: "blue" },
  DRIVER_ARRIVED:             { label: "Driver Arrived",        labelTh: "คนขับมาถึงแล้ว",    emoji: "📍", color: "green" },
  PICKUP_CONFIRMED:           { label: "Pickup Confirmed",      labelTh: "รับผู้โดยสารแล้ว",  emoji: "✅", color: "green" },
  IN_PROGRESS:                { label: "In Progress",           labelTh: "กำลังเดินทาง",      emoji: "▶️", color: "primary" },
  ARRIVED_DESTINATION:        { label: "Arrived at Destination",labelTh: "ถึงปลายทางแล้ว",   emoji: "🏁", color: "primary" },
  AWAITING_CASH_CONFIRMATION: { label: "Awaiting Cash Payment", labelTh: "รอยืนยันชำระเงิน", emoji: "💵", color: "amber" },
  COMPLETED:                  { label: "Completed",             labelTh: "เสร็จสิ้น",         emoji: "✅", color: "green" },
  CANCELLED:                  { label: "Cancelled",             labelTh: "ยกเลิกแล้ว",        emoji: "❌", color: "red" },
  CANCELLED_BY_PASSENGER:     { label: "Cancelled by Passenger",labelTh: "ผู้โดยสารยกเลิก",  emoji: "❌", color: "red" },
  CANCELLED_BY_DRIVER:        { label: "Cancelled by Driver",   labelTh: "คนขับยกเลิก",      emoji: "❌", color: "red" },
  NO_SHOW_PASSENGER:          { label: "Passenger No-Show",     labelTh: "ผู้โดยสารไม่มา",   emoji: "⚠️", color: "orange" },
  NO_SHOW_DRIVER:             { label: "Driver No-Show",        labelTh: "คนขับไม่มา",       emoji: "⚠️", color: "orange" },
};

/** Returns display label (English) for a status string, with fallback. */
export function getStatusLabel(status: string): string {
  return STATUS_META[status as TripStatus]?.label ?? status;
}

/** Returns Thai display label for a status string, with fallback. */
export function getStatusLabelTh(status: string): string {
  return STATUS_META[status as TripStatus]?.labelTh ?? status;
}
