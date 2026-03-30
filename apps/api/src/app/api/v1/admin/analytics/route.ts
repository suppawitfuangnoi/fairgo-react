import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/v1/admin/analytics — platform analytics
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const period = request.nextUrl.searchParams.get("period") || "7d";
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "24h": startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case "30d": startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case "90d": startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7d
    }

    const [
      totalTrips,
      completedTrips,
      cancelledTrips,
      totalRevenue,
      newUsers,
      newDrivers,
      totalRatings,
      vehicleTypeDist,
      paymentMethodDist,
      tripsByDay,
      topZones,
    ] = await Promise.all([
      prisma.trip.count({ where: { createdAt: { gte: startDate } } }),
      prisma.trip.count({ where: { status: "COMPLETED", createdAt: { gte: startDate } } }),
      prisma.trip.count({ where: { status: "CANCELLED", createdAt: { gte: startDate } } }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: startDate } },
        _sum: { amount: true, commission: true, driverEarning: true },
      }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: startDate }, deletedAt: null } }),
      prisma.user.count({ where: { role: "DRIVER", createdAt: { gte: startDate }, deletedAt: null } }),
      prisma.rating.aggregate({ _avg: { score: true }, _count: { id: true } }),
      prisma.rideRequest.groupBy({
        by: ["vehicleType"],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { status: "COMPLETED", createdAt: { gte: startDate } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Trips grouped by day (last 7/30/90 days)
      prisma.$queryRaw<{ day: string; count: bigint; gmv: number }[]>`
        SELECT
          DATE_TRUNC('day', t."createdAt")::date::text as day,
          COUNT(t.id) as count,
          COALESCE(SUM(p.amount), 0) as gmv
        FROM trips t
        LEFT JOIN payments p ON p."tripId" = t.id AND p.status = 'COMPLETED'
        WHERE t."createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', t."createdAt")
        ORDER BY day ASC
      `,
      // Top pickup zones
      prisma.$queryRaw<{ zone: string; count: bigint }[]>`
        SELECT
          SPLIT_PART("pickupAddress", ',', 1) as zone,
          COUNT(*) as count
        FROM ride_requests
        WHERE "createdAt" >= ${startDate}
        GROUP BY zone
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    const completionRate = totalTrips > 0
      ? Math.round((completedTrips / totalTrips) * 100)
      : 0;

    return successResponse({
      period,
      overview: {
        totalTrips,
        completedTrips,
        cancelledTrips,
        completionRate,
        newUsers,
        newDrivers,
        avgRating: totalRatings._avg.score ? Math.round(totalRatings._avg.score * 100) / 100 : 0,
        totalRatings: totalRatings._count.id,
      },
      revenue: {
        totalGMV: totalRevenue._sum.amount ?? 0,
        totalCommission: totalRevenue._sum.commission ?? 0,
        totalDriverEarnings: totalRevenue._sum.driverEarning ?? 0,
      },
      vehicleTypes: vehicleTypeDist.map((v) => ({
        type: v.vehicleType,
        count: v._count.id,
      })),
      paymentMethods: paymentMethodDist.map((p) => ({
        method: p.method,
        count: p._count.id,
        amount: p._sum.amount ?? 0,
      })),
      tripsByDay: tripsByDay.map((d) => ({
        day: d.day,
        count: Number(d.count),
        gmv: Number(d.gmv),
      })),
      topZones: topZones.map((z) => ({
        zone: z.zone,
        count: Number(z.count),
      })),
    });
  } catch (error) {
    console.error("[ADMIN] Analytics error:", error);
    return errorResponse("Failed to get analytics", 500);
  }
}
