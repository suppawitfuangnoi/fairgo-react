/**
 * GET /api/v1/admin/monitoring
 *
 * Live operations overview for the admin console.
 * Returns:
 *   - activeTrips:     trips in any non-terminal status
 *   - staleTrips:      active trips with no status update in the last 30 minutes
 *   - onlineDrivers:   drivers with isOnline=true + last heartbeat
 *   - unresolvedDisputes: open/in-progress support tickets with payment dispute flag
 *   - staleNegotiations: ride requests in PENDING status older than 10 minutes
 *   - summary stats
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

const ACTIVE_TRIP_STATUSES = [
  "DRIVER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  "AWAITING_CASH_CONFIRMATION",
];

const STALE_TRIP_MINUTES = 30;
const STALE_NEGOTIATION_MINUTES = 10;

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const now = new Date();
    const staleThreshold   = new Date(now.getTime() - STALE_TRIP_MINUTES * 60 * 1000);
    const staleNegThreshold = new Date(now.getTime() - STALE_NEGOTIATION_MINUTES * 60 * 1000);

    const [
      activeTrips,
      onlineDrivers,
      unresolvedDisputes,
      staleNegotiations,
    ] = await Promise.all([
      // Active trips with passenger + driver info
      prisma.trip.findMany({
        where: { status: { in: ACTIVE_TRIP_STATUSES as any } },
        include: {
          rideRequest: {
            include: {
              customerProfile: { include: { user: { select: { id: true, name: true, phone: true } } } },
            },
          },
          driverProfile: { include: { user: { select: { id: true, name: true, phone: true } } } },
          payment: { select: { amount: true, disputeFlag: true } },
        },
        orderBy: { updatedAt: "asc" }, // oldest first (most likely stale)
      }),

      // Online drivers with last heartbeat
      prisma.driverProfile.findMany({
        where: { isOnline: true },
        include: {
          user: { select: { id: true, name: true, phone: true, status: true } },
          vehicles: { where: { isActive: true }, take: 1 },
        },
        orderBy: { lastSeenAt: "asc" },
      }),

      // Unresolved payment disputes (open/in-progress tickets linked to trips with disputeFlag)
      prisma.supportTicket.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] }, tripId: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),

      // Stale negotiations: PENDING ride requests older than threshold
      prisma.rideRequest.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: staleNegThreshold },
        },
        include: {
          customerProfile: { include: { user: { select: { name: true, phone: true } } } },
          offers: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);

    // Classify stale trips (updatedAt older than staleThreshold)
    const staleTrips = activeTrips.filter((t) => new Date(t.updatedAt) < staleThreshold);

    // Shape active trips for the UI
    const shapedActiveTrips = activeTrips.map((t) => ({
      id: t.id,
      status: t.status,
      passenger: t.rideRequest?.customerProfile?.user?.name ?? "Unknown",
      passengerPhone: t.rideRequest?.customerProfile?.user?.phone ?? "",
      driver: t.driverProfile?.user?.name ?? "Unknown",
      driverPhone: t.driverProfile?.user?.phone ?? "",
      pickup: t.pickupAddress,
      dropoff: t.dropoffAddress,
      fare: t.lockedFare,
      hasDispute: t.payment?.disputeFlag ?? false,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
      isStale: new Date(t.updatedAt) < staleThreshold,
      minutesSinceUpdate: Math.floor((now.getTime() - new Date(t.updatedAt).getTime()) / 60000),
    }));

    const shapedOnlineDrivers = onlineDrivers.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.user.name,
      phone: d.user.phone,
      userStatus: d.user.status,
      vehicleType: d.vehicles[0]?.type ?? null,
      vehiclePlate: d.vehicles[0]?.plateNumber ?? null,
      lat: d.currentLatitude,
      lng: d.currentLongitude,
      lastSeenAt: d.lastSeenAt,
      isFlagged: d.isFlagged,
      minutesSinceHeartbeat: d.lastSeenAt
        ? Math.floor((now.getTime() - new Date(d.lastSeenAt).getTime()) / 60000)
        : null,
    }));

    const shapedStaleNegotiations = staleNegotiations.map((r) => ({
      id: r.id,
      passenger: r.customerProfile?.user?.name ?? "Unknown",
      passengerPhone: r.customerProfile?.user?.phone ?? "",
      vehicleType: r.vehicleType,
      pickup: r.pickupAddress,
      dropoff: r.dropoffAddress,
      fareOffer: r.fareOffer,
      offerCount: r.offers?.length ?? 0,
      createdAt: r.createdAt,
      minutesOld: Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 60000),
    }));

    return successResponse({
      summary: {
        activeTrips: activeTrips.length,
        staleTrips: staleTrips.length,
        onlineDrivers: onlineDrivers.length,
        unresolvedDisputes: unresolvedDisputes.length,
        staleNegotiations: staleNegotiations.length,
      },
      activeTrips: shapedActiveTrips,
      onlineDrivers: shapedOnlineDrivers,
      unresolvedDisputes,
      staleNegotiations: shapedStaleNegotiations,
    });
  } catch (error) {
    console.error("[ADMIN] Monitoring error:", error);
    return errorResponse("Failed to fetch monitoring data", 500);
  }
}
