import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const status = request.nextUrl.searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [rawTrips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          rideRequest: {
            include: {
              customerProfile: {
                include: {
                  user: { select: { name: true } },
                },
              },
            },
          },
          driverProfile: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);

    // Reshape to flat structure for front-end
    const trips = rawTrips.map((t) => ({
      id: t.id,
      user: { name: t.rideRequest?.customerProfile?.user?.name ?? "Unknown" },
      driver: { name: t.driverProfile?.user?.name ?? "Unknown" },
      pickup: t.pickupAddress,
      dropoff: t.dropoffAddress,
      fare: t.lockedFare,
      status: t.status,
      distance: t.actualDistance,
      duration: t.actualDuration,
      createdAt: t.createdAt,
    }));

    return successResponse({
      trips,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] List trips error:", error);
    return errorResponse("Failed to list trips", 500);
  }
}
