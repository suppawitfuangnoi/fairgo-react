import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        rideRequest: {
          include: {
            customerProfile: {
              include: { user: { select: { id: true, name: true, phone: true, avatarUrl: true } } },
            },
          },
        },
        driverProfile: {
          include: {
            user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
        vehicle: true,
        payment: true,
        ratings: true,
        tripLocations: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });

    if (!trip) return errorResponse("Trip not found", 404);

    return successResponse(trip);
  } catch (error) {
    console.error("[TRIPS] Get error:", error);
    return errorResponse("Failed to get trip", 500);
  }
}
