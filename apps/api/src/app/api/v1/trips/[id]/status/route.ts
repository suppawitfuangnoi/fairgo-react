import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateTripStatusSchema } from "@/lib/validation";
import { TripStatus } from "@prisma/client";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";

const VALID_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  DRIVER_ASSIGNED: ["DRIVER_EN_ROUTE", "CANCELLED"],
  DRIVER_EN_ROUTE: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["PICKUP_CONFIRMED", "CANCELLED"],
  PICKUP_CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Which roles can trigger which transitions
const DRIVER_TRANSITIONS: TripStatus[] = [
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
];
const CUSTOMER_TRANSITIONS: TripStatus[] = ["CANCELLED"];

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
      include: {
        driverProfile: { include: { user: true } },
        rideRequest: { include: { customerProfile: true } },
      },
    });

    if (!trip) return errorResponse("Trip not found", 404);

    const newStatus = result.data.status as TripStatus;

    // Authorization: verify caller is the assigned driver or the customer
    const isDriver = trip.driverProfile.userId === user.userId;
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;
    const isAdmin = user.role === "ADMIN";

    if (!isDriver && !isCustomer && !isAdmin) {
      return errorResponse("Not authorized to update this trip", 403);
    }

    // Role-based transition restrictions
    if (isDriver && !isAdmin && !DRIVER_TRANSITIONS.includes(newStatus)) {
      return errorResponse("Drivers can only advance the trip forward or cancel", 403);
    }
    if (isCustomer && !isAdmin && !CUSTOMER_TRANSITIONS.includes(newStatus)) {
      return errorResponse("Customers can only cancel a trip", 403);
    }

    // Validate state machine
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
          method: "CASH",
          status: "COMPLETED",
          paidAt: new Date(),
        },
      });

      // Update trip counts
      await prisma.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { totalTrips: { increment: 1 } },
      });
      await prisma.customerProfile.update({
        where: { id: trip.rideRequest.customerProfileId },
        data: { totalTrips: { increment: 1 } },
      });
    } else if (newStatus === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = user.userId;
      updateData.cancelReason = result.data.cancelReason || "Cancelled by user";
    }

    const updated = await prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        driverProfile: {
          include: { user: { select: { name: true, avatarUrl: true } } },
        },
        payment: true,
      },
    });

    // Broadcast to trip room (both driver and customer listen here)
    emitToRoom(`trip:${id}`, "trip:status_update", updated);
    emitToRoom("admin:monitor", "trip:status_update", updated);

    // If cancelled, also notify the other party individually
    if (newStatus === "CANCELLED") {
      if (isDriver) {
        emitToUser(trip.rideRequest.customerProfile.userId, "trip:cancelled", {
          tripId: id,
          cancelledBy: "driver",
          reason: result.data.cancelReason,
        });
      } else if (isCustomer) {
        emitToUser(trip.driverProfile.user.id, "trip:cancelled", {
          tripId: id,
          cancelledBy: "customer",
          reason: result.data.cancelReason,
        });
      }
    }

    return successResponse(updated, `Trip status updated to ${newStatus}`);
  } catch (error) {
    console.error("[TRIPS] Update status error:", error);
    return errorResponse("Failed to update trip status", 500);
  }
}
