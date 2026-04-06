import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { requireActiveRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody, validateQuery } from "@/middleware/validate";
import { createRideRequestSchema, ridesQuerySchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom } from "@/lib/socket";
import { calculateDistance, estimateDuration } from "@/lib/pricing";
import { Notif } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireActiveRole(request, ["CUSTOMER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, createRideRequestSchema);
    if ("error" in result) return result.error;

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!profile) return errorResponse("Customer profile not found", 404);

    // Validate fare range
    if (result.data.fareMin > result.data.fareMax) {
      return errorResponse("Minimum fare cannot exceed maximum fare", 422);
    }
    if (result.data.fareOffer < result.data.fareMin || result.data.fareOffer > result.data.fareMax) {
      return errorResponse("Fare offer must be within min-max range", 422);
    }

    // Calculate trip distance and duration to store with the ride
    const straightLineKm = calculateDistance(
      result.data.pickupLatitude,
      result.data.pickupLongitude,
      result.data.dropoffLatitude,
      result.data.dropoffLongitude
    );
    const estimatedDistanceKm = straightLineKm * 1.3; // 30% road-distance adjustment
    const estimatedDurationMin = estimateDuration(estimatedDistanceKm);

    const rideRequest = await prisma.rideRequest.create({
      data: {
        customerProfileId: profile.id,
        ...result.data,
        estimatedDistance: estimatedDistanceKm,
        estimatedDuration: estimatedDurationMin,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
      include: {
        customerProfile: {
          include: { user: { select: { name: true, phone: true, avatarUrl: true } } },
        },
      },
    });

    // Broadcast to nearby drivers (zone-based) + admin monitor
    const zone = `zone:${Math.floor(rideRequest.pickupLatitude * 10)}:${Math.floor(rideRequest.pickupLongitude * 10)}`;
    emitToRoom(zone, "ride:new_request", rideRequest);
    emitToRoom("admin:monitor", "ride:new_request", rideRequest);

    // Persist notification for all online/verified drivers in zone (best-effort)
    // We notify online drivers who are in the DB so they recover after reconnect
    const onlineDrivers = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        isVerified: true,
        // crude zone filter — within ~10 km (1 degree ≈ 111 km)
        currentLatitude: { gte: rideRequest.pickupLatitude - 0.09, lte: rideRequest.pickupLatitude + 0.09 },
        currentLongitude: { gte: rideRequest.pickupLongitude - 0.09, lte: rideRequest.pickupLongitude + 0.09 },
      },
      select: { userId: true },
    });

    await Promise.all(
      onlineDrivers.map((d) =>
        Notif.newRideRequest(d.userId, {
          id: rideRequest.id,
          pickupAddress: rideRequest.pickupAddress,
          dropoffAddress: rideRequest.dropoffAddress,
          fareMin: rideRequest.fareMin,
          fareMax: rideRequest.fareMax,
          vehicleType: rideRequest.vehicleType,
        })
      )
    );

    return successResponse(rideRequest, "Ride request created", 201);
  } catch (error) {
    console.error("[RIDES] Create error:", error);
    return errorResponse("Failed to create ride request", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["CUSTOMER", "DRIVER", "ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    // Validate query params — prevents SQL injection via Prisma, enforces max limit
    const queryResult = validateQuery(request, ridesQuerySchema);
    if ("error" in queryResult) return queryResult.error;
    const { page, limit, status, vehicleType } = queryResult.data;

    const where: Record<string, unknown> = {};

    if (user.role === "CUSTOMER") {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId: user.userId },
      });
      if (!profile) return errorResponse("Profile not found", 404);
      where.customerProfileId = profile.id;
    }

    if (status) where.status = status;
    if (vehicleType) where.vehicleType = vehicleType;

    // For drivers, only show PENDING requests
    if (user.role === "DRIVER") {
      where.status = "PENDING";
    }

    const [rides, total] = await Promise.all([
      prisma.rideRequest.findMany({
        where,
        include: {
          customerProfile: {
            include: {
              user: { select: { name: true, avatarUrl: true, id: true } },
            },
          },
          offers: {
            include: {
              driverProfile: {
                include: {
                  user: { select: { name: true, avatarUrl: true } },
                  vehicles: { where: { isActive: true }, take: 1 },
                },
              },
            },
          },
          _count: { select: { offers: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: ((page ?? 1) - 1) * (limit ?? 20),
        take: limit ?? 20,
      }),
      prisma.rideRequest.count({ where }),
    ]);

    return successResponse({
      rides,
      meta: { page: page ?? 1, limit: limit ?? 20, total, totalPages: Math.ceil(total / (limit ?? 20)) },
    });
  } catch (error) {
    console.error("[RIDES] List error:", error);
    return errorResponse("Failed to list ride requests", 500);
  }
}
