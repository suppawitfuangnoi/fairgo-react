/**
 * jobs.test.ts
 *
 * Unit tests for Phase 8 background job modules.
 * All Prisma calls and socket IO are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Prisma mock ──────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    otpCode: {
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    rideOffer: {
      count: vi.fn(),
    },
    rideRequest: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    customerProfile: {
      findMany: vi.fn(),
    },
    driverProfile: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    trip: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    jobRun: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

// ── Socket IO mock ───────────────────────────────────────────────────────────
const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockIO = { to: mockTo };

vi.mock("@/lib/socket", () => ({
  getIO: vi.fn(() => mockIO),
}));

// ── Notifications mock ───────────────────────────────────────────────────────
vi.mock("@/lib/notifications", () => ({
  createAndEmitNotification: vi.fn(() => Promise.resolve()),
}));

// ── Import after mocks ───────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock, getJobStats } from "@/lib/jobs/job-lock";
import { runOtpCleanup } from "@/lib/jobs/otp-cleanup";
import { runOfferCleanup } from "@/lib/jobs/offer-cleanup";
import { runRideRequestCleanup } from "@/lib/jobs/ride-request-cleanup";
import { runTripStuckDetection } from "@/lib/jobs/trip-stuck-detection";
import { runDriverPresenceCleanup } from "@/lib/jobs/driver-presence-cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────────
function mockLockGranted() {
  // acquireLock → INSERT ... RETURNING "jobName" returns one row
  (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { jobName: "test-job" },
  ]);
  // releaseLock → $executeRaw resolves silently
  (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
}

function mockLockDenied() {
  // Empty RETURNING means another instance holds the lock
  (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
}

// ────────────────────────────────────────────────────────────────────────────
// acquireLock / releaseLock
// ────────────────────────────────────────────────────────────────────────────
describe("job-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquireLock returns true when the DB RETURNING row is present", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { jobName: "otp-cleanup" },
    ]);
    const result = await acquireLock("otp-cleanup", 1200);
    expect(result).toBe(true);
  });

  it("acquireLock returns false when RETURNING is empty (lock held)", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await acquireLock("otp-cleanup", 1200);
    expect(result).toBe(false);
  });

  it("acquireLock returns false when the DB call throws", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db error")
    );
    const result = await acquireLock("otp-cleanup", 1200);
    expect(result).toBe(false);
  });

  it("releaseLock calls $executeRaw with the job name", async () => {
    (prisma.$executeRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    await releaseLock("otp-cleanup", { durationMs: 42 });
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it("getJobStats returns empty array on DB error", async () => {
    (prisma.jobRun.findMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db error")
    );
    const stats = await getJobStats();
    expect(stats).toEqual([]);
  });

  it("second acquireLock call with denied lock returns false", async () => {
    // Simulates two replicas: first gets the lock, second is denied
    (prisma.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ jobName: "offer-cleanup" }]) // first instance wins
      .mockResolvedValueOnce([]); // second instance denied

    const first = await acquireLock("offer-cleanup", 180);
    const second = await acquireLock("offer-cleanup", 180);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runOtpCleanup
// ────────────────────────────────────────────────────────────────────────────
describe("runOtpCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when lock is denied", async () => {
    mockLockDenied();
    await runOtpCleanup();
    expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes expired OTPs and unlocks locked OTPs when lock is held", async () => {
    mockLockGranted();
    (prisma.otpCode.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 5 });
    (prisma.otpCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 2 });

    await runOtpCleanup();

    expect(prisma.otpCode.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.otpCode.updateMany).toHaveBeenCalledOnce();
  });

  it("passes status=PENDING and lockedUntil=null to updateMany for unlock", async () => {
    mockLockGranted();
    (prisma.otpCode.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (prisma.otpCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    await runOtpCleanup();

    const updateCall = (prisma.otpCode.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.status).toBe("PENDING");
    expect(updateCall.data.lockedUntil).toBeNull();
    expect(updateCall.data.attemptCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runOfferCleanup
// ────────────────────────────────────────────────────────────────────────────
describe("runOfferCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when lock is denied", async () => {
    mockLockDenied();
    await runOfferCleanup();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // only the lock attempt
  });

  it("expires PENDING offers and resets ride requests with no remaining offers", async () => {
    mockLockGranted();

    // Step 1: expired offers
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "offer-1", rideRequestId: "req-1" },
    ]);
    // Step 2: no more pending offers for req-1 → reset
    (prisma.rideOffer.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.rideRequest.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
    // Step 3: stale chain findMany returns nothing
    (prisma.rideRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await runOfferCleanup();

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING" } })
    );
    expect(mockEmit).toHaveBeenCalledWith("ride:back_to_pending", expect.objectContaining({ rideRequestId: "req-1" }));
  });

  it("does NOT reset ride request when PENDING offers still exist", async () => {
    mockLockGranted();

    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "offer-2", rideRequestId: "req-2" },
    ]);
    // Still has 1 pending offer
    (prisma.rideOffer.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    (prisma.rideRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await runOfferCleanup();

    expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
  });

  it("recovers stale negotiation chains with no pending offers", async () => {
    mockLockGranted();

    // No expired offers
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    // Stale chain found
    (prisma.rideRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "req-stale" },
    ]);
    (prisma.rideOffer.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.rideRequest.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    await runOfferCleanup();

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING" } })
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runRideRequestCleanup
// ────────────────────────────────────────────────────────────────────────────
describe("runRideRequestCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when lock is denied", async () => {
    mockLockDenied();
    await runRideRequestCleanup();
    // Only the $queryRaw for the lock attempt
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("expires old PENDING requests and emits ride:expired to customer", async () => {
    mockLockGranted();

    // expiredPending
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "req-1", customerProfileId: "prof-1" },
    ]);
    // expiredNegotiating
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    // customerProfile lookup
    (prisma.customerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "prof-1", userId: "user-1" },
    ]);

    await runRideRequestCleanup();

    expect(mockEmit).toHaveBeenCalledWith("ride:expired", { rideRequestId: "req-1" });
    expect(mockEmit).toHaveBeenCalledWith(
      "monitor:ride_request_expired",
      { rideRequestId: "req-1" }
    );
  });

  it("expires stale MATCHING/NEGOTIATING requests and notifies admin", async () => {
    mockLockGranted();

    // expiredPending: none
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    // expiredNegotiating: one
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "req-2", customerProfileId: "prof-2" },
    ]);
    (prisma.customerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "prof-2", userId: "user-2" },
    ]);

    await runRideRequestCleanup();

    expect(mockTo).toHaveBeenCalledWith("user:user-2");
    expect(mockTo).toHaveBeenCalledWith("admin:monitor");
  });

  it("does nothing when no requests need expiry", async () => {
    mockLockGranted();

    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await runRideRequestCleanup();

    expect(prisma.customerProfile.findMany).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runTripStuckDetection
// ────────────────────────────────────────────────────────────────────────────
describe("runTripStuckDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when lock is denied", async () => {
    mockLockDenied();
    await runTripStuckDetection();
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it("emits monitor:trip_stuck for each stuck trip", async () => {
    mockLockGranted();

    // trip.findMany is called once per status (5 thresholds)
    // Simulate a stuck DRIVER_ASSIGNED trip on first call; others return []
    (prisma.trip.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          id: "trip-1",
          status: "DRIVER_ASSIGNED",
          updatedAt: new Date(Date.now() - 35 * 60 * 1000), // 35 min ago
          driverProfileId: "drv-1",
          rideRequestId: "req-1",
          driverProfile: { userId: "user-drv-1" },
        },
      ])
      .mockResolvedValue([]);

    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await runTripStuckDetection();

    expect(mockTo).toHaveBeenCalledWith("admin:monitor");
    expect(mockEmit).toHaveBeenCalledWith(
      "monitor:trip_stuck",
      expect.objectContaining({ tripId: "trip-1", status: "DRIVER_ASSIGNED" })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it("does not emit events when all trips are within thresholds", async () => {
    mockLockGranted();

    // All statuses return empty
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await runTripStuckDetection();

    expect(mockEmit).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("writes AuditLog with TRIP_STUCK_WARNING action", async () => {
    mockLockGranted();

    (prisma.trip.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          id: "trip-2",
          status: "IN_PROGRESS",
          updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 h ago
          driverProfileId: "drv-2",
          rideRequestId: "req-2",
          driverProfile: { userId: "user-drv-2" },
        },
      ])
      .mockResolvedValue([]);

    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await runTripStuckDetection();

    const auditCall = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditCall.data.action).toBe("TRIP_STUCK_WARNING");
    expect(auditCall.data.entity).toBe("Trip");
    expect(auditCall.data.entityId).toBe("trip-2");
    expect(auditCall.data.userId).toBeNull(); // SYSTEM action
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runDriverPresenceCleanup
// ────────────────────────────────────────────────────────────────────────────
describe("runDriverPresenceCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when lock is denied", async () => {
    mockLockDenied();
    await runDriverPresenceCleanup();
    expect(prisma.driverProfile.findMany).not.toHaveBeenCalled();
  });

  it("marks stale drivers offline and emits driver:status:change", async () => {
    mockLockGranted();

    (prisma.driverProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "drv-1",
        userId: "user-drv-1",
        lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      },
    ]);
    (prisma.driverProfile.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    await runDriverPresenceCleanup();

    expect(prisma.driverProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isOnline: false } })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "driver:status:change",
      expect.objectContaining({ driverProfileId: "drv-1", isOnline: false, reason: "stale_heartbeat" })
    );
  });

  it("does nothing when no stale drivers are found", async () => {
    mockLockGranted();

    (prisma.driverProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await runDriverPresenceCleanup();

    expect(prisma.driverProfile.updateMany).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("exempts drivers on active trips from the query", async () => {
    mockLockGranted();
    (prisma.driverProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await runDriverPresenceCleanup();

    const findCall = (prisma.driverProfile.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // The `trips.none` filter must be present to exclude active-trip drivers
    expect(findCall.where.trips).toBeDefined();
    expect(findCall.where.trips.none).toBeDefined();
  });
});
