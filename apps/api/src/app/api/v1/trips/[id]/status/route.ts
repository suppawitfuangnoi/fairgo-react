import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateTripStatusSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom, emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";

// Full state machine including new statuses
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRIVER_ASSIGNED: ["DRIVER_EN_ROUTE", "CANCELLED", "CANCELLED_BY_DRIVER"],
  DRIVER_EN_ROUTE: ["DRIVER_ARRIVED", "CANCELLED", "CANCELLED_BY_DRIVER"],
  DRIVER_ARRIVED: [
    "PICKUP_CONFIRMED",
    "NO_SHOW_PASSENGER",
    "CANCELLED",
    "CANCELLED_BY_DRIVER",
  ],
  PICKUP_CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["ARRIVED_DESTINATION", "COMPLETED", "CANCELLED"],
  ARRIVED_DESTINATION: ["AWAITING_CASH_CONFIRMATION", "COMPLETED"],
  AWAITING_CASH_CONFIRMATION: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  CANCELLED_BY_PASSENGER: [],
  CANCELLED_BY_DRIVER: [],
  NO_SHOW_PASSENGER: [],
  NO_SHOW_DRIVER: [],
};

// Statuses only driver can set
const DRIVER_ONLY_STATUSES = [
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  "AWAITING_CASH_CONFIRMATION",
  "COMPLETED",
  "CANCELLED_BY_DRIVER",
  "NO_SHOW_PASSENGER",
];

// Statuses only customer can set
const CUSTOMER_ONLY_STATUSES = ["CANCELLED", "CANCELLED_BY_PASSENGER", "NO_SHOW_DRIVER"];

// Terminal statuses (no transitions allowed out)
const TERMINAL_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "NO_SHOW_PASSENGER",
  "NO_SHOW_DRIVER",
];

