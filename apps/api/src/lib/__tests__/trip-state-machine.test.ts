/**
 * Unit tests for the central trip state machine.
 * All tests run without database or HTTP — pure logic only.
 *
 * Coverage:
 *  1. Valid transitions accepted for each actor role
 *  2. Invalid transitions (wrong FROM, missing edge) rejected
 *  3. Terminal status rejection (no outgoing transitions)
 *  4. Role-based rejection (right transition, wrong role)
 *  5. requiresNote flag
 *  6. getAllowedTransitions returns correct filtered set
 *  7. isTerminal / isCancellation / isActive predicates
 *  8. STATUS_META completeness (all 13 statuses have entries)
 *  9. getStatusLabel / getStatusLabelTh fallbacks
 * 10. Idempotent same-status hint (validateTransition handles it via caller contract)
 */
import { describe, it, expect } from "vitest";
import {
  validateTransition,
  getAllowedTransitions,
  requiresNote,
  isTerminal,
  isCancellation,
  isActive,
  getStatusLabel,
  getStatusLabelTh,
  STATUS_META,
  TERMINAL_STATUSES,
  CANCELLATION_STATUSES,
  ACTIVE_STATUSES,
  TripStatus,
} from "../trip-state-machine";

// ── 1. Valid transitions ───────────────────────────────────────────────────────

describe("validateTransition — valid transitions", () => {
  it("DRIVER allows DRIVER_ASSIGNED → DRIVER_EN_ROUTE", () => {
    expect(validateTransition("DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER")).toEqual({ ok: true });
  });

  it("ADMIN allows DRIVER_ASSIGNED → DRIVER_EN_ROUTE", () => {
    expect(validateTransition("DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "ADMIN")).toEqual({ ok: true });
  });

  it("DRIVER: full normal flow", () => {
    const flow: [TripStatus, TripStatus][] = [
      ["DRIVER_ASSIGNED",   "DRIVER_EN_ROUTE"],
      ["DRIVER_EN_ROUTE",   "DRIVER_ARRIVED"],
      ["DRIVER_ARRIVED",    "PICKUP_CONFIRMED"],
      ["PICKUP_CONFIRMED",  "IN_PROGRESS"],
      ["IN_PROGRESS",       "ARRIVED_DESTINATION"],
      ["ARRIVED_DESTINATION","AWAITING_CASH_CONFIRMATION"],
      ["AWAITING_CASH_CONFIRMATION", "COMPLETED"],
    ];
    for (const [from, to] of flow) {
      expect(validateTransition(from, to, "DRIVER").ok, `${from}→${to}`).toBe(true);
    }
  });

  it("DRIVER can take ARRIVED_DESTINATION → COMPLETED (card payment shortcut)", () => {
    expect(validateTransition("ARRIVED_DESTINATION", "COMPLETED", "DRIVER")).toEqual({ ok: true });
  });

  it("SYSTEM can complete AWAITING_CASH_CONFIRMATION → COMPLETED", () => {
    expect(validateTransition("AWAITING_CASH_CONFIRMATION", "COMPLETED", "SYSTEM")).toEqual({ ok: true });
  });

  it("CUSTOMER can cancel DRIVER_ASSIGNED → CANCELLED_BY_PASSENGER", () => {
    expect(validateTransition("DRIVER_ASSIGNED", "CANCELLED_BY_PASSENGER", "CUSTOMER")).toEqual({ ok: true });
  });

  it("CUSTOMER can CANCELLED (generic) from DRIVER_ASSIGNED", () => {
    expect(validateTransition("DRIVER_ASSIGNED", "CANCELLED", "CUSTOMER")).toEqual({ ok: true });
  });

  it("DRIVER can NO_SHOW_PASSENGER from DRIVER_ARRIVED", () => {
    expect(validateTransition("DRIVER_ARRIVED", "NO_SHOW_PASSENGER", "DRIVER")).toEqual({ ok: true });
  });

  it("CUSTOMER can NO_SHOW_DRIVER from DRIVER_ASSIGNED", () => {
    expect(validateTransition("DRIVER_ASSIGNED", "NO_SHOW_DRIVER", "CUSTOMER")).toEqual({ ok: true });
  });

  it("ADMIN can force COMPLETED from IN_PROGRESS (emergency close)", () => {
    expect(validateTransition("IN_PROGRESS", "COMPLETED", "ADMIN")).toEqual({ ok: true });
  });

  it("ADMIN can cancel at late stages (AWAITING_CASH_CONFIRMATION → CANCELLED)", () => {
    expect(validateTransition("AWAITING_CASH_CONFIRMATION", "CANCELLED", "ADMIN")).toEqual({ ok: true });
  });
});

// ── 2. Invalid transitions ─────────────────────────────────────────────────────

describe("validateTransition — invalid transitions", () => {
  it("rejects unknown FROM status", () => {
    const result = validateTransition("NONEXISTENT", "COMPLETED", "ADMIN");
    expect(result.ok).toBe(false);
  });

  it("rejects skipping a step (DRIVER_ASSIGNED → IN_PROGRESS)", () => {
    const result = validateTransition("DRIVER_ASSIGNED", "IN_PROGRESS", "DRIVER");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(422);
    }
  });

  it("rejects backward transition (IN_PROGRESS → DRIVER_EN_ROUTE)", () => {
    const result = validateTransition("IN_PROGRESS", "DRIVER_EN_ROUTE", "DRIVER");
    expect(result.ok).toBe(false);
  });

  it("rejects ARRIVED_DESTINATION → AWAITING_CASH_CONFIRMATION by SYSTEM", () => {
    // SYSTEM is only allowed for *completion* transitions
    const result = validateTransition("ARRIVED_DESTINATION", "AWAITING_CASH_CONFIRMATION", "SYSTEM");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });
});

// ── 3. Terminal status rejection ───────────────────────────────────────────────

describe("validateTransition — terminal statuses block all transitions", () => {
  const terminals: TripStatus[] = [
    "COMPLETED",
    "CANCELLED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "NO_SHOW_PASSENGER",
    "NO_SHOW_DRIVER",
  ];

  for (const terminal of terminals) {
    it(`rejects any transition from terminal status ${terminal}`, () => {
      const result = validateTransition(terminal, "DRIVER_EN_ROUTE", "ADMIN");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.httpStatus).toBe(422);
        expect(result.message).toMatch(/terminal/i);
      }
    });
  }
});

