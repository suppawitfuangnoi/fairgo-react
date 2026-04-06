/**
 * POST /api/v1/admin/trips/:id/force-status
 *
 * Admin-only override endpoint.
 * Unlike PATCH /trips/:id/status this endpoint:
 *   - Does NOT validate against the state machine transition map
 *   - Can move trips OUT OF terminal states (e.g. fix a wrongly-closed trip)
 *   - REQUIRES a note explaining why the override is necessary
 *   - Stamps every override in TripStatusLog with changedByType = "ADMIN_OVERRIDE"
 *
 * Use this sparingly — it exists for dispute resolution and data-correction
 * scenarios where the normal state machine would reject the change.
 *
 * Allowed destination statuses: all 13 TripStatus values.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom } from "@/lib/socket";
import { TripStatus, STATUS_META, isCancellation } from "@/lib/trip-state-machine";

const forceStatusSchema = z.object({
  status: z.enum([
    "DRIVER_ASSIGNED",
    "DRIVER_EN_ROUTE",
    "DRIVER_ARRIVED",
    "PICKUP_CONFIRMED",
    "IN_PROGRESS",
    "ARRIVED_DESTINATION",
    "AWAITING_CASH_CONFIRMATION",
    "COMPLETED",
    "CANCELLED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "NO_SHOW_PASSENGER",
    "NO_SHOW_DRIVER",
  ]),
  note: z.string().min(5, "A reason of at least 5 characters is required").max(1000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id: tripId } = await params;
    const result = await validateBody(request, forceStatusSchema);
    if ("error" in result) return result.error;

    const { status: newStatus, note } = result.data;

    // ── Load trip ──────────────────────────────────────────────────────────
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driverProfile: { include: { user: { select: { name: true } } } },
        rideRequest: { include: { customerProfile: true } },
      },
    });
    if (!trip) return errorResponse("Trip not found", 404);

    const previousStatus = trip.status as string;

    if (previousStatus === newStatus) {
      return successResponse(trip, `Trip is already in status '${newStatus}'`);
    }

    // ── Force update — no state machine check ──────────────────────────────
    await prisma.$executeRaw`
      UPDATE trips
      SET    status      = ${newStatus}::"TripStatus",
             "updatedAt" = NOW()
      WHERE  id = ${tripId}
    `;

    // Side effects based on target status
    if (newStatus === "COMPLETED") {
      await prisma.$executeRaw`
        UPDATE trips SET "completedAt" = NOW() WHERE id = ${tripId} AND "completedAt" IS NULL
      `;
    }
    if (isCancellation(newStatus as TripStatus)) {
      await prisma.$executeRaw`
        UPDATE trips
        SET    "cancelledAt"  = NOW(),
               "cancelledBy"  = ${admin.userId},
               "cancelReason" = ${note}
        WHERE  id = ${tripId}
          AND  "cancelledAt" IS NULL
      `;
    }

    // ── Audit log — tagged as ADMIN_OVERRIDE ───────────────────────────────
    const logId = `tsl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRaw`
      INSERT INTO trip_status_logs (id, "tripId", "fromStatus", "toStatus", "changedByType", "changedById", note, "createdAt")
      VALUES (${logId}, ${tripId}, ${previousStatus}, ${newStatus}, 'ADMIN_OVERRIDE', ${admin.userId}, ${note}, NOW())
    `;

    // ── Fetch updated trip ─────────────────────────────────────────────────
    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driverProfile: {
          include: { user: { select: { name: true, avatarUrl: true } } },
        },
        payment: true,
      },
    });

    const toMeta = STATUS_META[newStatus as TripStatus];

    // Broadcast to trip room and admin monitor
    emitToRoom(`trip:${tripId}`, "trip:status_update", updatedTrip);
    emitToRoom(`trip:${tripId}`, "trip:admin_override", {
      tripId,
      previousStatus,
      newStatus,
      newStatusLabel: toMeta?.label ?? newStatus,
      note,
      adminId: admin.userId,
    });
    emitToRoom("admin:monitor", "trip:status_update", updatedTrip);

    return successResponse(
      {
        trip: updatedTrip,
        override: {
          previousStatus,
          newStatus,
          newStatusLabel: toMeta?.label ?? newStatus,
          note,
          logId,
        },
      },
      `Admin override: trip status forced from '${previousStatus}' to '${newStatus}'`
    );
  } catch (error) {
    console.error("[ADMIN FORCE-STATUS] Error:", error);
    return errorResponse("Failed to force trip status", 500);
  }
}
