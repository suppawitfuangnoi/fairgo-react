/**
 * ride-request-cleanup.ts
 *
 * Runs every 10 minutes.  Expires ride requests that have been waiting for a
 * driver for too long, preventing stale requests from lingering in the system.
 *
 * Rules:
 *  - PENDING for > 60 min with no offers ever → EXPIRED
 *  - MATCHING / NEGOTIATING for > 30 min with no remaining PENDING offers → EXPIRED
 *
 * On expiry:
 *  - Socket event sent to the customer's personal room
 *  - Best-effort push notification via sendNotification()
 *  - Admin monitor notified
 */

import { prisma } from "../prisma";
import { getIO } from "../socket";
import { createAndEmitNotification } from "../notifications";
import { acquireLock, releaseLock } from "./job-lock";

const JOB_NAME = "ride-request-cleanup";
const LOCK_TTL_SECONDS = 7 * 60;
const PENDING_EXPIRE_MINUTES = 60;
const NEGOTIATING_EXPIRE_MINUTES = 30;

export async function runRideRequestCleanup(): Promise<void> {
  const locked = await acquireLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!locked) {
    console.log("[Job:ride-request-cleanup] Skipped — lock held by another instance");
    return;
  }

  const start = Date.now();
  const io = getIO();
  try {
    const pendingCutoff = new Date(Date.now() - PENDING_EXPIRE_MINUTES * 60 * 1000);
    const negotiatingCutoff = new Date(
      Date.now() - NEGOTIATING_EXPIRE_MINUTES * 60 * 1000
    );

    // ── 1. Expire long-pending requests (no driver responded) ─────────────────
    const expiredPending = await prisma.$queryRaw<
      { id: string; customerProfileId: string }[]
    >`
      UPDATE ride_requests
      SET    status = 'EXPIRED'::"RideRequestStatus"
      WHERE  status = 'PENDING'::"RideRequestStatus"
        AND  "createdAt" < ${pendingCutoff}
      RETURNING id, "customerProfileId"
    `;

    // ── 2. Expire stale MATCHING/NEGOTIATING requests with no active offers ───
    const expiredNegotiating = await prisma.$queryRaw<
      { id: string; customerProfileId: string }[]
    >`
      UPDATE ride_requests rr
      SET    status = 'EXPIRED'::"RideRequestStatus"
      WHERE  rr.status IN (
               'MATCHING'::"RideRequestStatus",
               'NEGOTIATING'::"RideRequestStatus"
             )
        AND  rr."updatedAt" < ${negotiatingCutoff}
        AND  NOT EXISTS (
               SELECT 1 FROM ride_offers ro
               WHERE  ro."rideRequestId" = rr.id
                 AND  ro.status = 'PENDING'::"RideOfferStatus"
             )
      RETURNING rr.id, rr."customerProfileId"
    `;

    const allExpired = [...expiredPending, ...expiredNegotiating];
    if (allExpired.length === 0) {
      await releaseLock(JOB_NAME, {
        expiredPending: 0,
        expiredNegotiating: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    // ── 3. Resolve customer userIds for socket events ─────────────────────────
    const profileIds = [...new Set(allExpired.map((r) => r.customerProfileId))];
    const profiles = await prisma.customerProfile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, userId: true },
    });
    const profileToUser = new Map(profiles.map((p) => [p.id, p.userId]));

    // ── 4. Emit socket events + notifications ─────────────────────────────────
    for (const req of allExpired) {
      const userId = profileToUser.get(req.customerProfileId);
      if (userId) {
        io?.to(`user:${userId}`).emit("ride:expired", { rideRequestId: req.id });
        createAndEmitNotification({
          userId,
          type: "SYSTEM",
          title: "ไม่พบคนขับ",
          body: "ขออภัย ไม่พบคนขับในเวลาที่กำหนด กรุณาลองใหม่อีกครั้ง",
          payload: { rideRequestId: req.id },
        }).catch(() => {});
      }
      io?.to("admin:monitor").emit("monitor:ride_request_expired", {
        rideRequestId: req.id,
      });
    }

    const result = {
      expiredPending: expiredPending.length,
      expiredNegotiating: expiredNegotiating.length,
      totalExpired: allExpired.length,
      durationMs: Date.now() - start,
    };
    console.log("[Job:ride-request-cleanup]", result);
    await releaseLock(JOB_NAME, result);
  } catch (err) {
    console.error("[Job:ride-request-cleanup] Error:", err);
    await releaseLock(JOB_NAME, {
      error: String(err),
      durationMs: Date.now() - start,
    });
  }
}
