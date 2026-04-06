/**
 * driver-presence-cleanup.ts
 *
 * Runs every 5 minutes.  Marks drivers offline when their heartbeat has
 * gone stale, complementing the in-memory 60 s sweep in server.ts with a
 * DB-locked, replica-safe pass that survives server restarts.
 *
 * Logic:
 *  - Find DriverProfiles where `isOnline = true` AND `lastSeenAt < NOW() - 5 min`
 *  - Exclude drivers who have an active trip (status not in terminal set)
 *  - Mark the remaining profiles offline (isOnline = false)
 *  - Emit `driver:status:change` to admin:monitor for each affected driver
 *
 * Active-trip exemption prevents falsely taking a driver offline while they
 * are mid-trip with a temporarily interrupted heartbeat.
 */

import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";
import { acquireLock, releaseLock } from "./job-lock";

const JOB_NAME = "driver-presence-cleanup";
const LOCK_TTL_SECONDS = 3 * 60;
/** Mark offline after this many minutes without a heartbeat. */
const STALE_HEARTBEAT_MINUTES = 5;

/** Trip statuses that indicate a driver is currently serving a customer. */
const ACTIVE_TRIP_STATUSES = [
  "DRIVER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  "AWAITING_CASH_CONFIRMATION",
] as const;

export async function runDriverPresenceCleanup(): Promise<void> {
  const locked = await acquireLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!locked) {
    console.log("[Job:driver-presence-cleanup] Skipped — lock held by another instance");
    return;
  }

  const start = Date.now();
  const io = getIO();

  try {
    const staleThreshold = new Date(
      Date.now() - STALE_HEARTBEAT_MINUTES * 60 * 1000
    );

    // Find online drivers whose heartbeat has gone stale, excluding those
    // currently on an active trip (heartbeat may be temporarily disrupted).
    const staleDrivers = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        lastSeenAt: { lt: staleThreshold },
        trips: {
          none: {
            status: { in: [...ACTIVE_TRIP_STATUSES] },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        lastSeenAt: true,
      },
    });

    if (staleDrivers.length === 0) {
      await releaseLock(JOB_NAME, {
        driversMarkedOffline: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    const staleIds = staleDrivers.map((d) => d.id);

    // Bulk update in one query
    const updated = await prisma.driverProfile.updateMany({
      where: {
        id: { in: staleIds },
        isOnline: true, // guard against race with concurrent heartbeat
      },
      data: { isOnline: false },
    });

    // Notify admin monitor for each affected driver
    for (const driver of staleDrivers) {
      io?.to("admin:monitor").emit("driver:status:change", {
        driverProfileId: driver.id,
        userId: driver.userId,
        isOnline: false,
        reason: "stale_heartbeat",
        lastSeenAt: driver.lastSeenAt,
      });
    }

    const result = {
      driversMarkedOffline: updated.count,
      durationMs: Date.now() - start,
    };
    console.log("[Job:driver-presence-cleanup]", result);
    await releaseLock(JOB_NAME, result);
  } catch (err) {
    console.error("[Job:driver-presence-cleanup] Error:", err);
    await releaseLock(JOB_NAME, {
      error: String(err),
      durationMs: Date.now() - start,
    });
  }
}
