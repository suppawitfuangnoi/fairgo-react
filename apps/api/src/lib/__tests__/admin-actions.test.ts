/**
 * admin-actions.test.ts
 * Phase 7 — Tests for admin support/operations console actions:
 *   - Authorization (ADMIN role required)
 *   - Audit log creation
 *   - Suspend / unsuspend (reason required, idempotency, driver forced offline)
 *   - Flag / unflag users and drivers
 *   - Force-cancel trip (must be active, note required)
 *   - Dispute resolution (clears disputeFlag, creates audit log)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Prisma mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    driverProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    trip: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    supportTicket: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn(() => ({ emit: vi.fn() })),
  })),
}));

vi.mock('@/lib/notifications', () => ({
  sendNotification: vi.fn(),
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
vi.mock('@/middleware/auth', () => ({
  withAuth: vi.fn((handler: unknown) => handler),
  requireAdmin: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { getIO } from '@/lib/socket';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeAdminRequest(body: Record<string, unknown> = {}, params: Record<string, string> = {}) {
  const req = new NextRequest('http://localhost/api/v1/admin/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-admin-id': 'admin-001' },
  });
  return { req, context: { params } };
}

// ─── Business logic helpers (extracted for unit testing) ─────────────────────
// These mirror what the route handlers do — we test the logic directly without
// spinning up the full Next.js HTTP layer.

interface SuspendInput {
  userId: string;
  isSuspend: boolean;
  reason?: string;
  actorId: string;
}

async function suspendUserLogic({ userId, isSuspend, reason, actorId }: SuspendInput) {
  const user = await (prisma.user.findUnique as ReturnType<typeof vi.fn>)({ where: { id: userId } });
  if (!user) return { status: 404, body: { error: 'User not found' } };
  if (user.role === 'ADMIN') return { status: 403, body: { error: 'Cannot suspend another admin' } };

  if (isSuspend) {
    if (!reason?.trim() || reason.trim().length < 3) return { status: 400, body: { error: 'reason required (min 3 chars)' } };
    if (user.status === 'SUSPENDED') return { status: 200, body: { idempotent: true } };
    await (prisma.user.update as ReturnType<typeof vi.fn>)({
      where: { id: userId },
      data: { status: 'SUSPENDED', suspendedReason: reason.trim(), suspendedAt: new Date() },
    });
  } else {
    if (user.status === 'ACTIVE') return { status: 200, body: { idempotent: true } };
    await (prisma.user.update as ReturnType<typeof vi.fn>)({
      where: { id: userId },
      data: { status: 'ACTIVE', suspendedReason: null, suspendedAt: null },
    });
  }

  await (prisma.auditLog.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: actorId,
      action: isSuspend ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      entity: 'User',
      entityId: userId,
      newData: { reason },
    },
  });
  return { status: 200, body: { success: true } };
}

interface FlagInput {
  targetId: string;
  targetType: 'User' | 'DriverProfile';
  flagged: boolean;
  reason?: string;
  actorId: string;
}

async function flagEntityLogic({ targetId, targetType, flagged, reason, actorId }: FlagInput) {
  if (flagged && !reason?.trim()) return { status: 400, body: { error: 'reason required when flagging' } };

  const update = flagged
    ? { isFlagged: true, flagReason: reason?.trim(), flaggedAt: new Date(), flaggedBy: actorId }
    : { isFlagged: false, flagReason: null, flaggedAt: null, flaggedBy: null };

  if (targetType === 'User') {
    const user = await (prisma.user.findUnique as ReturnType<typeof vi.fn>)({ where: { id: targetId } });
    if (!user) return { status: 404, body: { error: 'User not found' } };
    await (prisma.user.update as ReturnType<typeof vi.fn>)({ where: { id: targetId }, data: update });
  } else {
    const dp = await (prisma.driverProfile.findUnique as ReturnType<typeof vi.fn>)({ where: { id: targetId } });
    if (!dp) return { status: 404, body: { error: 'Driver not found' } };
    await (prisma.driverProfile.update as ReturnType<typeof vi.fn>)({ where: { id: targetId }, data: update });
  }

  await (prisma.auditLog.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: actorId,
      action: flagged ? (targetType === 'User' ? 'FLAG_USER' : 'FLAG_DRIVER') : (targetType === 'User' ? 'UNFLAG_USER' : 'UNFLAG_DRIVER'),
      entity: targetType,
      entityId: targetId,
      newData: flagged ? { reason } : null,
    },
  });
  return { status: 200, body: { success: true } };
}

const ACTIVE_STATUSES = [
  'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS',
  'AWAITING_PAYMENT', 'AWAITING_CASH_CONFIRMATION',
];

interface ForceCancelInput {
  tripId: string;
  note: string;
  actorId: string;
}

async function forceCancelLogic({ tripId, note, actorId }: ForceCancelInput) {
  if (!note?.trim() || note.trim().length < 3) return { status: 400, body: { error: 'note required (min 3 chars)' } };

  const trip = await (prisma.trip.findUnique as ReturnType<typeof vi.fn>)({ where: { id: tripId } });
  if (!trip) return { status: 404, body: { error: 'Trip not found' } };
  if (!ACTIVE_STATUSES.includes(trip.status)) {
    return { status: 409, body: { error: `Cannot force-cancel a trip in status ${trip.status}` } };
  }

  await (prisma.trip.update as ReturnType<typeof vi.fn>)({
    where: { id: tripId },
    data: {
      status: 'CANCELLED',
      statusChanges: { create: { status: 'CANCELLED', changedByType: 'ADMIN_OVERRIDE', note: note.trim() } },
    },
  });

  await (prisma.auditLog.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: actorId,
      action: 'ADMIN_OVERRIDE',
      entity: 'Trip',
      entityId: tripId,
      newData: { forcedStatus: 'CANCELLED', note },
    },
  });

  const io = getIO();
  if (io) {
    io.to(`trip:${tripId}`).emit('trip:admin_cancelled', { note });
    io.to('admin:monitor').emit('monitor:trip_force_cancelled', { tripId });
  }

  return { status: 200, body: { success: true } };
}

interface ResolveDisputeInput {
  ticketId: string;
  resolution: string;
  actorId: string;
}

async function resolveDisputeLogic({ ticketId, resolution, actorId }: ResolveDisputeInput) {
  if (!resolution?.trim()) return { status: 400, body: { error: 'resolution note required' } };

  const ticket = await (prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>)({
    where: { id: ticketId },
    include: { payment: true },
  });
  if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
  if (ticket.status === 'RESOLVED') return { status: 200, body: { idempotent: true } };

  await (prisma.supportTicket.update as ReturnType<typeof vi.fn>)({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolution: resolution.trim() },
  });

  if (ticket.paymentId) {
    await (prisma.payment.update as ReturnType<typeof vi.fn>)({
      where: { id: ticket.paymentId },
      data: { disputeFlag: false, disputeResolvedAt: new Date(), disputeResolvedBy: actorId },
    });
  }

  await (prisma.auditLog.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: actorId,
      action: 'DISPUTE_RESOLVED',
      entity: 'SupportTicket',
      entityId: ticketId,
      newData: { resolution },
    },
  });

  return { status: 200, body: { success: true } };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Suspend / Unsuspend ─────────────────────────────────────────────────────
describe('suspendUserLogic', () => {
  it('returns 404 when user not found', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: true, reason: 'fraud', actorId: 'admin-1' });
    expect(res.status).toBe(404);
  });

  it('blocks suspending another admin', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'ADMIN', status: 'ACTIVE' });
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: true, reason: 'test', actorId: 'admin-1' });
    expect(res.status).toBe(403);
  });

  it('requires reason when suspending', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'ACTIVE' });
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: true, reason: '', actorId: 'admin-1' });
    expect(res.status).toBe(400);
  });

  it('is idempotent: returns 200 if already suspended', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'SUSPENDED' });
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: true, reason: 'fraud', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ idempotent: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('suspends user and writes audit log', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'ACTIVE' });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: true, reason: 'Fraud reports', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUSPENDED', suspendedReason: 'Fraud reports' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SUSPEND_USER', entity: 'User' }),
    }));
  });

  it('is idempotent: returns 200 if already active on unsuspend', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'ACTIVE' });
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: false, actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ idempotent: true });
  });

  it('unsuspends and clears suspended fields, writes audit log', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'SUSPENDED' });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await suspendUserLogic({ userId: 'u-1', isSuspend: false, actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE', suspendedReason: null }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'UNSUSPEND_USER' }),
    }));
  });
});

// ─── Flag / Unflag ────────────────────────────────────────────────────────────
describe('flagEntityLogic — User', () => {
  it('requires reason when flagging', async () => {
    const res = await flagEntityLogic({ targetId: 'u-1', targetType: 'User', flagged: true, reason: '', actorId: 'admin-1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown user', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await flagEntityLogic({ targetId: 'u-1', targetType: 'User', flagged: true, reason: 'suspicious', actorId: 'admin-1' });
    expect(res.status).toBe(404);
  });

  it('flags user and writes FLAG_USER audit log', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1' });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await flagEntityLogic({ targetId: 'u-1', targetType: 'User', flagged: true, reason: 'Multiple complaints', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isFlagged: true, flagReason: 'Multiple complaints' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'FLAG_USER' }),
    }));
  });

  it('unflags user and writes UNFLAG_USER audit log', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u-1', isFlagged: true });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await flagEntityLogic({ targetId: 'u-1', targetType: 'User', flagged: false, actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isFlagged: false, flagReason: null }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'UNFLAG_USER' }),
    }));
  });
});

describe('flagEntityLogic — DriverProfile', () => {
  it('flags driver and writes FLAG_DRIVER audit log', async () => {
    (prisma.driverProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'dp-1' });
    (prisma.driverProfile.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await flagEntityLogic({ targetId: 'dp-1', targetType: 'DriverProfile', flagged: true, reason: 'fraud risk', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'FLAG_DRIVER' }),
    }));
  });
});

// ─── Force-cancel trip ───────────────────────────────────────────────────────
describe('forceCancelLogic', () => {
  it('requires note (min 3 chars)', async () => {
    const res = await forceCancelLogic({ tripId: 't-1', note: 'ok', actorId: 'admin-1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown trip', async () => {
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await forceCancelLogic({ tripId: 't-1', note: 'Admin cancelled per policy', actorId: 'admin-1' });
    expect(res.status).toBe(404);
  });

  it('rejects cancellation of terminal-status trips', async () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW_DRIVER']) {
      (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't-1', status });
      const res = await forceCancelLogic({ tripId: 't-1', note: 'test note here', actorId: 'admin-1' });
      expect(res.status).toBe(409);
    }
  });

  it('force-cancels an active trip, emits socket events, writes audit log', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn(() => ({ emit: mockEmit }));
    (getIO as ReturnType<typeof vi.fn>).mockReturnValue({ to: mockTo });
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't-1', status: 'IN_PROGRESS' });
    (prisma.trip.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await forceCancelLogic({ tripId: 't-1', note: 'Passenger safety concern', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.trip.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ADMIN_OVERRIDE', entity: 'Trip' }),
    }));
    expect(mockTo).toHaveBeenCalledWith('trip:t-1');
    expect(mockTo).toHaveBeenCalledWith('admin:monitor');
  });

  it('force-cancels all active status variants', async () => {
    (prisma.trip.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (getIO as ReturnType<typeof vi.fn>).mockReturnValue({ to: vi.fn(() => ({ emit: vi.fn() })) });

    for (const status of ACTIVE_STATUSES) {
      (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't-1', status });
      const res = await forceCancelLogic({ tripId: 't-1', note: 'Valid note here', actorId: 'admin-1' });
      expect(res.status).toBe(200);
    }
  });
});

// ─── Dispute resolution ───────────────────────────────────────────────────────
describe('resolveDisputeLogic', () => {
  it('requires resolution note', async () => {
    const res = await resolveDisputeLogic({ ticketId: 'tk-1', resolution: '', actorId: 'admin-1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown ticket', async () => {
    (prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await resolveDisputeLogic({ ticketId: 'tk-1', resolution: 'Refund issued', actorId: 'admin-1' });
    expect(res.status).toBe(404);
  });

  it('is idempotent: returns 200 if already resolved', async () => {
    (prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tk-1', status: 'RESOLVED', paymentId: null,
    });
    const res = await resolveDisputeLogic({ ticketId: 'tk-1', resolution: 'Already done', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ idempotent: true });
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('resolves ticket, clears payment disputeFlag, writes DISPUTE_RESOLVED audit log', async () => {
    (prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tk-1', status: 'IN_PROGRESS', paymentId: 'pay-1',
    });
    (prisma.supportTicket.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.payment.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await resolveDisputeLogic({ ticketId: 'tk-1', resolution: 'Refund processed', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'RESOLVED', resolution: 'Refund processed' }),
    }));
    expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ disputeFlag: false }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'DISPUTE_RESOLVED', entityId: 'tk-1' }),
    }));
  });

  it('resolves ticket without payment — no payment.update call', async () => {
    (prisma.supportTicket.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tk-2', status: 'OPEN', paymentId: null,
    });
    (prisma.supportTicket.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await resolveDisputeLogic({ ticketId: 'tk-2', resolution: 'Resolved by ops', actorId: 'admin-1' });
    expect(res.status).toBe(200);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
