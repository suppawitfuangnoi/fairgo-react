/**
 * POST /api/v1/offers/expire
 * Internal endpoint to expire timed-out offers.
 * Protected with a CRON_SECRET header check (optional in dev).
 *
 * Concurrency safety:
 * - Single atomic `updateMany WHERE status='PENDING' AND expiresAt < NOW()`
 *   means only one sweep can expire a given offer — subsequent runs skip it.
 * - Then we fetch the just-expired offers by re-querying with status='EXPIRED'
 *   and updatedAt within the last few seconds (using returned IDs is safer).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-response";
import { emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const now = new Date();

    // ── 1. Atomic batch expire ─────────────────────────────────────────────
    // Single UPDATE — if two sweeps run concurrently only one will match each row.
    const expiredIds = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE ride_offers
      SET status = 'EXPIRED', "respondedAt" = ${now}
      WHERE status = 'PENDING'
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" < ${now}
      RETURNING id
    `;

    if (expiredIds.length === 0) {
      return successResponse({ expired: 0 }, "No offers to expire");
    }

    const ids = expiredIds.map((r) => r.id);

    // ── 2. Load expired offers for notification ────────────────────────────
    const expiredOffers = await prisma.rideOffer.findMany({
      where: { id: { in: ids } },
      include: {
        rideRequest: { include: { customerProfile: true } },
        driverProfile: { include: { user: { select: { id: true } } } },
      },
    });

    // ── 3. Notify both parties ─────────────────────────────────────────────
    for (const offer of expiredOffers) {
      const driverUserId = offer.driverProfile.user.id;
      const customerUserId = offer.rideRequest.customerProfile.userId;
      const payload = { offerId: offer.id, rideRequestId: offer.rideRequestId };

      emitToUser(driverUserId, "offer:expired", payload);
      emitToUser(customerUserId, "offer:expired", payload);

      // Push notification to the party who failed to respond
      if (offer.proposedBy === "DRIVER") {
        // Customer didn't respond to driver's offer — notify customer
        await Notif.offerExpired(customerUserId, offer.id).catch(() => {});
      } else {
        // Driver didn't respond to customer's counter — notify driver
        await Notif.offerExpired(driverUserId, offer.id).catch(() => {});
      }
    }

    // ── 4. Reset ride requests with no remaining PENDING offers ───────────
    const affectedRideIds = [...new Set(expiredOffers.map((o) => o.rideRequestId))];
    for (const rideId of affectedRideIds) {
      const activePending = await prisma.rideOffer.count({
        where: { rideRequestId: rideId, status: "PENDING" },
      });
      if (activePending === 0) {
        // Reset to PENDING so new drivers can pick it up
        await prisma.rideRequest.updateMany({
          where: {
            id: rideId,
            status: { in: ["MATCHING", "NEGOTIATING"] },
          },
          data: { status: "PENDING" },
        });
        // Notify customer their ride is back in the pool
        const rideReq = expiredOffers.find((o) => o.rideRequestId === rideId)?.rideRequest;
        if (rideReq) {
          emitToUser(rideReq.customerProfile.userId, "ride:back_to_pending", { rideRequestId: rideId });
        }
      }
    }

    console.log(`[Expire] Expired ${ids.length} offers:`, ids);
    return successResponse({ expired: ids.length }, `Expired ${ids.length} offers`);
  } catch (error) {
    console.error("[OFFERS] Expire error:", error);
    return errorResponse("Failed to expire offers", 500);
  }
}
