import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { createRideRequestSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToRoom } from "@/lib/socket";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["CUSTOMER"]);
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

    const rideRequest = await prisma.rideRequest.create({
      data: {
        customerProfileId: profile.id,
        ...result.data,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
      include: {
        customerProfile: {
          include: { user: { select: { name: true, phone: true, avatarUrl: true } } },
        },
      },
    });

    // Broadcast to nearby drivers (zone-based) + all online drivers room
    const zone = `zone:${Math.floor(rideRequest.pickupLatitude * 10)}:${Math.floor(rideRequest.pickupLongitude * 10)}`;
    emitToRoom(zone, "ride:new_request", rideRequest);
    emitToRoom("admin:monitor", "ride:new_request", rideRequest);

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

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const status = request.nextUrl.searchParams.get("status");
    const vehicleType = request.nextUrl.searchParams.get("vehicleType");

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
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rideRequest.count({ where }),
    ]);

    return successResponse({
      rides,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[RIDES] List error:", error);
    return errorResponse("Failed to list ride requests", 500);
  }
}
