import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

// GET /api/v1/rides/active — customer's current active ride request
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["CUSTOMER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const profile = await prisma.customerProfile.findUnique({ where: { userId: user.userId } });
    if (!profile) return errorResponse("Profile not found", 404);

    const ride = await prisma.rideRequest.findFirst({
      where: {
        customerProfileId: profile.id,
        status: { in: ["PENDING", "MATCHING", "MATCHED"] },
      },
      include: {
        offers: {
          where: { status: "PENDING" },
          include: {
            driverProfile: {
              include: {
                user: { select: { name: true, avatarUrl: true } },
                vehicles: { where: { isActive: true }, take: 1 },
              },
            },
          },
          orderBy: { fareAmount: "asc" },
        },
        trip: {
          include: {
            driverProfile: {
              include: {
                user: { select: { name: true, phone: true, avatarUrl: true } },
                vehicles: { where: { isActive: true }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(ride, ride ? "Active ride found" : "No active ride");
  } catch (error) {
    console.error("[RIDES/ACTIVE]", error);
    return errorResponse("Failed to fetch active ride", 500);
  }
}
