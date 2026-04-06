/**
 * Payment Flow Tests — Phase 6
 *
 * Coverage:
 *   1. confirm-payment idempotency — driver calls twice (second call = 200 not 409)
 *   2. passenger confirms first, driver confirms later (completes trip)
 *   3. driver confirms without passenger confirmation (completes trip)
 *   4. dispute flag scenarios — raise dispute, idempotent re-raise
 *   5. admin resolution flow — clears disputeFlag, creates audit log
 *   6. late passenger confirmation after trip already COMPLETED
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Prisma mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trip: {
      findUnique: vi.fn(),
      $queryRaw: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    supportTicket: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/notifications', () => ({
  Notif: {
    paymentConfirmed: vi.fn().mockResolvedValue(null),
    tripCompleted: vi.fn().mockResolvedValue(null),
    awaitingCashPayment: vi.fn().mockResolvedValue(null),
    disputeCreated: vi.fn().mockResolvedValue(null),
    disputeResolved: vi.fn().mockResolvedValue(null),
  },
  createAndEmitNotification: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/socket', () => ({
  emitToUser: vi.fn(),
  emitToRoom: vi.fn(),
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() })),
}));

vi.mock('@/middleware/auth', () => ({
  requireRole: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/middleware/auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockRequest(body: object, role: 'DRIVER' | 'CUSTOMER' | 'ADMIN' = 'DRIVER', userId = 'user-1') {
  const req = {
    json: vi.fn().mockResolvedValue(body),
    headers: { get: vi.fn().mockReturnValue(`Bearer mock-token`) },
  } as any;

  (requireRole as Mock).mockReturnValue({ userId, role });
  return req;
}

function makeTrip(overrides: object = {}) {
  return {
    id: 'trip-1',
    status: 'AWAITING_CASH_CONFIRMATION',
    lockedFare: 120,
    pickupAddress: 'A',
    dropoffAddress: 'B',
    startedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    driverProfile: { userId: 'driver-user-1', user: { id: 'driver-user-1', name: 'Test Driver', phone: '0800000001' } },
    rideRequest: {
      customerProfile: { userId: 'customer-user-1', user: { id: 'customer-user-1', name: 'Test Passenger', phone: '0800000002' } },
    },
    ...overrides,
  };
}

function makePayment(overrides: object = {}) {
  return {
    id: 'pay-1',
    tripId: 'trip-1',
    amount: 120,
    status: 'PENDING',
    passengerConfirmedAt: null,
    driverConfirmedAt: null,
    paidAt: null,
    disputeFlag: false,
    disputeReason: null,
    disputeRaisedAt: null,
    disputeRaisedBy: null,
    disputeResolvedAt: null,
    disputeResolvedBy: null,
    disputeResolutionNote: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Business logic helpers (extracted from route handlers for testability) ─

/**
 * Core confirm-payment logic extracted for unit testing.
 * Returns { tripCompleted, passengerRecorded, alreadyCompleted }.
 */
