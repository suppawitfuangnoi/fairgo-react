import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const status = request.nextUrl.searchParams.get("status");

    const where: Record<string, unknown> = {};

    if (user.role === "CUSTOMER") {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId: user.userId },
      });
      if (!profile) return errorResponse("Profile not found", 404);
      where.rideRequest = { customerProfileId: profile.id };
    } else if (user.role === "DRIVER") {
      const profile = await prisma.driverProfile.findUnique({
        where: { userId: user.userId },
      });
      if (!profile) return errorResponse("Profile not found", 404);
      where.driverProfileId = profile.id;
    }

    if (status) where.status = status;

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          rideRequest: {
            include: {
              customerProfile: {
                include: { user: { select: { name: true, avatarUrl: true } } },
              },
            },
          },
          driverProfile: {
            include: {
              user: { select: { name: true, avatarUrl: true, phone: true } },
              vehicles: { where: { isActive: true }, take: 1 },
            },
          },
          vehicle: true,
          payment: true,
          ratings: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);

    return successResponse({
      trips,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[TRIPS] List error:", error);
    return errorResponse("Failed to list trips", 500);
  }
}
