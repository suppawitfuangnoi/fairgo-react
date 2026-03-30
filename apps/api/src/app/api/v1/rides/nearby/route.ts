import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { calculateDistance } from "@/lib/pricing";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const lat = parseFloat(request.nextUrl.searchParams.get("latitude") || "0");
    const lng = parseFloat(request.nextUrl.searchParams.get("longitude") || "0");
    const radiusKm = parseFloat(request.nextUrl.searchParams.get("radius") || "5");
    const vehicleType = request.nextUrl.searchParams.get("vehicleType");

    if (lat === 0 && lng === 0) {
      // Use driver's stored location
      const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId: user.userId },
      });
      if (!driverProfile?.currentLatitude || !driverProfile?.currentLongitude) {
        return errorResponse("Location not available. Please update your location.", 422);
      }
    }

    const where: Record<string, unknown> = {
      status: "PENDING",
      expiresAt: { gt: new Date() },
    };

    if (vehicleType) where.vehicleType = vehicleType;

    const rides = await prisma.rideRequest.findMany({
      where,
      include: {
        customerProfile: {
          include: {
            user: { select: { name: true, avatarUrl: true } },
          },
        },
        _count: { select: { offers: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Filter by distance (post-query since Prisma doesn't support geo queries natively)
    const nearbyRides = rides
      .map((ride) => {
        const distance = calculateDistance(
          lat || 13.7563, // Default to Bangkok center
          lng || 100.5018,
          ride.pickupLatitude,
          ride.pickupLongitude
        );
        return { ...ride, distanceFromDriver: Math.round(distance * 10) / 10 };
      })
      .filter((ride) => ride.distanceFromDriver <= radiusKm)
      .sort((a, b) => a.distanceFromDriver - b.distanceFromDriver);

    return successResponse(nearbyRides);
  } catch (error) {
    console.error("[RIDES] Nearby error:", error);
    return errorResponse("Failed to get nearby rides", 500);
  }
}
