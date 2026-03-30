import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

// GET /api/v1/trips/active — driver or customer's active trip
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER", "CUSTOMER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const activeStatuses = ["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PICKUP_CONFIRMED", "IN_PROGRESS"];

    let where: Record<string, unknown> = { status: { in: activeStatuses } };

    if (user.role === "DRIVER") {
      const driverProfile = await prisma.driverProfile.findUnique({ where: { userId: user.userId } });
      if (!driverProfile) return errorResponse("Driver profile not found", 404);
      where.driverProfileId = driverProfile.id;
    } else {
      const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: user.userId } });
      if (!customerProfile) return errorResponse("Customer profile not found", 404);
      where = {
        ...where,
        rideRequest: { customerProfileId: customerProfile.id },
      };
    }

    const trip = await prisma.trip.findFirst({
      where,
      include: {
        rideRequest: {
          include: {
            customerProfile: {
              include: { user: { select: { name: true, phone: true, avatarUrl: true } } },
            },
          },
        },
        driverProfile: {
          include: {
            user: { select: { name: true, phone: true, avatarUrl: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
        vehicle: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(trip, trip ? "Active trip found" : "No active trip");
  } catch (error) {
    console.error("[TRIPS/ACTIVE]", error);
    return errorResponse("Failed to fetch active trip", 500);
  }
}