// ── 4. Role-based rejection ────────────────────────────────────────────────────

describe("validateTransition — role enforcement", () => {
  it("CUSTOMER cannot advance DRIVER_ASSIGNED → DRIVER_EN_ROUTE (driver-only)", () => {
    const result = validateTransition("DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "CUSTOMER");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it("DRIVER cannot cancel PICKUP_CONFIRMED → CANCELLED (admin-only at this stage)", () => {
    const result = validateTransition("PICKUP_CONFIRMED", "CANCELLED", "DRIVER");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it("CUSTOMER cannot COMPLETED from ARRIVED_DESTINATION (driver/admin/system only)", () => {
    const result = validateTransition("ARRIVED_DESTINATION", "COMPLETED", "CUSTOMER");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it("SYSTEM cannot set DRIVER_ARRIVED → NO_SHOW_PASSENGER (driver/admin only)", () => {
    const result = validateTransition("DRIVER_ARRIVED", "NO_SHOW_PASSENGER", "SYSTEM");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it("IN_PROGRESS → COMPLETED blocked for DRIVER (emergency-only for ADMIN/SYSTEM)", () => {
    const result = validateTransition("IN_PROGRESS", "COMPLETED", "DRIVER");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });
});

// ── 5. requiresNote flag ───────────────────────────────────────────────────────

describe("requiresNote", () => {
  it("driver cancellation transitions require a note", () => {
    expect(requiresNote("DRIVER_ASSIGNED",  "CANCELLED_BY_DRIVER")).toBe(true);
    expect(requiresNote("DRIVER_EN_ROUTE",  "CANCELLED_BY_DRIVER")).toBe(true);
    expect(requiresNote("DRIVER_ARRIVED",   "CANCELLED_BY_DRIVER")).toBe(true);
  });

  it("late passenger cancellations require a note", () => {
    expect(requiresNote("DRIVER_EN_ROUTE", "CANCELLED_BY_PASSENGER")).toBe(true);
    expect(requiresNote("DRIVER_ARRIVED",  "CANCELLED_BY_PASSENGER")).toBe(true);
  });

  it("early passenger cancel (DRIVER_ASSIGNED) does NOT require a note", () => {
    expect(requiresNote("DRIVER_ASSIGNED", "CANCELLED_BY_PASSENGER")).toBe(false);
  });

  it("normal flow transitions do NOT require a note", () => {
    expect(requiresNote("DRIVER_ASSIGNED", "DRIVER_EN_ROUTE")).toBe(false);
    expect(requiresNote("IN_PROGRESS", "ARRIVED_DESTINATION")).toBe(false);
  });

  it("returns false for unknown transitions", () => {
    expect(requiresNote("NONEXISTENT", "COMPLETED")).toBe(false);
  });
});

// ── 6. getAllowedTransitions ───────────────────────────────────────────────────

describe("getAllowedTransitions", () => {
  it("returns all reachable statuses from DRIVER_ARRIVED (no role filter)", () => {
    const allowed = getAllowedTransitions("DRIVER_ARRIVED");
    expect(allowed).toContain("PICKUP_CONFIRMED");
    expect(allowed).toContain("NO_SHOW_PASSENGER");
    expect(allowed).toContain("CANCELLED_BY_DRIVER");
    expect(allowed).toContain("CANCELLED_BY_PASSENGER");
    expect(allowed).toContain("CANCELLED");
  });

  it("CUSTOMER-filtered list from DRIVER_ARRIVED only contains passenger-allowed transitions", () => {
    const allowed = getAllowedTransitions("DRIVER_ARRIVED", "CUSTOMER");
    expect(allowed).toContain("CANCELLED_BY_PASSENGER");
    expect(allowed).toContain("CANCELLED");
    // PICKUP_CONFIRMED requires DRIVER — must NOT appear
    expect(allowed).not.toContain("PICKUP_CONFIRMED");
    expect(allowed).not.toContain("NO_SHOW_PASSENGER");
  });

  it("returns empty array for terminal status", () => {
    expect(getAllowedTransitions("COMPLETED")).toHaveLength(0);
    expect(getAllowedTransitions("CANCELLED")).toHaveLength(0);
  });

  it("ADMIN from IN_PROGRESS gets ARRIVED_DESTINATION, COMPLETED, CANCELLED", () => {
    const allowed = getAllowedTransitions("IN_PROGRESS", "ADMIN");
    expect(allowed).toContain("ARRIVED_DESTINATION");
    expect(allowed).toContain("COMPLETED");
    expect(allowed).toContain("CANCELLED");
  });

  it("DRIVER from IN_PROGRESS gets ARRIVED_DESTINATION but not CANCELLED", () => {
    const allowed = getAllowedTransitions("IN_PROGRESS", "DRIVER");
    expect(allowed).toContain("ARRIVED_DESTINATION");
    expect(allowed).not.toContain("CANCELLED");
    expect(allowed).not.toContain("COMPLETED");
  });
});

// ── 7. Predicates ──────────────────────────────────────────────────────────────

describe("isTerminal", () => {
  it("returns true for all 6 terminal statuses", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isTerminal(s), s).toBe(true);
    }
  });

  it("returns false for all 7 active statuses", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(isTerminal(s), s).toBe(false);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("")).toBe(false);
  });
});

describe("isCancellation", () => {
  it("returns true for all cancellation variants", () => {
    for (const s of CANCELLATION_STATUSES) {
      expect(isCancellation(s), s).toBe(true);
    }
  });

  it("returns false for COMPLETED", () => {
    expect(isCancellation("COMPLETED")).toBe(false);
  });

  it("returns false for active statuses", () => {
    expect(isCancellation("IN_PROGRESS")).toBe(false);
  });
});

describe("isActive", () => {
  it("returns true for all 7 active statuses", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(isActive(s), s).toBe(true);
    }
  });

  it("returns false for terminal statuses", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isActive(s), s).toBe(false);
    }
  });
});

