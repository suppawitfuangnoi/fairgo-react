/**
 * GET /api/v1/offers/driver-pending
 *
 * Returns the driver's most recent PENDING offer along with the ride request
 * context. Used by the driver app on refresh/reconnect to restore the active
 * negotiation screen (SubmitOfferPage).
 *
 * Response:
 * {
 *   offer: {
 *     id, fareAmount, estimatedPickupMinutes, roundNumber, expiresAt, proposedBy
 *   },
 *   rideRequest: {
 *     id, pickupAddress, dropoffAddress, fareOffer, fareMin, fareMax, vehicleType,
 *     estimatedDistance, estimatedDuration, customerName, customerRating,
 *     pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude,
 *     customerCounter: latest PENDING counter offer from customer if any
 *   }
 * }
 * Returns null if no active negotiation.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!driverProfile) return errorResponse("Driver profile not found", 404);

    // Find the most recent PENDING offer proposed by this driver
    const offer = await prisma.rideOffer.findFirst({
      where: {
        driverProfileId: driverProfile.id,
        status: "PENDING",
        proposedBy: "DRIVER",
      },
      include: {
        rideRequest: {
          include: {
            customerProfile: {
              include: {
                user: { select: { name: true, avatarUrl: true } },
              },
            },
            // Also fetch any PENDING counter from customer (COUNTERED status = customer's turn)
            offers: {
              where: {
                driverProfileId: driverProfile.id,
                status: "PENDING",
                proposedBy: "CUSTOMER",
              },
              orderBy: { roundNumber: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!offer) {
      return successResponse(null, "No active negotiation");
    }

    const rr = offer.rideRequest;
    const customerCounter = rr.offers?.[0] ?? null;

    return successResponse({
      offer: {
        id: offer.id,
        fareAmount: offer.fareAmount,
        estimatedPickupMinutes: offer.estimatedPickupMinutes,
        roundNumber: offer.roundNumber,
        expiresAt: offer.expiresAt,
        proposedBy: offer.proposedBy,
      },
      rideRequest: {
        id: rr.id,
        pickupAddress: rr.pickupAddress,
        dropoffAddress: rr.dropoffAddress,
        fareOffer: rr.fareOffer,
        fareMin: rr.fareMin,
        fareMax: rr.fareMax,
        vehicleType: rr.vehicleType,
        estimatedDistance: rr.estimatedDistance,
        estimatedDuration: rr.estimatedDuration,
        pickupLatitude: rr.pickupLatitude,
        pickupLongitude: rr.pickupLongitude,
        dropoffLatitude: rr.dropoffLatitude,
        dropoffLongitude: rr.dropoffLongitude,
        customerName: rr.customerProfile?.user?.name ?? "ผู้โดยสาร",
        customerRating: 4.8, // will be replaced with actual rating when available
      },
      customerCounter: customerCounter
        ? {
            offerId: customerCounter.id,
            fareAmount: customerCounter.fareAmount,
            roundNumber: customerCounter.roundNumber,
            message: customerCounter.message,
            expiresAt: customerCounter.expiresAt,
          }
        : null,
    });
  } catch (error) {
    console.error("[OFFERS/DRIVER-PENDING]", error);
    return errorResponse("Failed to fetch pending offer", 500);
  }
}
