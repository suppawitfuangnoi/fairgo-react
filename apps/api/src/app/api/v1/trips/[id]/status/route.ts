import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateTripStatusSchema } from "@/lib/validation";
import { TripStatus } from "@prisma/client";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom } from "@/lib/socket";

const VALID_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  DRIVER_ASSIGNED: ["DRIVER_EN_ROUTE", "CANCELLED"],
  DRIVER_EN_ROUTE: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["PICKUP_CONFIRMED", "CANCELLED"],
  PICKUP_CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

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

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { driverProfile: true },
    });

    if (!trip) return errorResponse("Trip not found", 404);

    // Validate state transition
    const newStatus = result.data.status as TripStatus;
    const validNextStatuses = VALID_TRANSITIONS[trip.status];
    if (!validNextStatuses.includes(newStatus)) {
      return errorResponse(
        `Invalid transition from ${trip.status} to ${newStatus}`,
        422
      );
    }

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === "IN_PROGRESS") {
      updateData.startedAt = new Date();
    } else if (newStatus === "COMPLETED") {
      updateData.completedAt = new Date();

      // Create payment record
      const commission = trip.lockedFare * trip.driverProfile.commissionRate;
      await prisma.payment.create({
        data: {
          tripId: trip.id,
          amount: trip.lockedFare,
          commission,
          driverEarning: trip.lockedFare - commission,
          method: "CASH", // Default for MVP
          status: "COMPLETED",
          paidAt: new Date(),
        },
      });

      // Update trip counts
      await prisma.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { totalTrips: { increment: 1 } },
      });

      const rideRequest = await prisma.rideRequest.findUnique({
        where: { id: trip.rideRequestId },
      });
      if (rideRequest) {
        await prisma.customerProfile.update({
          where: { id: rideRequest.customerProfileId },
          data: { totalTrips: { increment: 1 } },
        });
      }
    } else if (newStatus === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = user.userId;
      updateData.cancelReason = result.data.cancelReason || "Cancelled";
    }

    const updated = await prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        driverProfile: {
          include: {
            user: { select: { name: true, avatarUrl: true } },
          },
        },
        payment: true,
      },
    });

    // Notify both customer and driver via trip room
    emitToRoom(`trip:${id}`, "trip:status_update", updated);
    emitToRoom("admin:monitor", "trip:status_update", updated);

    return successResponse(updated, `Trip status updated to ${newStatus}`);
  } catch (error) {
    console.error("[TRIPS] Update status error:", error);
    return errorResponse("Failed to update trip status", 500);
  }
}