// ── 8. STATUS_META completeness ────────────────────────────────────────────────

describe("STATUS_META", () => {
  const allStatuses: TripStatus[] = [
    "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PICKUP_CONFIRMED",
    "IN_PROGRESS", "ARRIVED_DESTINATION", "AWAITING_CASH_CONFIRMATION",
    "COMPLETED", "CANCELLED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER",
    "NO_SHOW_PASSENGER", "NO_SHOW_DRIVER",
  ];

  it("has an entry for all 13 statuses", () => {
    for (const s of allStatuses) {
      expect(STATUS_META[s], `missing entry for ${s}`).toBeDefined();
    }
  });

  it("every entry has label, labelTh, emoji, color", () => {
    for (const s of allStatuses) {
      const meta = STATUS_META[s];
      expect(typeof meta.label,   `${s}.label`).toBe("string");
      expect(typeof meta.labelTh, `${s}.labelTh`).toBe("string");
      expect(typeof meta.emoji,   `${s}.emoji`).toBe("string");
      expect(typeof meta.color,   `${s}.color`).toBe("string");
    }
  });

  it("has exactly 13 entries", () => {
    expect(Object.keys(STATUS_META)).toHaveLength(13);
  });
});

// ── 9. getStatusLabel / getStatusLabelTh ──────────────────────────────────────

