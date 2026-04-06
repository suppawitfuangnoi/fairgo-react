import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { STATUS_META, TERMINAL_STATUSES, TripStatus } from "@/lib/trip-state-machine";

/**
 * GET /api/v1/admin/trips/:id
 *
 * Full trip detail for admin including:
 * - Trip info with all status info
 * - Enhanced status timeline (actor display names, step durations, terminal indicator)
 * - Negotiation history (from ride_offers)
 * - Payment details
 * - Driver and passenger info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id: tripId } = await params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        rideRequest: {
          include: {
            customerProfile: {
              include: { user: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
            },
            offers: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
        driverProfile: {
          include: {
            user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
        vehicle: true,
        payment: true,
        ratings: {
          include: {
            fromUser: { select: { name: true, role: true } },
          },
        },
        statusLogs: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!trip) return errorResponse("Trip not found", 404);

    // ── Resolve actor display names for timeline ───────────────────────────
    // Collect unique changedById values (non-null)
    const actorIds = [
      ...new Set(trip.statusLogs.map((l) => l.changedById).filter(Boolean) as string[]),
    ];
    const actorUsers =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, role: true },
          })
        : [];
    const actorMap = new Map(actorUsers.map((u) => [u.id, u]));

    // ── Build enhanced timeline ────────────────────────────────────────────
    const timeline = trip.statusLogs.map((log, idx) => {
      const actor      = log.changedById ? actorMap.get(log.changedById) : null;
      const prevLog    = idx > 0 ? trip.statusLogs[idx - 1] : null;
      const durationMs = prevLog
        ? log.createdAt.getTime() - prevLog.createdAt.getTime()
        : null;
      const toMeta     = STATUS_META[log.toStatus as TripStatus];
      const isTerminal = TERMINAL_STATUSES.has(log.toStatus as TripStatus);

      return {
        id:             log.id,
        fromStatus:     log.fromStatus,
        toStatus:       log.toStatus,
        toStatusLabel:  toMeta?.label   ?? log.toStatus,
        toStatusLabelTh:toMeta?.labelTh ?? log.toStatus,
        toStatusEmoji:  toMeta?.emoji   ?? "📌",
        toStatusColor:  toMeta?.color   ?? "gray",
        isTerminalStep: isTerminal,
        changedByType:  log.changedByType,
        changedById:    log.changedById,
        actorName:      actor?.name ?? null,
        actorRole:      actor?.role ?? log.changedByType,
        note:           log.note,
        durationMs,
        durationLabel:  durationMs !== null ? formatDuration(durationMs) : null,
        createdAt:      log.createdAt,
      };
    });

    // ── Build negotiation history ──────────────────────────────────────────
    const negotiation = trip.rideRequest.offers.map((o) => ({
      id:                     o.id,
      round:                  o.roundNumber,
      proposedBy:             o.proposedBy,
      fareAmount:             o.fareAmount,
      status:                 o.status,
      message:                o.message,
      estimatedPickupMinutes: o.estimatedPickupMinutes,
      parentOfferId:          o.parentOfferId,
      expiresAt:              o.expiresAt,
      respondedAt:            o.respondedAt,
      createdAt:              o.createdAt,
    }));

    const currentMeta = STATUS_META[trip.status as TripStatus];

    return successResponse({
      trip: {
        id:              trip.id,
        status:          trip.status,
        statusLabel:     currentMeta?.label   ?? trip.status,
        statusLabelTh:   currentMeta?.labelTh ?? trip.status,
        statusEmoji:     currentMeta?.emoji   ?? "📌",
        statusColor:     currentMeta?.color   ?? "gray",
        isTerminal:      TERMINAL_STATUSES.has(trip.status as TripStatus),
        lockedFare:      trip.lockedFare,
        pickupAddress:   trip.pickupAddress,
        dropoffAddress:  trip.dropoffAddress,
        actualDistance:  trip.actualDistance,
        actualDuration:  trip.actualDuration,
        startedAt:       trip.startedAt,
        completedAt:     trip.completedAt,
        cancelledAt:     trip.cancelledAt,
        cancelReason:    trip.cancelReason,
        cancelledBy:     trip.cancelledBy,
        createdAt:       trip.createdAt,
      },
      passenger: {
        id:        trip.rideRequest.customerProfile.user.id,
        name:      trip.rideRequest.customerProfile.user.name,
        phone:     trip.rideRequest.customerProfile.user.phone,
        avatarUrl: trip.rideRequest.customerProfile.user.avatarUrl,
      },
      driver: {
        id:        trip.driverProfile.user.id,
        name:      trip.driverProfile.user.name,
        phone:     trip.driverProfile.user.phone,
        avatarUrl: trip.driverProfile.user.avatarUrl,
        vehicle:   trip.driverProfile.vehicles[0] ?? trip.vehicle,
      },
      rideRequest: {
        id:                trip.rideRequest.id,
        fareOffer:         trip.rideRequest.fareOffer,
        fareMin:           trip.rideRequest.fareMin,
        fareMax:           trip.rideRequest.fareMax,
        vehicleType:       trip.rideRequest.vehicleType,
        estimatedDistance: trip.rideRequest.estimatedDistance,
        paymentMethod:     trip.rideRequest.paymentMethod,
        createdAt:         trip.rideRequest.createdAt,
      },
      payment:     trip.payment,
      ratings:     trip.ratings,
      negotiation,
      timeline,
    });
  } catch (error) {
    console.error("[ADMIN TRIPS] Detail error:", error);
    return errorResponse("Failed to get trip details", 500);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 60_000)  return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}
