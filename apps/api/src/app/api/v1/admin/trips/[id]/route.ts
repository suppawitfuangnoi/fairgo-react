import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * GET /api/v1/admin/trips/:id
 * Full trip detail for admin including:
 * - Trip info with all status info
 * - Status timeline (from trip_status_logs)
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

    // Build negotiation history from offers
    const negotiation = trip.rideRequest.offers.map((o) => ({
      id: o.id,
      round: o.roundNumber,
      proposedBy: o.proposedBy,
      fareAmount: o.fareAmount,
      status: o.status,
      message: o.message,
      estimatedPickupMinutes: o.estimatedPickupMinutes,
      parentOfferId: o.parentOfferId,
      expiresAt: o.expiresAt,
      respondedAt: o.respondedAt,
      createdAt: o.createdAt,
    }));

    // Build timeline from status logs
    const timeline = trip.statusLogs.map((log) => ({
      id: log.id,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      changedByType: log.changedByType,
      changedById: log.changedById,
      note: log.note,
      createdAt: log.createdAt,
    }));

    return successResponse({
      trip: {
        id: trip.id,
        status: trip.status,
        lockedFare: trip.lockedFare,
        pickupAddress: trip.pickupAddress,
        dropoffAddress: trip.dropoffAddress,
        actualDistance: trip.actualDistance,
        actualDuration: trip.actualDuration,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
        cancelledAt: trip.cancelledAt,
        cancelReason: trip.cancelReason,
        cancelledBy: trip.cancelledBy,
        createdAt: trip.createdAt,
      },
      passenger: {
        id: trip.rideRequest.customerProfile.user.id,
        name: trip.rideRequest.customerProfile.user.name,
        phone: trip.rideRequest.customerProfile.user.phone,
        avatarUrl: trip.rideRequest.customerProfile.user.avatarUrl,
      },
      driver: {
        id: trip.driverProfile.user.id,
        name: trip.driverProfile.user.name,
        phone: trip.driverProfile.user.phone,
        avatarUrl: trip.driverProfile.user.avatarUrl,
        vehicle: trip.driverProfile.vehicles[0] ?? trip.vehicle,
      },
      rideRequest: {
        id: trip.rideRequest.id,
        fareOffer: trip.rideRequest.fareOffer,
        fareMin: trip.rideRequest.fareMin,
        fareMax: trip.rideRequest.fareMax,
        vehicleType: trip.rideRequest.vehicleType,
        estimatedDistance: trip.rideRequest.estimatedDistance,
        paymentMethod: trip.rideRequest.paymentMethod,
        createdAt: trip.rideRequest.createdAt,
      },
      payment: trip.payment,
      ratings: trip.ratings,
      negotiation,
      timeline,
    });
  } catch (error) {
    console.error("[ADMIN TRIPS] Detail error:", error);
    return errorResponse("Failed to get trip details", 500);
  }
}
