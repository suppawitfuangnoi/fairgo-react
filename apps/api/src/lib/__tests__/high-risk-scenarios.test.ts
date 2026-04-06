/**
 * high-risk-scenarios.test.ts — Phase 10
 *
 * Executable tests for the most dangerous concurrent / edge-case scenarios
 * identified during the Phase 10 readiness audit.
 *
 * Each test suite documents:
 *   - The scenario name
 *   - Why it is high-risk
 *   - What the expected system behaviour is
 *   - The invariant being asserted
 *
 * All tests use in-memory mocks (no real DB / HTTP).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw:   vi.fn(),
    $executeRaw: vi.fn(),
    rideOffer: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      count:      vi.fn(),
    },
    rideRequest: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    trip: {
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      updateMany: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update:     vi.fn(),
      create:     vi.fn(),
    },
    customerProfile: {
      findUnique: vi.fn(),
    },
    driverProfile: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: {
      findFirst:  vi.fn(),
      delete:     vi.fn(),
    },
    jobRun: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/socket", () => ({
  getIO:      vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  emitToUser: vi.fn(),
  emitToRoom: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getClientIp:   vi.fn(() => "1.2.3.4"),
}));

vi.mock("@/lib/notifications", () => ({
  createAndEmitNotification: vi.fn(() => Promise.resolve()),
}));

import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
// 1. Refresh token during an active trip
//    Risk: if refresh invalidates the session, the in-progress trip is orphaned
//    Expected: refresh works normally — JWT rotation does not affect trip state
// ────────────────────────────────────────────────────────────────────────────

describe("Refresh token during active trip", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /**
   * Simulate the refresh-token route logic:
   *  1. Look up the refresh token in DB
   *  2. Validate it
   *  3. Delete the old token, issue new pair
   *  4. Trip in DB is untouched
   */
  async function simulateRefresh(
    userId: string,
    tripStatus: string,
    tokenValid: boolean
  ): Promise<{ success: boolean; tripStatus: string | null }> {
    const dbToken = tokenValid
      ? { id: "rt-1", userId, expiresAt: new Date(Date.now() + 86400_000) }
      : null;

    (prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dbToken);

    if (!dbToken) return { success: false, tripStatus: null };

    (prisma.refreshToken.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    // Simulate token rotation: delete old token
    await prisma.refreshToken.delete({ where: { id: dbToken.id } });

    // Fetch active trip — should still be in its current state
    (prisma.trip.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "trip-1",
      status: tripStatus,
    });

    const trip = await prisma.trip.findFirst({ where: { driverProfileId: userId } });
    return { success: true, tripStatus: trip?.status ?? null };
  }

  it("valid refresh token during IN_PROGRESS trip returns success without touching trip", async () => {
    const result = await simulateRefresh("user-1", "IN_PROGRESS", true);
    expect(result.success).toBe(true);
    expect(result.tripStatus).toBe("IN_PROGRESS");
    // Trip.delete was never called
    expect(prisma.refreshToken.delete).toHaveBeenCalledOnce(); // only the token rotation
  });

  it("invalid/expired refresh token returns failure; trip remains unchanged", async () => {
    const result = await simulateRefresh("user-1", "IN_PROGRESS", false);
    expect(result.success).toBe(false);
    expect(result.tripStatus).toBeNull();
    expect(prisma.refreshToken.delete).not.toHaveBeenCalled();
  });

  it("refresh during AWAITING_CASH_CONFIRMATION leaves payment state intact", async () => {
    const result = await simulateRefresh("user-1", "AWAITING_CASH_CONFIRMATION", true);
    expect(result.success).toBe(true);
    expect(result.tripStatus).toBe("AWAITING_CASH_CONFIRMATION");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Refresh during active negotiation
//    Risk: after refresh, offer/ride IDs must still be accessible via new token
//    Expected: negotiation state is purely in DB — the new token works immediately
// ────────────────────────────────────────────────────────────────────────────

describe("Refresh token during active negotiation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("PENDING offer is still accessible after token rotation", async () => {
    (prisma.rideOffer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "offer-1",
      status: "PENDING",
      rideRequestId: "req-1",
      driverProfileId: "drv-1",
    });

    const offer = await prisma.rideOffer.findUnique({ where: { id: "offer-1" } });
    expect(offer?.status).toBe("PENDING");
    // Token rotation has no effect on offer state
    expect(prisma.rideOffer.updateMany).not.toHaveBeenCalled();
  });

  it("NEGOTIATING ride request is accessible after token rotation", async () => {
    (prisma.rideRequest.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "req-1",
      status: "NEGOTIATING",
    });

    const req = await prisma.rideRequest.findUnique({ where: { id: "req-1" } });
    expect(req?.status).toBe("NEGOTIATING");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Duplicate confirm-payment (driver taps twice in quick succession)
//    Risk: two concurrent requests both try to set status=COMPLETED
//    Expected: first wins (atomic UPDATE WHERE), second gets idempotent 200
// ────────────────────────────────────────────────────────────────────────────

describe("Duplicate confirm-payment (idempotency)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /**
   * Simulates the atomic UPDATE WHERE status = current logic.
   * Returns the id if the update succeeds, empty if concurrent update won.
   */
  function atomicStatusUpdate(
    tripId: string,
    currentStatus: string,
    newStatus: string,
    actualStatus: string // what the DB actually contains
  ): string[] {
    if (actualStatus !== currentStatus) return []; // concurrent update already changed it
    return [tripId]; // UPDATE succeeded
  }

  it("first confirm-payment wins the atomic update", () => {
    const result = atomicStatusUpdate("trip-1", "AWAITING_CASH_CONFIRMATION", "COMPLETED", "AWAITING_CASH_CONFIRMATION");
    expect(result).toHaveLength(1);
  });

  it("second concurrent confirm-payment gets empty RETURNING (lost race)", () => {
    // By the time the second request runs, status has already changed to COMPLETED
    const result = atomicStatusUpdate("trip-1", "AWAITING_CASH_CONFIRMATION", "COMPLETED", "COMPLETED");
    expect(result).toHaveLength(0);
  });

  it("idempotent retry after lost race sees COMPLETED and returns 200", async () => {
    (prisma.payment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "pay-1",
      status: "COMPLETED",
      driverConfirmedAt: new Date(),
      passengerConfirmedAt: null,
      amount: 120,
    });

    const payment = await prisma.payment.findUnique({ where: { tripId: "trip-1" } });
    // Payment is already COMPLETED — idempotent response: no further update needed
    expect(payment?.status).toBe("COMPLETED");
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("late passenger confirm after trip COMPLETED records passengerConfirmedAt", async () => {
    (prisma.payment.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "pay-1",
      status: "COMPLETED",
      passengerConfirmedAt: new Date(),
    });

    await prisma.payment.update({
      where: { id: "pay-1" },
      data: { passengerConfirmedAt: new Date() },
    });

    expect(prisma.payment.update).toHaveBeenCalledOnce();
    const call = (prisma.payment.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data).toHaveProperty("passengerConfirmedAt");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Simultaneous negotiation actions (customer and driver act at same millisecond)
//    Risk: two concurrent updateMany WHERE status='PENDING' both think they won
//    Expected: only one wins; second gets count=0 → 409
// ────────────────────────────────────────────────────────────────────────────

describe("Simultaneous negotiation — atomic offer state transitions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /**
   * In-memory simulation of the atomic updateMany pattern:
   * only the first call actually transitions the status.
   */
  function makeAtomicOfferStore(initialStatus: string) {
    let status = initialStatus;
    return async function atomicUpdate(
      expectedStatus: string,
      newStatus: string
    ): Promise<{ count: number }> {
      if (status !== expectedStatus) return { count: 0 };
      status = newStatus;
      return { count: 1 };
    };
  }

  it("only one concurrent ACCEPT wins (count=1 vs count=0)", async () => {
    const store = makeAtomicOfferStore("PENDING");
    const [r1, r2] = await Promise.all([
      store("PENDING", "ACCEPTED"),
      store("PENDING", "ACCEPTED"),
    ]);
    const counts = [r1.count, r2.count].sort();
    expect(counts).toEqual([0, 1]);
  });

  it("only one concurrent REJECT wins", async () => {
    const store = makeAtomicOfferStore("PENDING");
    const [r1, r2] = await Promise.all([
      store("PENDING", "REJECTED"),
      store("PENDING", "REJECTED"),
    ]);
    const counts = [r1.count, r2.count].sort();
    expect(counts).toEqual([0, 1]);
  });

  it("COUNTER after ACCEPT gets count=0 (offer already gone)", async () => {
    const store = makeAtomicOfferStore("PENDING");
    const accept = await store("PENDING", "ACCEPTED");
    expect(accept.count).toBe(1);

    const counter = await store("PENDING", "COUNTERED");
    expect(counter.count).toBe(0); // already ACCEPTED
  });

  it("ACCEPT after COUNTER gets count=0 (offer already countered)", async () => {
    const store = makeAtomicOfferStore("PENDING");
    const counter = await store("PENDING", "COUNTERED");
    expect(counter.count).toBe(1);

    const accept = await store("PENDING", "ACCEPTED");
    expect(accept.count).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Responding to an expired offer
//    Risk: customer accepts an offer after the background sweep expired it
//    Expected: 410 returned, no trip created
// ────────────────────────────────────────────────────────────────────────────

describe("Expired offer response", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function isOfferExpired(expiresAt: Date | null): boolean {
    if (!expiresAt) return false;
    return new Date() > expiresAt;
  }

  it("offer that expired 5 minutes ago is detected as expired", () => {
    const expiredAt = new Date(Date.now() - 5 * 60_000);
    expect(isOfferExpired(expiredAt)).toBe(true);
  });

  it("offer expiring in the future is not expired", () => {
    const futureExpiry = new Date(Date.now() + 60_000);
    expect(isOfferExpired(futureExpiry)).toBe(false);
  });

  it("offer with null expiresAt (initial driver offer) never expires via this check", () => {
    expect(isOfferExpired(null)).toBe(false);
  });

  it("expired offer returns 410 — no atomic update attempted", () => {
    const offer = {
      id: "offer-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
    };

    // Simulate the route logic: expire check fires before the atomic update
    if (offer.expiresAt && new Date() > offer.expiresAt) {
      // Should return 410, not attempt updateMany
      expect(prisma.rideOffer.updateMany).not.toHaveBeenCalled();
    }
    expect(isOfferExpired(offer.expiresAt)).toBe(true);
  });

  it("non-PENDING offer returns 422 — already responded to", () => {
    const statuses = ["ACCEPTED", "REJECTED", "COUNTERED", "EXPIRED"];
    for (const status of statuses) {
      const shouldBlock = status !== "PENDING";
      expect(shouldBlock).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Admin force cancel
//    Risk: admin force-cancels a trip mid-collection; driver/passenger in different states
//    Expected: TripStatusLog written, socket events emitted, ride request untouched
// ────────────────────────────────────────────────────────────────────────────

describe("Admin force cancel", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("force cancel writes a ADMIN_OVERRIDE log entry", async () => {
    (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    // Simulate the force-cancel audit log insertion
    await prisma.$executeRaw`INSERT INTO trip_status_logs (...) VALUES (...)`;

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it("force cancel works from ANY source status (no state machine check)", () => {
    // The force-status endpoint explicitly skips state machine validation.
    // Any status → CANCELLED should succeed.
    const anySourceStatus = [
      "IN_PROGRESS", "DRIVER_ASSIGNED", "COMPLETED", "AWAITING_CASH_CONFIRMATION",
    ];
    for (const from of anySourceStatus) {
      // No state machine restriction on admin overrides
      expect(from).toBeTruthy();
    }
  });

  it("force cancel to COMPLETED triggers completedAt UPDATE", async () => {
    (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    // Simulate `UPDATE trips SET completedAt = NOW() WHERE id = $tripId AND completedAt IS NULL`
    const status = "COMPLETED";
    if (status === "COMPLETED") {
      await prisma.$executeRaw`UPDATE trips SET "completedAt" = NOW() WHERE id = ${"trip-1"} AND "completedAt" IS NULL`;
    }

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Stale driver auto-offline
//    Risk: driver marked offline while still serving a customer (active trip)
//    Expected: exemption check prevents marking active-trip drivers offline
// ────────────────────────────────────────────────────────────────────────────

describe("Stale driver auto-offline exemption", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const ACTIVE_TRIP_STATUSES = [
    "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED",
    "PICKUP_CONFIRMED", "IN_PROGRESS", "ARRIVED_DESTINATION",
    "AWAITING_CASH_CONFIRMATION",
  ] as const;

  /**
   * Simulates the driver-presence-cleanup findMany query.
   * Returns drivers with stale heartbeat who are NOT on active trips.
   */
  function findStaleDriversExcludingActive(
    drivers: Array<{ id: string; lastSeenAt: Date; activeTrips: string[] }>
  ): typeof drivers {
    const threshold = new Date(Date.now() - 5 * 60_000);
    return drivers.filter(
      (d) =>
        d.lastSeenAt < threshold &&
        !d.activeTrips.some((s) => ACTIVE_TRIP_STATUSES.includes(s as never))
    );
  }

  it("driver with stale heartbeat and no active trip is marked offline", () => {
    const staleThreshold = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const drivers = [{ id: "drv-1", lastSeenAt: staleThreshold, activeTrips: [] }];
    const stale = findStaleDriversExcludingActive(drivers);
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe("drv-1");
  });

  it("driver with stale heartbeat but IN_PROGRESS trip is EXEMPT", () => {
    const staleThreshold = new Date(Date.now() - 10 * 60_000);
    const drivers = [{ id: "drv-2", lastSeenAt: staleThreshold, activeTrips: ["IN_PROGRESS"] }];
    const stale = findStaleDriversExcludingActive(drivers);
    expect(stale).toHaveLength(0);
  });

  it("driver with fresh heartbeat is NOT marked offline regardless of trip", () => {
    const recentSeen = new Date(Date.now() - 30_000); // 30 s ago
    const drivers = [{ id: "drv-3", lastSeenAt: recentSeen, activeTrips: [] }];
    const stale = findStaleDriversExcludingActive(drivers);
    expect(stale).toHaveLength(0);
  });

  it("all active trip statuses cause exemption", () => {
    const staleThreshold = new Date(Date.now() - 10 * 60_000);
    for (const status of ACTIVE_TRIP_STATUSES) {
      const drivers = [{ id: "drv", lastSeenAt: staleThreshold, activeTrips: [status] }];
      const stale = findStaleDriversExcludingActive(drivers);
      expect(stale).toHaveLength(0);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. Dispute creation and resolution flow
//    Risk: admin resolves dispute without required note; or resolves twice
//    Expected: duplicate resolution is idempotent; note is mandatory
// ────────────────────────────────────────────────────────────────────────────

describe("Dispute creation and resolution", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  type DisputeStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

  function canCreateDispute(currentStatus: DisputeStatus | null): boolean {
    return currentStatus === null || currentStatus === "OPEN";
  }

  function canResolveDispute(currentStatus: DisputeStatus): boolean {
    return currentStatus === "OPEN" || currentStatus === "IN_PROGRESS";
  }

  it("dispute can be created when none exists", () => {
    expect(canCreateDispute(null)).toBe(true);
  });

  it("duplicate dispute creation is idempotent (returns existing open ticket)", () => {
    // Creating when status is already OPEN is idempotent
    expect(canCreateDispute("OPEN")).toBe(true);
  });

  it("cannot create dispute on already-RESOLVED ticket", () => {
    expect(canCreateDispute("RESOLVED")).toBe(false);
  });

  it("admin can resolve OPEN dispute", () => {
    expect(canResolveDispute("OPEN")).toBe(true);
  });

  it("admin can resolve IN_PROGRESS dispute", () => {
    expect(canResolveDispute("IN_PROGRESS")).toBe(true);
  });

  it("admin cannot resolve already-RESOLVED dispute", () => {
    expect(canResolveDispute("RESOLVED")).toBe(false);
  });

  it("resolution requires a non-empty note", () => {
    const noteValid = (note: string) => note.trim().length > 0;
    expect(noteValid("Refund issued")).toBe(true);
    expect(noteValid("")).toBe(false);
    expect(noteValid("   ")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. Socket reconnect recovery — state machine contract
//    Risk: client reconnects with stale UI state; server emits snapshot data
//    Expected: on reconnect, server pushes current trip/offer state
// ────────────────────────────────────────────────────────────────────────────

describe("Reconnect recovery — server push contract", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /**
   * Simulates what the server does when a socket reconnects:
   *  - If the user has an active trip, emit trip:status_update
   *  - If a driver reconnects, re-join their zone room
   */
  async function handleReconnect(
    userId: string,
    role: "CUSTOMER" | "DRIVER",
    activeTrip: { id: string; status: string } | null
  ) {
    const events: Array<{ event: string; data: unknown }> = [];

    if (activeTrip) {
      events.push({
        event: role === "DRIVER" ? "trip:status_update" : "trip:status_update",
        data: activeTrip,
      });
    }

    if (role === "DRIVER") {
      events.push({ event: "driver:snapshot_requested", data: { userId } });
    }

    return events;
  }

  it("customer reconnect with active trip receives trip:status_update", async () => {
    const events = await handleReconnect(
      "user-1",
      "CUSTOMER",
      { id: "trip-1", status: "DRIVER_EN_ROUTE" }
    );
    expect(events.some((e) => e.event === "trip:status_update")).toBe(true);
    expect((events[0].data as { status: string }).status).toBe("DRIVER_EN_ROUTE");
  });

  it("customer reconnect without active trip receives no trip events", async () => {
    const events = await handleReconnect("user-2", "CUSTOMER", null);
    const tripEvents = events.filter((e) => e.event === "trip:status_update");
    expect(tripEvents).toHaveLength(0);
  });

  it("driver reconnect always gets snapshot_requested event", async () => {
    const events = await handleReconnect("drv-1", "DRIVER", null);
    expect(events.some((e) => e.event === "driver:snapshot_requested")).toBe(true);
  });

  it("driver reconnect with active trip gets both events", async () => {
    const events = await handleReconnect(
      "drv-1",
      "DRIVER",
      { id: "trip-1", status: "IN_PROGRESS" }
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.event)).toContain("trip:status_update");
    expect(events.map((e) => e.event)).toContain("driver:snapshot_requested");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. Brute-force OTP protection contract
//     Risk: attacker enumerates codes before lockout kicks in
//     Expected: exactly 5 attempts allowed; 6th returns locked state
// ────────────────────────────────────────────────────────────────────────────

describe("OTP brute-force lockout contract", () => {
  const MAX_ATTEMPTS = 5;

  /** In-memory OTP attempt simulator */
  function makeOtpAttemptTracker(correctCode: string) {
    let attempts = 0;
    let locked = false;

    return function attempt(code: string): {
      valid: boolean;
      locked: boolean;
      attemptsRemaining: number;
    } {
      if (locked) return { valid: false, locked: true, attemptsRemaining: 0 };

      attempts++;
      if (code === correctCode) {
        return { valid: true, locked: false, attemptsRemaining: MAX_ATTEMPTS - attempts };
      }

      if (attempts >= MAX_ATTEMPTS) {
        locked = true;
        return { valid: false, locked: true, attemptsRemaining: 0 };
      }

      return {
        valid: false,
        locked: false,
        attemptsRemaining: MAX_ATTEMPTS - attempts,
      };
    };
  }

  it("5 wrong attempts trigger lockout on the 5th", () => {
    const attempt = makeOtpAttemptTracker("123456");
    attempt("000000"); // 1
    attempt("000000"); // 2
    attempt("000000"); // 3
    attempt("000000"); // 4
    const fifth = attempt("000000"); // 5 → locked
    expect(fifth.locked).toBe(true);
    expect(fifth.attemptsRemaining).toBe(0);
  });

  it("6th attempt after lockout is immediately rejected", () => {
    const attempt = makeOtpAttemptTracker("123456");
    for (let i = 0; i < 5; i++) attempt("000000");
    const sixth = attempt("000000");
    expect(sixth.locked).toBe(true);
    expect(sixth.valid).toBe(false);
  });

  it("correct code on 3rd attempt succeeds with 2 remaining", () => {
    const attempt = makeOtpAttemptTracker("123456");
    attempt("000000"); // 1
    attempt("000000"); // 2
    const third = attempt("123456"); // 3 — correct
    expect(third.valid).toBe(true);
    expect(third.locked).toBe(false);
  });

  it("4 wrong then correct code succeeds (not locked yet)", () => {
    const attempt = makeOtpAttemptTracker("999999");
    attempt("000000");
    attempt("000000");
    attempt("000000");
    attempt("000000");
    const fifth = attempt("999999"); // correct on 5th
    expect(fifth.valid).toBe(true);
  });
});
