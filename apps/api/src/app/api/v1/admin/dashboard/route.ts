import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalDrivers,
      activeDrivers,
      pendingVerifications,
      totalTrips,
      activeTrips,
      completedTrips,
      cancelledTrips,
      recentUsers,
      recentTrips,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
      prisma.user.count({ where: { role: "DRIVER", deletedAt: null } }),
      prisma.driverProfile.count({ where: { isOnline: true } }),
      prisma.driverProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.trip.count(),
      prisma.trip.count({
        where: {
          status: { in: ["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "IN_PROGRESS"] },
        },
      }),
      prisma.trip.count({ where: { status: "COMPLETED" } }),
      prisma.trip.count({ where: { status: "CANCELLED" } }),
      prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
      }),
      prisma.trip.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        include: {
          rideRequest: {
            include: {
              customerProfile: {
                include: { user: { select: { name: true } } },
              },
            },
          },
          driverProfile: {
            include: { user: { select: { name: true } } },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED" },
      }),
    ]);

    // Calculate daily trip counts for the last 7 days
    const dailyTrips = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const count = await prisma.trip.count({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dailyTrips.push({
        day: dayNames[dayStart.getDay()],
        date: dayStart.toISOString().split("T")[0],
        trips: count,
      });
    }

    return successResponse({
      stats: {
        totalUsers,
        totalDrivers,
        activeDrivers,
        pendingVerifications,
        totalTrips,
        activeTrips,
        completedTrips,
        cancelledTrips,
        recentUsers,
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      dailyTrips,
      recentActivity: recentTrips,
    });
  } catch (error) {
    console.error("[ADMIN] Dashboard error:", error);
    return errorResponse("Failed to load dashboard", 500);
  }
}
