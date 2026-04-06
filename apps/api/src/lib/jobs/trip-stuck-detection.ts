/**
 * trip-stuck-detection.ts
 *
 * Runs every 10 minutes.  Identifies trips that have been stuck in a
 * transitional status for longer than expected and writes AuditLog warnings
 * so the admin team can intervene before customers are badly affected.
 *
 * Thresholds (all in minutes):
 *  - DRIVER_ASSIGNED          > 30 min  (driver hasn't departed)
 *  - DRIVER_EN_ROUTE          > 45 min  (unusually long travel to pickup)
 *  - DRIVER_ARRIVED           > 20 min  (driver waiting too long at pickup)
 *  - IN_PROGRESS              > 240 min (4 h — trip taking far too long)
 *  - AWAITING_CASH_CONFIRMATION > 30 min  (cash handoff not confirmed)
 *
 * For each stuck trip:
 *  - AuditLog row written with action TRIP_STUCK_WARNING (best-effort)
 *  - Socket event monitor:trip_stuck emitted to admin:monitor room
 */

import { prisma } from "../prisma";
import { getIO } from "../socket";
import { acquireLock, releaseLock } from "./job-lock";

const JOB_NAME = "trip-stuck-detection";
const LOCK_TTL_SECONDS = 7 * 60;

/** Minutes after which a trip in each status is considered stuck. */
const THRESHOLDS: Record<string, number> = {
  DRIVER_ASSIGNED: 30,
  DRIVER_EN_ROUTE: 45,
  DRIVER_ARRIVED: 20,
  IN_PROGRESS: 240, // 4 hours
  AWAITING_CASH_CONFIRMATION: 30,
};

export async function runTripStuckDetection(): Promise<void> {
  const locked = await acquireLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!locked) {
    console.log("[Job:trip-stuck-detection] Skipped — lock held by another instance");
    return;
  }

  const start = Date.now();
  const io = getIO();
  let stuckCount = 0;

  try {
    const now = Date.now();

    for (const [status, thresholdMinutes] of Object.entries(THRESHOLDS)) {
      const cutoff = new Date(now - thresholdMinutes * 60 * 1000);

      const stuckTrips = await prisma.trip.findMany({
        where: {
          status: status as never,
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          driverProfileId: true,
          rideRequestId: true,
          driverProfile: {
            select: { userId: true },
          },
        },
      });

      for (const trip of stuckTrips) {
        const minutesStuck = Math.floor(
          (now - trip.updatedAt.getTime()) / 60_000
        );

        // Emit to admin monitor room
        io?.to("admin:monitor").emit("monitor:trip_stuck", {
          tripId: trip.id,
          status: trip.status,
          minutesStuck,
          driverProfileId: trip.driverProfileId,
          rideRequestId: trip.rideRequestId,
        });

        // Write AuditLog warning (best-effort, non-blocking)
        prisma.auditLog
          .create({
            data: {
              userId: null, // SYSTEM action — no user actor
              action: "TRIP_STUCK_WARNING",
              entity: "Trip",
              entityId: trip.id,
              newData: {
                status,
                minutesStuck,
                threshold: thresholdMinutes,
                driverProfileId: trip.driverProfileId,
                note: `Trip stuck in ${status} for ${minutesStuck} min (threshold: ${thresholdMinutes} min)`,
              },
            },
          })
          .catch(() => {});

        stuckCount++;
      }
    }

    const result = {
      stuckTripsDetected: stuckCount,
      durationMs: Date.now() - start,
    };
    console.log("[Job:trip-stuck-detection]", result);
    await releaseLock(JOB_NAME, result);
  } catch (err) {
    console.error("[Job:trip-stuck-detection] Error:", err);
    await releaseLock(JOB_NAME, {
      error: String(err),
      durationMs: Date.now() - start,
    });
  }
}
