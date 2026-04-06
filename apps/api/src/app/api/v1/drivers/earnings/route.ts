import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

/**
 * GET /api/v1/drivers/earnings
 * Returns the driver's earnings summary and trip history.
 * Query params:
 *   period: "today" | "week" | "month" | "all" (default: "week")
 *   page: number (default: 1)
 *   limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!driverProfile) return errorResponse("Driver profile not found", 404);

    const period = request.nextUrl.searchParams.get("period") ?? "week";
    const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20");

    // Calculate date range
    const now = new Date();
    let startDate: Date | undefined;
    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === "month") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }

    const where: Record<string, unknown> = {
      driverProfileId: driverProfile.id,
      status: "COMPLETED",
    };
    if (startDate) {
      where.completedAt = { gte: startDate };
    }

    // Get trips with payments
    const [trips, totalCompleted] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          payment: true,
          rideRequest: {
            include: {
              customerProfile: {
                include: { user: { select: { name: true, avatarUrl: true } } },
              },
            },
          },
        },
        orderBy: { completedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);

    // Calculate totals
    const totalEarnings = trips.reduce((sum, t) => sum + (t.payment?.driverEarning ?? 0), 0);
    const totalFare = trips.reduce((sum, t) => sum + (t.payment?.amount ?? 0), 0);
    const totalCommission = trips.reduce((sum, t) => sum + (t.payment?.commission ?? 0), 0);

    // All-time stats
    const allTimeStats = await prisma.trip.aggregate({
      where: { driverProfileId: driverProfile.id, status: "COMPLETED" },
      _count: { id: true },
    });

    // Today's quick summary
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTrips = await prisma.trip.findMany({
      where: {
        driverProfileId: driverProfile.id,
        status: "COMPLETED",
        completedAt: { gte: todayStart },
      },
      include: { payment: true },
    });
    const todayEarnings = todayTrips.reduce((sum, t) => sum + (t.payment?.driverEarning ?? 0), 0);

    return successResponse({
      summary: {
        period,
        totalTrips: totalCompleted,
        totalFare: Math.round(totalFare * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        averageEarningsPerTrip:
          totalCompleted > 0
            ? Math.round((totalEarnings / totalCompleted) * 100) / 100
            : 0,
      },
      today: {
        trips: todayTrips.length,
        earnings: Math.round(todayEarnings * 100) / 100,
      },
      allTime: {
        trips: allTimeStats._count.id,
        rating: driverProfile.averageRating,
      },
      trips: trips.map((t) => ({
        id: t.id,
        completedAt: t.completedAt,
        pickupAddress: t.pickupAddress,
        dropoffAddress: t.dropoffAddress,
        lockedFare: t.lockedFare,
        driverEarning: t.payment?.driverEarning ?? 0,
        commission: t.payment?.commission ?? 0,
        customerName: t.rideRequest.customerProfile.user.name,
      })),
      meta: {
        page,
        limit,
        total: totalCompleted,
        totalPages: Math.ceil(totalCompleted / limit),
      },
    });
  } catch (error) {
    console.error("[EARNINGS] Error:", error);
    return errorResponse("Failed to get earnings", 500);
  }
}
