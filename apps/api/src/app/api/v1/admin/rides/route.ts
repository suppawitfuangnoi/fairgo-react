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
    const vehicleType = request.nextUrl.searchParams.get("vehicleType");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (vehicleType) where.vehicleType = vehicleType;

    const [rides, total] = await Promise.all([
      prisma.rideRequest.findMany({
        where,
        include: {
          customerProfile: {
            include: {
              user: { select: { name: true, phone: true, avatarUrl: true } },
            },
          },
          offers: {
            include: {
              driverProfile: {
                include: { user: { select: { name: true } } },
              },
            },
          },
          trip: {
            include: {
              driverProfile: {
                include: { user: { select: { name: true } } },
              },
              payment: true,
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
    console.error("[ADMIN] List rides error:", error);
    return errorResponse("Failed to list ride requests", 500);
  }
}
