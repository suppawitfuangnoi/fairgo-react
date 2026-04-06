/**
 * POST /api/v1/trips/:id/confirm-payment
 *
 * Confirms cash payment for a trip.
 * - Driver calls this → sets driverConfirmedAt; driver confirmation alone
 *   is sufficient to complete the trip (CASH flow).
 * - Passenger can also call to record their side (passengerConfirmedAt).
 *
 * State machine enforcement:
 *   Uses validateTransition() from trip-state-machine so the
 *   AWAITING_CASH_CONFIRMATION → COMPLETED rule stays in one place.
 *   The actorRole is "SYSTEM" here because confirm-payment is a
 *   dedicated end-point (not a raw status push) — SYSTEM is allowed
 *   for that transition in the state machine.
 *
 * Race-safety:
 *   Trip completion uses the same atomic UPDATE WHERE RETURNING pattern
 *   as the generic status route.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";
import { validateTransition } from "@/lib/trip-state-machine";
import { logStatusTransition } from "../status/route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id: tripId } = await params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driverProfile: { include: { user: true } },
        rideRequest: { include: { customerProfile: true } },
        payment: true,
      },
    });
    if (!trip) return errorResponse("Trip not found", 404);

    const isDriver   = trip.driverProfile.userId === user.userId;
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;

    if (!isDriver && !isCustomer) {
      return errorResponse("Not authorized to confirm payment for this trip", 403);
    }

    // ── State machine validation ───────────────────────────────────────────
    // Confirm-payment is only meaningful from AWAITING_CASH_CONFIRMATION.
    // We validate using SYSTEM role (dedicated endpoint; see file-level comment).
    // Allow ARRIVED_DESTINATION as a fallback for drivers who skip the
    // explicit AWAITING_CASH_CONFIRMATION step (should not normally happen
    // but provides resilience).
    const currentStatus = trip.status as string;

    if (!["AWAITING_CASH_CONFIRMATION", "ARRIVED_DESTINATION"].includes(currentStatus)) {
      return errorResponse(
        `Cannot confirm payment for trip in status '${currentStatus}'. ` +
        `Driver must advance the trip to AWAITING_CASH_CONFIRMATION first.`,
        422
      );
    }

    // Validate AWAITING_CASH_CONFIRMATION → COMPLETED via state machine
    // (uses SYSTEM role which is allowed for that edge)
    const check = validateTransition(currentStatus, "COMPLETED", "SYSTEM");
    if (!check.ok) {
      return errorResponse(check.message, check.httpStatus);
    }

    // ── Get or create payment record ───────────────────────────────────────
    let payment = trip.payment;
    if (!payment) {
      const commission    = Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
      const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
      payment = await prisma.payment.create({
        data: {
          tripId,
          amount: trip.lockedFare,
          commission,
          driverEarning,
          method: "CASH",
          status: "PENDING",
        },
      });
    }

    if (payment.status === "COMPLETED") {
      // Idempotent: payment already done
      return successResponse(
        { payment, tripCompleted: true, driverConfirmed: true, passengerConfirmed: true },
        "Payment already confirmed"
      );
    }

    // ── Record confirmation timestamp ──────────────────────────────────────
    const now = new Date();
    const paymentUpdate: Record<string, unknown> = {};

    if (isDriver && !payment.driverConfirmedAt) {
      paymentUpdate.driverConfirmedAt = now;
    } else if (isCustomer && !payment.passengerConfirmedAt) {
      paymentUpdate.passengerConfirmedAt = now;
    } else {
      return errorResponse("You have already confirmed this payment", 409);
    }

    // Driver confirmation alone completes the CASH payment
    const driverConfirmed    = payment.driverConfirmedAt ?? (isDriver ? now : null);
    const passengerConfirmed = payment.passengerConfirmedAt ?? (isCustomer ? now : null);
    const isFullyConfirmed   = !!driverConfirmed;

    if (isFullyConfirmed) {
      paymentUpdate.status = "COMPLETED";
      paymentUpdate.paidAt = now;

      // ── Atomic trip completion ─────────────────────────────────────────
      const atomicResult = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE trips
        SET    status       = 'COMPLETED'::"TripStatus",
               "completedAt" = NOW(),
               "updatedAt"   = NOW()
        WHERE  id     = ${tripId}
          AND  status = ${currentStatus}::"TripStatus"
        RETURNING id
      `;

      if (atomicResult.length === 0) {
        // Race — re-check idempotency
        const refetched = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
        if (refetched?.status === "COMPLETED") {
          // Already completed — idempotent
          const updatedPayment = await prisma.payment.update({ where: { id: payment.id }, data: paymentUpdate });
          return successResponse(
            { payment: updatedPayment, tripCompleted: true, driverConfirmed: !!driverConfirmed, passengerConfirmed: !!passengerConfirmed },
            "Payment confirmed. Trip completed! (idempotent)"
          );
        }
        return errorResponse(
          `Trip status changed concurrently (now '${refetched?.status ?? "unknown"}'). Please retry.`,
          409
        );
      }

      // Update trip counts
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

      // Audit log
      const actorType = isDriver ? "DRIVER" : "CUSTOMER";
      await logStatusTransition(tripId, currentStatus, "COMPLETED", actorType, user.userId, "Cash payment confirmed")
        .catch((e) => console.error("[CONFIRM-PAYMENT] Log error:", e));

      // Notifications
      emitToRoom(`trip:${tripId}`, "trip:completed", { tripId, lockedFare: trip.lockedFare });
      emitToUser(trip.rideRequest.customerProfile.userId, "trip:payment_confirmed", { tripId, amount: trip.lockedFare });
      await Promise.all([
        Notif.paymentConfirmed(trip.rideRequest.customerProfile.userId, tripId, trip.lockedFare),
        Notif.paymentConfirmed(trip.driverProfile.user.id, tripId, trip.lockedFare),
        Notif.tripCompleted(trip.rideRequest.customerProfile.userId, tripId, trip.lockedFare, false),
        Notif.tripCompleted(trip.driverProfile.user.id, tripId, trip.lockedFare, true),
      ]);
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: paymentUpdate,
    });

    return successResponse(
      {
        payment: updatedPayment,
        tripCompleted: isFullyConfirmed,
        driverConfirmed: !!driverConfirmed,
        passengerConfirmed: !!passengerConfirmed,
      },
      isFullyConfirmed
        ? "Payment confirmed. Trip completed!"
        : "Confirmation recorded. Waiting for driver confirmation."
    );
  } catch (error) {
    console.error("[CONFIRM-PAYMENT] Error:", error);
    return errorResponse("Failed to confirm payment", 500);
  }
}
