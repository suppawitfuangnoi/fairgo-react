/**
 * GET /api/v1/admin/payments/:tripId
 *
 * Full payment record for a trip, designed for the admin dispute review panel.
 * Returns:
 *   - Complete Payment record including all dispute fields
 *   - Payment timeline (derived from confirmation timestamps)
 *   - Open dispute ticket (if any)
 *   - Trip status log filtered to payment-relevant transitions
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { tripId } = await params;

    // ── Payment + trip ─────────────────────────────────────────────────────
    const [payment, trip] = await Promise.all([
      prisma.payment.findUnique({ where: { tripId } }),
      prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          rideRequest: {
            include: {
              customerProfile: {
                include: { user: { select: { id: true, name: true, phone: true } } },
              },
            },
          },
          driverProfile: {
            include: { user: { select: { id: true, name: true, phone: true } } },
          },
          statusLogs: {
            where: {
              toStatus: {
                in: [
                  "ARRIVED_DESTINATION",
                  "AWAITING_CASH_CONFIRMATION",
                  "COMPLETED",
                  "CANCELLED",
                  "CANCELLED_BY_PASSENGER",
                  "CANCELLED_BY_DRIVER",
                ],
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);

    if (!trip) return errorResponse("Trip not found", 404);

    // ── Open dispute ticket (if any) ───────────────────────────────────────
    const openTicket = await prisma.supportTicket.findFirst({
      where: { tripId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
    });

    // ── Build payment timeline ─────────────────────────────────────────────
    const timeline: Array<{
      event:     string;
      eventTh:   string;
      timestamp: Date | null;
      actor:     string | null;
    }> = [];

    if (payment) {
      timeline.push({ event: "Payment record created", eventTh: "สร้างรายการชำระเงิน", timestamp: payment.createdAt, actor: "SYSTEM" });
      if (payment.passengerConfirmedAt) {
        timeline.push({ event: "Passenger confirmed payment", eventTh: "ผู้โดยสารยืนยันชำระแล้ว", timestamp: payment.passengerConfirmedAt, actor: "PASSENGER" });
      }
      if (payment.driverConfirmedAt) {
        timeline.push({ event: "Driver confirmed cash received", eventTh: "คนขับยืนยันรับเงินสดแล้ว", timestamp: payment.driverConfirmedAt, actor: "DRIVER" });
      }
      if (payment.paidAt) {
        timeline.push({ event: "Payment completed", eventTh: "ชำระเงินเสร็จสิ้น", timestamp: payment.paidAt, actor: "SYSTEM" });
      }
      if (payment.disputeRaisedAt) {
        timeline.push({ event: "Dispute raised", eventTh: "รายงานปัญหา", timestamp: payment.disputeRaisedAt, actor: "PASSENGER" });
      }
      if (payment.disputeResolvedAt) {
        timeline.push({ event: "Dispute resolved by admin", eventTh: "ผู้ดูแลระบบแก้ไขปัญหาแล้ว", timestamp: payment.disputeResolvedAt, actor: "ADMIN" });
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    return successResponse({
      payment,
      timeline,
      dispute: payment
        ? {
            active:          payment.disputeFlag,
            reason:          payment.disputeReason,
            raisedAt:        payment.disputeRaisedAt,
            resolvedAt:      payment.disputeResolvedAt,
            resolutionNote:  payment.disputeResolutionNote,
            openTicket,
          }
        : null,
      trip: {
        id:            trip.id,
        status:        trip.status,
        lockedFare:    trip.lockedFare,
        pickupAddress: trip.pickupAddress,
        dropoffAddress: trip.dropoffAddress,
        startedAt:     trip.startedAt,
        completedAt:   trip.completedAt,
        cancelledAt:   trip.cancelledAt,
      },
      passenger: {
        id:    trip.rideRequest.customerProfile.user.id,
        name:  trip.rideRequest.customerProfile.user.name,
        phone: trip.rideRequest.customerProfile.user.phone,
      },
      driver: {
        id:    trip.driverProfile.user.id,
        name:  trip.driverProfile.user.name,
        phone: trip.driverProfile.user.phone,
      },
      paymentStatusLog: trip.statusLogs,
    });
  } catch (error) {
    console.error("[ADMIN PAYMENTS] GET error:", error);
    return errorResponse("Failed to get payment detail", 500);
  }
}
