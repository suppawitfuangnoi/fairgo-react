/**
 * POST /api/v1/offers/expire
 * Internal endpoint to expire timed-out counter-offers.
 * Should be called periodically (e.g. every 30s from a cron or health check).
 * Protected with a simple CRON_SECRET header check.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-response";
import { emitToUser } from "@/lib/socket";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  // Only enforce secret if CRON_SECRET env var is set
  if (cronSecret && secret !== cronSecret) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    // Find expired PENDING counter-offers
    const expiredOffers = await prisma.rideOffer.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      include: {
        rideRequest: {
          include: { customerProfile: true },
        },
        driverProfile: {
          include: { user: { select: { id: true } } },
        },
      },
    });

    if (expiredOffers.length === 0) {
      return successResponse({ expired: 0 }, "No offers to expire");
    }

    // Mark them as EXPIRED
    await prisma.rideOffer.updateMany({
      where: {
        id: { in: expiredOffers.map((o) => o.id) },
      },
      data: { status: "EXPIRED" },
    });

    // Notify both parties
    for (const offer of expiredOffers) {
      const isDriverOffer = offer.proposedBy === "DRIVER";
      if (isDriverOffer) {
        // Customer didn't respond — notify driver
        emitToUser(offer.driverProfile.user.id, "offer:expired", {
          offerId: offer.id,
          rideRequestId: offer.rideRequestId,
        });
        // Notify customer too
        emitToUser(offer.rideRequest.customerProfile.userId, "offer:expired", {
          offerId: offer.id,
          rideRequestId: offer.rideRequestId,
        });
      } else {
        // Customer's counter — driver didn't respond — notify customer
        emitToUser(offer.rideRequest.customerProfile.userId, "offer:expired", {
          offerId: offer.id,
          rideRequestId: offer.rideRequestId,
        });
        emitToUser(offer.driverProfile.user.id, "offer:expired", {
          offerId: offer.id,
          rideRequestId: offer.rideRequestId,
        });
      }
    }

    // Check if any ride requests are now back to PENDING (all offers expired)
    const affectedRideIds = [...new Set(expiredOffers.map((o) => o.rideRequestId))];
    for (const rideId of affectedRideIds) {
      const activePending = await prisma.rideOffer.count({
        where: { rideRequestId: rideId, status: "PENDING" },
      });
      if (activePending === 0) {
        const rideRequest = await prisma.rideRequest.findUnique({ where: { id: rideId } });
        if (rideRequest && ["MATCHING", "NEGOTIATING"].includes(rideRequest.status)) {
          await prisma.rideRequest.update({
            where: { id: rideId },
            data: { status: "PENDING" },
          });
        }
      }
    }

    return successResponse({ expired: expiredOffers.length }, `Expired ${expiredOffers.length} offers`);
  } catch (error) {
    console.error("[OFFERS] Expire error:", error);
    return errorResponse("Failed to expire offers", 500);
  }
}