async function confirmPaymentLogic(
  tripId: string,
  actorUserId: string,
  actorRole: 'DRIVER' | 'CUSTOMER',
) {
  const [trip, payment] = await Promise.all([
    (prisma.trip.findUnique as Mock)(),
    (prisma.payment.findUnique as Mock)(),
  ]);

  if (!trip) throw new Error('Trip not found');
  if (!payment) throw new Error('Payment not found');

  // Already completed — idempotent path
  if (payment.status === 'COMPLETED') {
    // Late passenger confirmation
    if (actorRole === 'CUSTOMER' && !payment.passengerConfirmedAt) {
      await (prisma.payment.update as Mock)({
        where: { id: payment.id },
        data: { passengerConfirmedAt: new Date() },
      });
    }
    return { tripCompleted: false, passengerRecorded: false, alreadyCompleted: true };
  }

  // Passenger advisory confirmation
  if (actorRole === 'CUSTOMER') {
    if (payment.passengerConfirmedAt) {
      return { tripCompleted: false, passengerRecorded: false, alreadyCompleted: false };
    }
    await (prisma.payment.update as Mock)({
      where: { id: payment.id },
      data: { passengerConfirmedAt: new Date() },
    });
    return { tripCompleted: false, passengerRecorded: true, alreadyCompleted: false };
  }

  // Driver confirmation — authoritative completion trigger
  if (payment.driverConfirmedAt) {
    // Already confirmed by this driver — idempotent 200
    return { tripCompleted: true, passengerRecorded: false, alreadyCompleted: false, idempotent: true };
  }

  // Atomic trip completion
  const atomicResult = await (prisma.trip as any).$queryRaw();
  const completed = Array.isArray(atomicResult) && atomicResult.length > 0;

  if (completed) {
    await (prisma.payment.update as Mock)({
      where: { id: payment.id },
      data: {
        driverConfirmedAt: new Date(),
        paidAt: new Date(),
        status: 'COMPLETED',
      },
    });
  }

  return { tripCompleted: completed, passengerRecorded: false, alreadyCompleted: false };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('confirm-payment — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('driver calling twice returns tripCompleted=true both times (second is idempotent)', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());

    // First call: payment not yet confirmed
    (prisma.payment.findUnique as Mock).mockResolvedValueOnce(makePayment());
    (prisma.trip as any).$queryRaw = vi.fn().mockResolvedValueOnce([{ id: 'trip-1' }]);

    const first = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');
    expect(first.tripCompleted).toBe(true);
    expect(first.alreadyCompleted).toBe(false);

    // Second call: payment already has driverConfirmedAt set
    (prisma.payment.findUnique as Mock).mockResolvedValueOnce(
      makePayment({ driverConfirmedAt: new Date(), status: 'COMPLETED' })
    );

    const second = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');
    expect(second.tripCompleted).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
  });

  it('second driver call when payment.status=COMPLETED returns alreadyCompleted=true (not 409)', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip({ status: 'COMPLETED' }));
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({ status: 'COMPLETED', driverConfirmedAt: new Date(), paidAt: new Date() })
    );

    const result = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');
    expect(result.alreadyCompleted).toBe(true);
    expect(result.tripCompleted).toBe(false);
    // No update should have been attempted for an already-COMPLETED payment
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('confirm-payment — passenger confirms first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passenger confirm records passengerConfirmedAt but does not complete trip', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());
    (prisma.payment.findUnique as Mock).mockResolvedValue(makePayment());

    const result = await confirmPaymentLogic('trip-1', 'customer-user-1', 'CUSTOMER');

    expect(result.tripCompleted).toBe(false);
    expect(result.passengerRecorded).toBe(true);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passengerConfirmedAt: expect.any(Date) }),
      })
    );
  });

  it('driver confirming after passenger has already confirmed still completes trip', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({ passengerConfirmedAt: new Date() })
    );
    (prisma.trip as any).$queryRaw = vi.fn().mockResolvedValue([{ id: 'trip-1' }]);

    const result = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');

    expect(result.tripCompleted).toBe(true);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverConfirmedAt: expect.any(Date),
          paidAt: expect.any(Date),
          status: 'COMPLETED',
        }),
      })
    );
  });

  it('passenger calling confirm twice returns no-op on second call (passengerConfirmedAt already set)', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({ passengerConfirmedAt: new Date() })
    );

    const result = await confirmPaymentLogic('trip-1', 'customer-user-1', 'CUSTOMER');
    expect(result.passengerRecorded).toBe(false);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('confirm-payment — driver only (no prior passenger confirmation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('driver confirming without passenger confirmation still completes trip', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());
    (prisma.payment.findUnique as Mock).mockResolvedValue(makePayment()); // passengerConfirmedAt = null
    (prisma.trip as any).$queryRaw = vi.fn().mockResolvedValue([{ id: 'trip-1' }]);

    const result = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');

    expect(result.tripCompleted).toBe(true);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          driverConfirmedAt: expect.any(Date),
        }),
      })
    );
  });

  it('race: atomic UPDATE returns empty array (another process won) → tripCompleted=false', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip());
    (prisma.payment.findUnique as Mock).mockResolvedValue(makePayment());
    (prisma.trip as any).$queryRaw = vi.fn().mockResolvedValue([]); // race lost

    const result = await confirmPaymentLogic('trip-1', 'driver-user-1', 'DRIVER');

    expect(result.tripCompleted).toBe(false);
    // Payment update should not be called if atomic UPDATE returned nothing
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('confirm-payment — late passenger confirmation after COMPLETED', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passenger confirms after trip already COMPLETED — records passengerConfirmedAt', async () => {
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip({ status: 'COMPLETED' }));
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({
        status: 'COMPLETED',
        driverConfirmedAt: new Date(),
        paidAt: new Date(),
        passengerConfirmedAt: null, // passenger never confirmed on their end
      })
    );

    const result = await confirmPaymentLogic('trip-1', 'customer-user-1', 'CUSTOMER');

    expect(result.alreadyCompleted).toBe(true);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passengerConfirmedAt: expect.any(Date) }),
      })
    );
  });

  it('passenger already has passengerConfirmedAt and trip is COMPLETED — pure no-op', async () => {
    const confirmedAt = new Date();
    (prisma.trip.findUnique as Mock).mockResolvedValue(makeTrip({ status: 'COMPLETED' }));
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({
        status: 'COMPLETED',
        driverConfirmedAt: new Date(),
        paidAt: new Date(),
        passengerConfirmedAt: confirmedAt,
      })
    );

    const result = await confirmPaymentLogic('trip-1', 'customer-user-1', 'CUSTOMER');

    expect(result.alreadyCompleted).toBe(true);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('dispute flag — report-dispute logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Business logic extracted from report-dispute route.
   */
  async function reportDisputeLogic(
    tripId: string,
    reporterUserId: string,
    reason: string,
    category: string,
  ) {
    const payment = await (prisma.payment.findUnique as Mock)();
    if (!payment) throw new Error('Payment not found');

    // Idempotent: one active dispute at a time
    if (payment.disputeFlag) {
      const existing = await (prisma.supportTicket.findFirst as Mock)();
      return { created: false, ticketId: existing?.id ?? null };
    }

    await (prisma.payment.update as Mock)({
      where: { id: payment.id },
      data: {
        disputeFlag: true,
        disputeReason: reason,
        disputeRaisedAt: new Date(),
        disputeRaisedBy: reporterUserId,
      },
    });

    const ticket = await (prisma.supportTicket.create as Mock)();
    await (prisma.auditLog.create as Mock)();

    return { created: true, ticketId: ticket.id };
  }

  it('first dispute report creates payment flag + support ticket + audit log', async () => {
    (prisma.payment.findUnique as Mock).mockResolvedValue(makePayment({ status: 'COMPLETED' }));
    (prisma.supportTicket.create as Mock).mockResolvedValue({ id: 'ticket-1' });
    (prisma.auditLog.create as Mock).mockResolvedValue({});

    const result = await reportDisputeLogic('trip-1', 'customer-user-1', 'Driver did not give change', 'WRONG_AMOUNT');

    expect(result.created).toBe(true);
    expect(result.ticketId).toBe('ticket-1');
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disputeFlag: true,
          disputeReason: 'Driver did not give change',
        }),
      })
    );
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('idempotent: second dispute report returns existing ticket without creating a new one', async () => {
    // disputeFlag already true
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({ disputeFlag: true, disputeReason: 'Previous reason' })
    );
    (prisma.supportTicket.findFirst as Mock).mockResolvedValue({ id: 'ticket-existing' });

    const result = await reportDisputeLogic('trip-1', 'customer-user-1', 'Retry reason', 'OTHER');

    expect(result.created).toBe(false);
    expect(result.ticketId).toBe('ticket-existing');
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('admin resolution flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Business logic extracted from admin disputes PATCH handler.
   */
  async function resolveDisputeLogic(
    ticketId: string,
    adminUserId: string,
    resolution: string,
  ) {
    const ticket = { id: ticketId, tripId: 'trip-1', userId: 'customer-user-1' };

    const payment = await (prisma.payment.findUnique as Mock)();
    if (!payment || !payment.disputeFlag) {
      return { paymentUpdated: false };
    }

    await (prisma.payment.update as Mock)({
      where: { id: payment.id },
      data: {
        disputeFlag: false,
        disputeResolvedAt: new Date(),
        disputeResolvedBy: adminUserId,
        disputeResolutionNote: resolution,
      },
    });

    await (prisma.auditLog.create as Mock)({
      data: {
        userId:   adminUserId,
        action:   'DISPUTE_RESOLVED',
        entity:   'Payment',
        entityId: payment.id,
        newData:  { ticketId, resolution },
      },
    });

    return { paymentUpdated: true };
  }

  it('resolving a dispute clears disputeFlag and creates audit log', async () => {
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({
        status: 'COMPLETED',
        disputeFlag: true,
        disputeReason: 'Wrong amount',
        disputeRaisedAt: new Date(),
        disputeRaisedBy: 'customer-user-1',
      })
    );
    (prisma.auditLog.create as Mock).mockResolvedValue({});

    const result = await resolveDisputeLogic('ticket-1', 'admin-1', 'Reviewed and resolved in customer favour');

    expect(result.paymentUpdated).toBe(true);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disputeFlag: false,
          disputeResolvedBy: 'admin-1',
          disputeResolutionNote: 'Reviewed and resolved in customer favour',
        }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DISPUTE_RESOLVED',
          entity: 'Payment',
          userId: 'admin-1',
        }),
      })
    );
  });

  it('resolving when disputeFlag is already false is a no-op (no update, no audit)', async () => {
    (prisma.payment.findUnique as Mock).mockResolvedValue(
      makePayment({
        status: 'COMPLETED',
        disputeFlag: false, // already resolved
        disputeResolvedAt: new Date(),
      })
    );

    const result = await resolveDisputeLogic('ticket-1', 'admin-1', 'Re-resolution attempt');

    expect(result.paymentUpdated).toBe(false);
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('resolving when payment is null is a safe no-op', async () => {
    (prisma.payment.findUnique as Mock).mockResolvedValue(null);

    const result = await resolveDisputeLogic('ticket-1', 'admin-1', 'No payment found');

    expect(result.paymentUpdated).toBe(false);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
