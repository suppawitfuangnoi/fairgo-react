/**
 * POST /api/v1/trips/:id/confirm-payment
 *
 * Records cash payment confirmation for a trip.
 *
 * BUSINESS RULES (Phase 6 – CASH only):
 *   - Driver confirmation is the authoritative trigger for trip completion.
 *   - Passenger confirmation is optional / advisory (recorded for audit trail).
 *   - Driver calling this when already COMPLETED returns 200 (idempotent).
 *   - Passenger calling this after the trip is already COMPLETED still
 *     records passengerConfirmedAt if not yet set (late confirmation path).
 *   - Repeated calls from the same actor are safe: returns 200 with
 *     current payment state rather than 409.
 *
 * RACE SAFETY:
 *   Trip completion uses an atomic
 *   UPDATE … WHERE id = $id AND status = $current RETURNING id
 *   so two concurrent driver confirms cannot both complete the trip.
 *
 * STATE MACHINE:
 *   validateTransition(from, "COMPLETED", "SYSTEM") is called so the rule
 *   stays in one place.  SYSTEM role is allowed for that edge.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";
import { validateTransition } from "@/lib/trip-state-machine";
import { logStatusTransition } from "../status/route";

// ── Shared payment shape used by callers ──────────────────────────────────────
export interface ConfirmPaymentResult {
  payment: {
    id: string;
    tripId: string;
    amount: number;
    commission: number;
    driverEarning: number;
    method: string;
    status: string;
    driverConfirmedAt: Date | null;
    passengerConfirmedAt: Date | null;
    paidAt: Date | null;
    disputeFlag: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  tripCompleted: boolean;
  driverConfirmed: boolean;
  passengerConfirmed: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireActiveAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id: tripId } = await params;

    // ── Load trip + payment ────────────────────────────────────────────────
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
    const isAdmin    = user.role === "ADMIN";

    if (!isDriver && !isCustomer && !isAdmin) {
      return errorResponse("Not authorized to confirm payment for this trip", 403);
    }

    const currentStatus = trip.status as string;

    // ── Eligibility check ──────────────────────────────────────────────────
    const eligibleStatuses = [
      "AWAITING_CASH_CONFIRMATION",
      "ARRIVED_DESTINATION",
      "COMPLETED", // Allow late passenger confirmation after trip complete
    ];
    if (!eligibleStatuses.includes(currentStatus)) {
      return errorResponse(
        `Cannot confirm payment for trip in status '${currentStatus}'. ` +
        `Driver must set AWAITING_CASH_CONFIRMATION first.`,
        422
      );
    }

    // ── Get or create payment record ───────────────────────────────────────
    let payment = trip.payment;
    if (!payment) {
      const commission    = Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
      const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
      payment = await prisma.payment.create({
        data: {
          tripId,
          amount:        trip.lockedFare,
          commission,
          driverEarning,
          method:  "CASH",
          status:  "PENDING",
        },
      });
    }

    // ── Idempotency: if trip already COMPLETED, just return current state ──
    if (payment.status === "COMPLETED") {
      // Late passenger confirmation path: record it even if trip is done
      if (isCustomer && !payment.passengerConfirmedAt) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { passengerConfirmedAt: new Date() },
        });
        payment = { ...payment, passengerConfirmedAt: new Date() };
      }
      const result: ConfirmPaymentResult = {
        payment: payment as ConfirmPaymentResult["payment"],
        tripCompleted:    true,
        driverConfirmed:  !!payment.driverConfirmedAt,
        passengerConfirmed: !!payment.passengerConfirmedAt,
      };
      return successResponse(result, "Payment already completed");
    }

    const now = new Date();
    const paymentUpdate: Record<string, unknown> = {};

    // ── Determine what this actor is confirming ────────────────────────────
    if (isDriver || isAdmin) {
      // Driver (or admin acting as driver) — authoritative confirmation
      if (!payment.driverConfirmedAt) {
        paymentUpdate.driverConfirmedAt = now;
      }
      // Regardless of whether we just set it, proceed to trip completion
    } else if (isCustomer) {
      // Passenger — advisory confirmation only; does NOT complete trip
      if (payment.passengerConfirmedAt) {
        // Already confirmed their side — idempotent
        const result: ConfirmPaymentResult = {
          payment: payment as ConfirmPaymentResult["payment"],
          tripCompleted:    false,
          driverConfirmed:  !!payment.driverConfirmedAt,
          passengerConfirmed: true,
        };
        return successResponse(result, "You have already confirmed your payment");
      }
      paymentUpdate.passengerConfirmedAt = now;
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: paymentUpdate,
      });
      const result: ConfirmPaymentResult = {
        payment: updatedPayment as ConfirmPaymentResult["payment"],
        tripCompleted:    false,
        driverConfirmed:  !!payment.driverConfirmedAt,
        passengerConfirmed: true,
      };
      // Emit passenger-confirmed event to driver
      emitToRoom(`trip:${tripId}`, "trip:passenger_payment_confirmed", {
        tripId,
        passengerConfirmedAt: now,
      });
      return successResponse(result, "Payment confirmation recorded. Waiting for driver.");
    }

    // ── Driver path: complete the trip atomically ──────────────────────────
    // Validate AWAITING_CASH_CONFIRMATION → COMPLETED (or ARRIVED_DESTINATION → COMPLETED)
    const fromStatus = currentStatus === "COMPLETED" ? "AWAITING_CASH_CONFIRMATION" : currentStatus;
    const stateCheck = validateTransition(fromStatus, "COMPLETED", "SYSTEM");
    if (!stateCheck.ok) {
      return errorResponse(stateCheck.message, stateCheck.httpStatus);
    }

    // Atomic trip status update
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
      // Race — check if already completed by another request
      const refetched = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
      if (refetched?.status === "COMPLETED") {
        // Idempotent — the other request beat us; finalize payment state
        paymentUpdate.status   = "COMPLETED";
        paymentUpdate.paidAt   = now;
      } else {
        return errorResponse(
          `Trip status changed concurrently (now '${refetched?.status ?? "unknown"}'). Please retry.`,
          409
        );
      }
    } else {
      paymentUpdate.status = "COMPLETED";
      paymentUpdate.paidAt = now;
    }

    // ── Update trip counts (once per trip) ────────────────────────────────
    if (atomicResult.length > 0) {
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

    // ── Finalize payment ───────────────────────────────────────────────────
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: paymentUpdate,
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await logStatusTransition(
      tripId,
      currentStatus,
      "COMPLETED",
      isAdmin ? "ADMIN" : "DRIVER",
      user.userId,
      "Cash payment confirmed"
    ).catch((e) => console.error("[CONFIRM-PAYMENT] Log error:", e));

    // ── Notifications ──────────────────────────────────────────────────────
    emitToRoom(`trip:${tripId}`, "trip:completed", { tripId, lockedFare: trip.lockedFare });
    emitToUser(trip.rideRequest.customerProfile.userId, "trip:payment_confirmed", {
      tripId,
      amount: trip.lockedFare,
    });
    await Promise.all([
      Notif.paymentConfirmed(trip.rideRequest.customerProfile.userId, tripId, trip.lockedFare),
      Notif.paymentConfirmed(trip.driverProfile.user.id, tripId, trip.lockedFare),
      Notif.tripCompleted(trip.rideRequest.customerProfile.userId, tripId, trip.lockedFare, false),
      Notif.tripCompleted(trip.driverProfile.user.id, tripId, trip.lockedFare, true),
    ]);

    const result: ConfirmPaymentResult = {
      payment: updatedPayment as ConfirmPaymentResult["payment"],
      tripCompleted:    true,
      driverConfirmed:  true,
      passengerConfirmed: !!(updatedPayment as any).passengerConfirmedAt,
    };
    return successResponse(result, "Cash payment confirmed. Trip completed!");
  } catch (error) {
    console.error("[CONFIRM-PAYMENT] Error:", error);
    return errorResponse("Failed to confirm payment", 500);
  }
}
