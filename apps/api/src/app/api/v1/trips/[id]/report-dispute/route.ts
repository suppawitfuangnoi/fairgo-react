/**
 * POST /api/v1/trips/:id/report-dispute
 *
 * Passenger reports a payment dispute for a trip.
 *
 * Business rules:
 *   - Only the passenger on this trip may raise a dispute.
 *   - The trip must be in AWAITING_CASH_CONFIRMATION or COMPLETED.
 *   - A dispute reason of at least 5 characters is required.
 *   - One active dispute per payment (idempotent: calling again while
 *     disputeFlag is true returns 200 with existing ticket).
 *   - Sets Payment.disputeFlag = true, records reason + timestamp.
 *   - Creates a SupportTicket linked to the trip.
 *   - Emits admin socket notification and persists DB notification.
 *   - Audit log entry is written.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom } from "@/lib/socket";
import { Notif } from "@/lib/notifications";

const reportDisputeSchema = z.object({
  reason: z
    .string()
    .min(5, "Please describe the issue in at least 5 characters")
    .max(1000),
  category: z
    .enum(["WRONG_AMOUNT", "DRIVER_REFUSED", "RECEIPT_MISSING", "OTHER"])
    .default("OTHER"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id: tripId } = await params;
    const result = await validateBody(request, reportDisputeSchema);
    if ("error" in result) return result.error;

    const { reason, category } = result.data;

    // ── Load trip ──────────────────────────────────────────────────────────
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driverProfile: { include: { user: { select: { id: true, name: true } } } },
        rideRequest:   { include: { customerProfile: { include: { user: { select: { id: true, name: true } } } } } },
        payment:       true,
      },
    });
    if (!trip) return errorResponse("Trip not found", 404);

    // ── Only the passenger may raise a dispute ─────────────────────────────
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;
    if (!isCustomer) {
      return errorResponse("Only the passenger on this trip may report a dispute", 403);
    }

    // ── Trip must be at payment stage or completed ─────────────────────────
    const eligible = ["AWAITING_CASH_CONFIRMATION", "COMPLETED", "ARRIVED_DESTINATION"];
    if (!eligible.includes(trip.status as string)) {
      return errorResponse(
        `Cannot raise a payment dispute for a trip in status '${trip.status}'.`,
        422
      );
    }

    // ── Ensure payment record exists ───────────────────────────────────────
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

    // ── Idempotent: one active dispute at a time ───────────────────────────
    if (payment.disputeFlag) {
      // Find the existing ticket
      const existingTicket = await prisma.supportTicket.findFirst({
        where: { tripId, userId: user.userId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
      });
      return successResponse(
        { disputeActive: true, ticketId: existingTicket?.id ?? null },
        "A dispute is already open for this payment"
      );
    }

    const now = new Date();

    // ── Set dispute flag on payment ────────────────────────────────────────
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        disputeFlag:    true,
        disputeReason:  `[${category}] ${reason}`,
        disputeRaisedAt: now,
        disputeRaisedBy: user.userId,
      },
    });

    // ── Create SupportTicket ───────────────────────────────────────────────
    const passengerName = trip.rideRequest.customerProfile.user.name ?? "Passenger";
    const ticket = await prisma.supportTicket.create({
      data: {
        userId:      user.userId,
        tripId,
        subject:     `Payment dispute — Trip ${tripId.slice(-8).toUpperCase()} [${category}]`,
        description: `Reported by ${passengerName}.\n\nFare: ฿${trip.lockedFare}\nReason: ${reason}`,
        status:      "OPEN",
        priority:    "HIGH",
      },
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        userId:   user.userId,
        action:   "DISPUTE_RAISED",
        entity:   "Payment",
        entityId: payment.id,
        newData:  { tripId, reason, category, ticketId: ticket.id } as object,
      },
    });

    // ── Notify admin room + persist DB notification ────────────────────────
    emitToRoom("admin:monitor", "payment:dispute_raised", {
      tripId,
      paymentId: payment.id,
      ticketId:  ticket.id,
      amount:    trip.lockedFare,
      reason,
      category,
      passengerName,
    });
    await Notif.disputeCreated(user.userId, tripId, ticket.id, trip.lockedFare);

    return successResponse(
      {
        disputeActive: true,
        ticketId:      ticket.id,
        paymentId:     payment.id,
      },
      "Dispute reported. Our team will review and contact you shortly."
    );
  } catch (error) {
    console.error("[REPORT-DISPUTE] Error:", error);
    return errorResponse("Failed to report dispute", 500);
  }
}
