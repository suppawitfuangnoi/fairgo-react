/**
 * offer-cleanup.ts
 *
 * Runs every 5 minutes.  Complements the real-time 30 s sweep in server.ts by
 * adding a DB-locked, replica-safe pass that also handles stale negotiation
 * chains that the in-memory sweep might miss after a server restart.
 *
 * Duties:
 *  1. Expire PENDING offers whose `expiresAt` has passed.
 *  2. Reset ride requests back to PENDING when all their offers are gone.
 *  3. Detect MATCHING/NEGOTIATING ride requests that have been idle for
 *     > STALE_NEGOTIATION_MINUTES with no remaining PENDING offers and reset
 *     them to PENDING (stale chain recovery).
 */

import { prisma } from "../prisma";
import { getIO } from "../socket";
import { acquireLock, releaseLock } from "./job-lock";

const JOB_NAME = "offer-cleanup";
const LOCK_TTL_SECONDS = 3 * 60;
/** Ride requests idle in MATCHING/NEGOTIATING for this long with no offers → reset */
const STALE_NEGOTIATION_MINUTES = 10;

export async function runOfferCleanup(): Promise<void> {
  const locked = await acquireLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!locked) {
    console.log("[Job:offer-cleanup] Skipped — lock held by another instance");
    return;
  }

  const start = Date.now();
  const io = getIO();
  try {
    const now = new Date();

    // ── 1. Expire PENDING offers past their expiresAt ─────────────────────────
    // Raw SQL with RETURNING so we know which ride requests are affected.
    const expiredOffers = await prisma.$queryRaw<
      { id: string; rideRequestId: string }[]
    >`
      UPDATE ride_offers
      SET    status       = 'EXPIRED'::"RideOfferStatus",
             "respondedAt" = ${now}
      WHERE  status       = 'PENDING'::"RideOfferStatus"
        AND  "expiresAt"  IS NOT NULL
        AND  "expiresAt"  < ${now}
      RETURNING id, "rideRequestId"
    `;

    // ── 2. Reset ride requests that now have zero PENDING offers ───────────────
    const affectedRideIds = [...new Set(expiredOffers.map((o) => o.rideRequestId))];
    let resetToPending = 0;
    for (const rideId of affectedRideIds) {
      const stillPending = await prisma.rideOffer.count({
        where: { rideRequestId: rideId, status: "PENDING" },
      });
      if (stillPending === 0) {
        const updated = await prisma.rideRequest.updateMany({
          where: {
            id: rideId,
            status: { in: ["MATCHING", "NEGOTIATING"] },
          },
          data: { status: "PENDING" },
        });
        if (updated.count > 0) {
          resetToPending++;
          io?.to(`ride:${rideId}`).emit("ride:back_to_pending", {
            rideRequestId: rideId,
          });
        }
      }
    }

    // ── 3. Stale negotiation chain recovery ───────────────────────────────────
    // Find MATCHING/NEGOTIATING requests that haven't been updated recently.
    const staleThreshold = new Date(
      Date.now() - STALE_NEGOTIATION_MINUTES * 60 * 1000
    );
    const staleChains = await prisma.rideRequest.findMany({
      where: {
        status: { in: ["MATCHING", "NEGOTIATING"] },
        updatedAt: { lt: staleThreshold },
      },
      select: { id: true },
    });

    let staleChainsReset = 0;
    for (const req of staleChains) {
      const active = await prisma.rideOffer.count({
        where: { rideRequestId: req.id, status: "PENDING" },
      });
      if (active === 0) {
        const updated = await prisma.rideRequest.updateMany({
          where: {
            id: req.id,
            status: { in: ["MATCHING", "NEGOTIATING"] },
          },
          data: { status: "PENDING" },
        });
        if (updated.count > 0) {
          staleChainsReset++;
          io?.to(`ride:${req.id}`).emit("ride:back_to_pending", {
            rideRequestId: req.id,
          });
        }
      }
    }

    const result = {
      expiredOffers: expiredOffers.length,
      rideRequestsResetToPending: resetToPending,
      staleChainsReset,
      durationMs: Date.now() - start,
    };
    console.log("[Job:offer-cleanup]", result);
    await releaseLock(JOB_NAME, result);
  } catch (err) {
    console.error("[Job:offer-cleanup] Error:", err);
    await releaseLock(JOB_NAME, {
      error: String(err),
      durationMs: Date.now() - start,
    });
  }
}