async function logStatusTransition(
  tripId: string,
  fromStatus: string,
  toStatus: string,
  changedByType: string,
  changedById?: string,
  note?: string
) {
  const id = `tsl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO trip_status_logs (id, "tripId", "fromStatus", "toStatus", "changedByType", "changedById", note, "createdAt")
    VALUES (${id}, ${tripId}, ${fromStatus}, ${toStatus}, ${changedByType}, ${changedById ?? null}, ${note ?? null}, NOW())
  `;
}

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

    const newStatus = result.data.status as string;

    // Determine who is acting
    const isDriver = trip.driverProfile.userId === user.userId;
    const isCustomer = trip.rideRequest.customerProfile.userId === user.userId;
    const isAdmin = user.role === "ADMIN";

    if (!isDriver && !isCustomer && !isAdmin) {
      return errorResponse("Not authorized to update this trip", 403);
    }

    // Terminal status check
    if (TERMINAL_STATUSES.includes(trip.status as string)) {
      return errorResponse(`Trip is already in terminal status: ${trip.status}`, 422);
    }

    // Role-based transition checks
    if (!isAdmin) {
      if (isDriver && CUSTOMER_ONLY_STATUSES.includes(newStatus)) {
        return errorResponse(
          "This status transition can only be performed by the passenger",
          403
        );
      }
      if (isCustomer && DRIVER_ONLY_STATUSES.includes(newStatus)) {
        return errorResponse("Passengers can only cancel a trip", 403);
      }
    }

    // Validate state machine
    const validNextStatuses = VALID_TRANSITIONS[trip.status as string] ?? [];
    if (!validNextStatuses.includes(newStatus)) {
      return errorResponse(
        `Invalid transition: ${trip.status} → ${newStatus}. Allowed: ${validNextStatuses.join(", ")}`,
        422
      );
    }

    const updateData: Record<string, unknown> = {};

    if (newStatus === "IN_PROGRESS") {
      updateData.startedAt = new Date();
    } else if (newStatus === "COMPLETED") {
      updateData.completedAt = new Date();

      // Create payment record if not already created
      const existingPayment = await prisma.payment.findUnique({ where: { tripId: trip.id } });
      if (!existingPayment) {
        const commission =
          Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
        const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
        await prisma.payment.create({
          data: {
            tripId: trip.id,
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

      // Update trip counts
      await prisma.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { totalTrips: { increment: 1 } },
      });
      await prisma.customerProfile.update({
        where: { id: trip.rideRequest.customerProfileId },
        data: { totalTrips: { increment: 1 } },
      });
    } else if (newStatus === "AWAITING_CASH_CONFIRMATION") {
      // Driver signals they arrived at destination and will confirm cash
      // Create a pending payment record so everything is ready
      const existingPayment = await prisma.payment.findUnique({ where: { tripId: trip.id } });
      if (!existingPayment) {
        const commission =
          Math.round(trip.lockedFare * trip.driverProfile.commissionRate * 100) / 100;
        const driverEarning = Math.round((trip.lockedFare - commission) * 100) / 100;
        await prisma.payment.create({
          data: {
            tripId: trip.id,
            amount: trip.lockedFare,
            commission,
            driverEarning,
            method: "CASH",
            status: "PENDING",
          },
        });
      }
    } else if (
      ["CANCELLED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER"].includes(newStatus)
    ) {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = user.userId;
      updateData.cancelReason = result.data.cancelReason || "Cancelled";
    } else if (newStatus === "NO_SHOW_PASSENGER") {
      updateData.cancelledAt = new Date();
      updateData.cancelReason = "Passenger no-show";
    } else if (newStatus === "NO_SHOW_DRIVER") {
      updateData.cancelledAt = new Date();
      updateData.cancelReason = "Driver no-show";
    }

    // Use raw SQL for new status enum values to avoid stale Prisma client enum issues
    const terminalNewStatuses = [
      "ARRIVED_DESTINATION",
      "AWAITING_CASH_CONFIRMATION",
      "CANCELLED_BY_PASSENGER",
      "CANCELLED_BY_DRIVER",
      "NO_SHOW_PASSENGER",
      "NO_SHOW_DRIVER",
    ];

    let updated;
    if (terminalNewStatuses.includes(newStatus)) {
      // Use executeRaw to set the new enum value, then fetch the updated record
      await prisma.$executeRaw`UPDATE trips SET status = ${newStatus}::"TripStatus", "updatedAt" = NOW() WHERE id = ${id}`;
      if (updateData.cancelledAt) {
        await prisma.$executeRaw`UPDATE trips SET "cancelledAt" = NOW(), "cancelledBy" = ${user.userId}, "cancelReason" = ${updateData.cancelReason as string ?? "Cancelled"} WHERE id = ${id}`;
      }
      updated = await prisma.trip.findUnique({
        where: { id },
        include: {
          driverProfile: {
            include: { user: { select: { name: true, avatarUrl: true } } },
          },
          payment: true,
        },
      });
    } else {
      updateData.status = newStatus;
      updated = await prisma.trip.update({
        where: { id },
        data: updateData,
        include: {
          driverProfile: {
            include: { user: { select: { name: true, avatarUrl: true } } },
          },
          payment: true,
        },
      });
    }

    // Log the status transition
    const changedByType = isAdmin ? "ADMIN" : isDriver ? "DRIVER" : "CUSTOMER";
    await logStatusTransition(
      id,
      trip.status as string,
      newStatus,
      changedByType,
      user.userId,
      result.data.cancelReason
    );

    // Broadcast status update
    emitToRoom(`trip:${id}`, "trip:status_update", updated);
    emitToRoom("admin:monitor", "trip:status_update", updated);

    const customerUserId = trip.rideRequest.customerProfile.userId;
    const driverUserId   = trip.driverProfile.user.id;
    const driverName     = trip.driverProfile.user.name ?? "Driver";

    // Notify the other party + persist to DB for recovery
    if (["CANCELLED", "CANCELLED_BY_DRIVER", "NO_SHOW_PASSENGER"].includes(newStatus) && isDriver) {
      emitToUser(customerUserId, "trip:cancelled", { tripId: id, cancelledBy: "driver", status: newStatus, reason: result.data.cancelReason });
      await Notif.tripCancelled(customerUserId, id, "driver", result.data.cancelReason);
    } else if (["CANCELLED", "CANCELLED_BY_PASSENGER", "NO_SHOW_DRIVER"].includes(newStatus) && isCustomer) {
      emitToUser(driverUserId, "trip:cancelled", { tripId: id, cancelledBy: "customer", status: newStatus, reason: result.data.cancelReason });
      await Notif.tripCancelled(driverUserId, id, "customer", result.data.cancelReason);
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
      emitToUser(customerUserId, "trip:completed", { tripId: id, lockedFare: trip.lockedFare });
      await Promise.all([
        Notif.tripCompleted(customerUserId, id, trip.lockedFare, false),
        Notif.tripCompleted(driverUserId, id, trip.lockedFare, true),
      ]);
    }

    return successResponse(updated, `Trip status updated to ${newStatus}`);
  } catch (error) {
    console.error("[TRIPS] Update status error:", error);
    return errorResponse("Failed to update trip status", 500);
  }
}