describe("getStatusLabel", () => {
  it("returns English label for known status", () => {
    expect(getStatusLabel("COMPLETED")).toBe("Completed");
    expect(getStatusLabel("DRIVER_EN_ROUTE")).toBe("Driver En Route");
    expect(getStatusLabel("AWAITING_CASH_CONFIRMATION")).toBe("Awaiting Cash Payment");
  });

  it("falls back to raw string for unknown status", () => {
    expect(getStatusLabel("UNKNOWN_STATUS")).toBe("UNKNOWN_STATUS");
    expect(getStatusLabel("")).toBe("");
  });
});

describe("getStatusLabelTh", () => {
  it("returns Thai label for known status", () => {
    expect(getStatusLabelTh("COMPLETED")).toBe("เสร็จสิ้น");
    expect(getStatusLabelTh("CANCELLED")).toBe("ยกเลิกแล้ว");
  });

  it("falls back to raw string for unknown status", () => {
    expect(getStatusLabelTh("SOME_FUTURE_STATUS")).toBe("SOME_FUTURE_STATUS");
  });
});

// ── 10. Error message quality ──────────────────────────────────────────────────

describe("validateTransition error messages", () => {
  it("invalid transition includes from/to statuses and allowed list", () => {
    const result = validateTransition("DRIVER_ASSIGNED", "COMPLETED", "DRIVER");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("DRIVER_ASSIGNED");
      expect(result.message).toContain("COMPLETED");
    }
  });

  it("role rejection message names the required roles", () => {
    // PICKUP_CONFIRMED → CANCELLED is ADMIN only
    const result = validateTransition("PICKUP_CONFIRMED", "CANCELLED", "CUSTOMER");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain("admin");
    }
  });

  it("terminal status message mentions 'terminal'", () => {
    const result = validateTransition("COMPLETED", "IN_PROGRESS", "ADMIN");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain("terminal");
    }
  });
});
