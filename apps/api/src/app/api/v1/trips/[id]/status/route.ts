/**
 * PATCH /api/v1/trips/:id/status
 *
 * Single endpoint that drives all trip state transitions.
 * All validation is delegated to the central state machine
 * (src/lib/trip-state-machine.ts) so role rules and allowed
 * transitions can never diverge between routes.
 *
 * Race-safety:
 *   The status column is updated with an atomic
 *   UPDATE … WHERE id = $id AND status = $current RETURNING id
 *   If the RETURNING set is empty another request changed the
 *   status first.  We re-fetch and return 200 if it is now the
 *   desired value (idempotent retry), or 409 if something else
 *   raced us to it.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateTripStatusSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";
import {
  validateTransition,
  requiresNote,
  isCancellation,
  ActorRole,
} from "@/lib/trip-state-machine";

// ── Shared log helper (also used by confirm-payment) ──────────────────────────

export async function logStatusTransition(
  tripId: string,
  fromStatus: string,
  toStatus: string,
  changedByType: string,
  changedById?: string,
  note?: string
): Promise<void> {
  const id = `tsl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO trip_status_logs (id, "tripId", "fromStatus", "toStatus", "changedByType", "changedById", note, "createdAt")
    VALUES (${id}, ${tripId}, ${fromStatus}, ${toStatus}, ${changedByType}, ${changedById ?? null}, ${note ?? null}, NOW())
  `;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id } = await params;
    const result = await validateBody(request, updateTripStatusSchema);
    if ("error" in result) return result.error;

    const { status: newStatus, cancelReason, note } = result.data;

    // ── 1. Load trip ───────────────────────────────────────────────────────
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        driverProfile: { include: { user: true } },
        rideRequest: { include: { customerProfile: true } },
      },
    });
    if (!trip) return errorResponse("Trip not found", 404);

    const currentStatus = trip.status as string;

    // ── 2. Determine actor role ────────────────────────────────────────────
    const isDriver   = trip.driverProfile.userId === user.userId;
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;
    const isAdmin    = user.role === "ADMIN";

    if (!isDriver && !isCustomer && !isAdmin) {
      return errorResponse("Not authorized to update this trip", 403);
    }

    const actorRole: ActorRole = isAdmin ? "ADMIN" : isDriver ? "DRIVER" : "CUSTOMER";

    // ── 3. Idempotent same-status check ────────────────────────────────────
    if (currentStatus === newStatus) {
      return successResponse(trip, `Trip is already in status '${newStatus}'`);
    }

    // ── 4. Central state machine validation (role + transition) ───────────
    const validation = validateTransition(currentStatus, newStatus, actorRole);
    if (!validation.ok) {
      return errorResponse(validation.message, validation.httpStatus);
    }

    // ── 5. Note required check ────────────────────────────────────────────
    const noteValue = note || cancelReason;
    if (requiresNote(currentStatus, newStatus) && !noteValue) {
      return errorResponse(
        `A reason/note is required for the transition ${currentStatus} → ${newStatus}`,
        422
      );
    }

    // ── 6. Atomic status update (race-safe) ────────────────────────────────
    // UPDATE WHERE current status matches — returns row only if we won the race
    const updated = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE trips
      SET    status     = ${newStatus}::"TripStatus",
             "updatedAt" = NOW()
      WHERE  id         = ${id}
        AND  status     = ${currentStatus}::"TripStatus"
      RETURNING id
    `;

    if (updated.length === 0) {
      // Race: someone else changed status between our fetch and update
      const refetched = await prisma.trip.findUnique({ where: { id }, select: { status: true } });
      if (refetched?.status === newStatus) {
        // Idempotent — the other request also targeted our desired state
        const fullTrip = await prisma.trip.findUnique({
          where: { id },
          include: {
            driverProfile: { include: { user: { select: { name: true, avatarUrl: true } } } },
            payment: true,
          },
        });
        return successResponse(fullTrip, `Trip is already in status '${newStatus}'`);
      }
      return errorResponse(
        `Trip status changed concurrently (now '${refetched?.status ?? "unknown"}'). Please retry.`,
        409
      );
    }

    // ── 7. Post-transition side effects ────────────────────────────────────
    // (Only executed once the atomic update has confirmed we own this transition)

    if (newStatus === "IN_PROGRESS") {
      await prisma.$executeRaw`UPDATE trips SET "startedAt" = NOW() WHERE id = ${id}`;
    }

    if (newStatus === "COMPLETED") {
      await prisma.$executeRaw`UPDATE trips SET "completedAt" = NOW() WHERE id = ${id}`;

      const existingPayment = await prisma.payment.findUnique({ where: { tripId: id } });
      if (!existingPayment) {
        const commission    = Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
        const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
        await prisma.payment.create({
          data: {
            tripId: id,
            amount: trip.lockedFare,
            commission,
            driverEarning,
            method: "CASH",
            status: "COMPLETED",
            driverConfirmedAt: new Date(),
            paidAt: new Date(),
          },
        });
      }

      await Promise.all([
        prisma.driverProfile.update({
          where: { id: trip.driverProfileId },
          data: { totalTrips: { increment: 1 } },
        }),
        prisma.customerProfile.update({
          where: { id: trip.rideRequest.customerProfileId },
          data: { totalTrips: { increment: 1 } },
        }),
      ]);
    }

    if (newStatus === "AWAITING_CASH_CONFIRMATION") {
      const existingPayment = await prisma.payment.findUnique({ where: { tripId: id } });
      if (!existingPayment) {
        const commission    = Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
        const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
        await prisma.payment.create({
          data: {
            tripId: id,
            amount: trip.lockedFare,
            commission,
            driverEarning,
            method: "CASH",
            status: "PENDING",
          },
        });
      }
    }

    if (isCancellation(newStatus)) {
      await prisma.$executeRaw`
        UPDATE trips
        SET    "cancelledAt"  = NOW(),
               "cancelledBy"  = ${user.userId},
               "cancelReason" = ${noteValue ?? "Cancelled"}
        WHERE  id = ${id}
      `;
    }

    // ── 8. Fetch updated trip for response ─────────────────────────────────
    const updatedTrip = await prisma.trip.findUnique({
      where: { id },
      include: {
        driverProfile: {
          include: { user: { select: { name: true, avatarUrl: true } } },
        },
        payment: true,
      },
    });

    // ── 9. Audit log ───────────────────────────────────────────────────────
    await logStatusTransition(id, currentStatus, newStatus, actorRole, user.userId, noteValue)
      .catch((e) => console.error("[TRIPS] Log error:", e)); // best-effort

    // ── 10. Broadcast & push notifications ────────────────────────────────
    emitToRoom(`trip:${id}`, "trip:status_update", updatedTrip);
    emitToRoom("admin:monitor", "trip:status_update", updatedTrip);

    const customerUserId = trip.rideRequest.customerProfile.userId;
    const driverUserId   = trip.driverProfile.user.id;
    const driverName     = trip.driverProfile.user.name ?? "Driver";

    if (isCancellation(newStatus)) {
      if (isDriver || isAdmin) {
        emitToUser(customerUserId, "trip:cancelled", { tripId: id, cancelledBy: actorRole, status: newStatus, reason: noteValue });
        await Notif.tripCancelled(customerUserId, id, "driver", noteValue);
      } else {
        emitToUser(driverUserId, "trip:cancelled", { tripId: id, cancelledBy: actorRole, status: newStatus, reason: noteValue });
        await Notif.tripCancelled(driverUserId, id, "customer", noteValue);
      }
    } else if (newStatus === "DRIVER_EN_ROUTE") {
      emitToUser(customerUserId, "trip:driver_en_route", { tripId: id });
      await Notif.driverEnRoute(customerUserId, id, driverName);
    } else if (newStatus === "DRIVER_ARRIVED") {
      emitToUser(customerUserId, "trip:driver_arrived", { tripId: id });
      await Notif.driverArrived(customerUserId, id, driverName);
    } else if (newStatus === "IN_PROGRESS") {
      emitToUser(customerUserId, "trip:started", { tripId: id });
      await Notif.tripStarted(customerUserId, id, trip.dropoffAddress);
    } else if (newStatus === "AWAITING_CASH_CONFIRMATION") {
      emitToUser(customerUserId, "trip:awaiting_payment", { tripId: id, lockedFare: trip.lockedFare });
      await Notif.awaitingCashPayment(customerUserId, id, trip.lockedFare);
    } else if (newStatus === "COMPLETED") {
      emitToRoom(`trip:${id}`, "trip:completed", { tripId: id, lockedFare: trip.lockedFare });
      await Promise.all([
        Notif.tripCompleted(customerUserId, id, trip.lockedFare, false),
        Notif.tripCompleted(driverUserId,   id, trip.lockedFare, true),
      ]);
    }

    return successResponse(updatedTrip, `Trip status updated to ${newStatus}`);
  } catch (error) {
    console.error("[TRIPS] Update status error:", error);
    return errorResponse("Failed to update trip status", 500);
  }
}
