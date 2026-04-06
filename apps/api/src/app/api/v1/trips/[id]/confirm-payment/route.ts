import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";

/**
 * POST /api/v1/trips/:id/confirm-payment
 * Confirms cash payment for a trip.
 * - Driver calls this to confirm they received cash → sets driverConfirmedAt
 * - Passenger calls this to confirm they paid → sets passengerConfirmedAt
 * - Once BOTH confirm (or driver alone confirms if passenger confirmation is optional),
 *   trip moves to COMPLETED and payment status becomes COMPLETED.
 */
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

    // Must be in AWAITING_CASH_CONFIRMATION or IN_PROGRESS to confirm payment
    const eligibleStatuses = ["AWAITING_CASH_CONFIRMATION", "IN_PROGRESS", "ARRIVED_DESTINATION"];
    if (!eligibleStatuses.includes(trip.status as string)) {
      return errorResponse(
        `Cannot confirm payment for trip in status: ${trip.status}. Driver must set AWAITING_CASH_CONFIRMATION first.`,
        422
      );
    }

    const isDriver = trip.driverProfile.userId === user.userId;
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;

    if (!isDriver && !isCustomer) {
      return errorResponse("Not authorized to confirm payment for this trip", 403);
    }

    // Get or create payment record
    let payment = trip.payment;
    if (!payment) {
      const commission =
        Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
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
      return errorResponse("Payment already confirmed", 409);
    }

    // Update the appropriate confirmation timestamp
    const now = new Date();
    const paymentUpdate: Record<string, unknown> = {};

    if (isDriver && !payment.driverConfirmedAt) {
      paymentUpdate.driverConfirmedAt = now;
    } else if (isCustomer && !payment.passengerConfirmedAt) {
      paymentUpdate.passengerConfirmedAt = now;
    } else {
      return errorResponse("You have already confirmed this payment", 409);
    }

    // Check if both parties confirmed (or just driver, which is sufficient for CASH)
    const driverConfirmed = payment.driverConfirmedAt || (isDriver ? now : null);
    const passengerConfirmed = payment.passengerConfirmedAt || (isCustomer ? now : null);

    // Driver confirmation alone is enough to complete CASH payment
    const isFullyConfirmed = !!driverConfirmed;

    if (isFullyConfirmed) {
      paymentUpdate.status = "COMPLETED";
      paymentUpdate.paidAt = now;

      // Complete the trip
      await prisma.trip.update({
        where: { id: tripId },
        data: { status: "COMPLETED", completedAt: now },
      });

      // Log the status transition
      const logId = `tsl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await prisma.$executeRaw`
        INSERT INTO trip_status_logs (id, "tripId", "fromStatus", "toStatus", "changedByType", "changedById", note, "createdAt")
        VALUES (${logId}, ${tripId}, ${trip.status as string}, 'COMPLETED', ${isDriver ? "DRIVER" : "CUSTOMER"}, ${user.userId}, 'Cash payment confirmed', NOW())
      `;

      // Update trip counts
      await prisma.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { totalTrips: { increment: 1 } },
      });
      await prisma.customerProfile.update({
        where: { id: trip.rideRequest.customerProfileId },
        data: { totalTrips: { increment: 1 } },
      });

      // Notify both parties
      emitToRoom(`trip:${tripId}`, "trip:completed", {
        tripId,
        lockedFare: trip.lockedFare,
      });
      emitToUser(trip.rideRequest.customerProfile.userId, "trip:payment_confirmed", {
        tripId,
        amount: trip.lockedFare,
      });
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
        : "Payment confirmation recorded. Waiting for driver confirmation."
    );
  } catch (error) {
    console.error("[CONFIRM-PAYMENT] Error:", error);
    return errorResponse("Failed to confirm payment", 500);
  }
}
