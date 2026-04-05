import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/v1/admin/drivers — list drivers with verification status
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const status = request.nextUrl.searchParams.get("status"); // PENDING, APPROVED, REJECTED
    const search = request.nextUrl.searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (status) where.verificationStatus = status;

    const userWhere: Record<string, unknown> = { role: "DRIVER", deletedAt: null };
    if (search) {
      userWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rawDrivers, total] = await Promise.all([
      prisma.driverProfile.findMany({
        where: { ...where, user: userWhere },
        include: {
          user: { select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true } },
          vehicles: { where: { isActive: true }, take: 1 },
          _count: { select: { trips: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.driverProfile.count({ where: { ...where, user: userWhere } }),
    ]);

    // Reshape to flat structure for front-end
    const drivers = rawDrivers.map((d) => ({
      id: d.id,
      userId: d.user.id,
      name: d.user.name ?? "Unknown",
      phone: d.user.phone,
      email: d.user.email,
      vehicleType: d.vehicles[0]?.type ?? "TAXI",
      vehiclePlate: d.vehicles[0]?.plateNumber ?? "-",
      status: d.verificationStatus,
      rating: d.averageRating,
      trips: d._count.trips,
      isVerified: d.isVerified,
      isOnline: d.isOnline,
      createdAt: d.createdAt,
    }));

    return successResponse({
      drivers,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] List drivers error:", error);
    return errorResponse("Failed to list drivers", 500);
  }
}
