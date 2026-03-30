import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;

    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      include: {
        customerProfile: {
          include: {
            user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
          },
        },
        offers: {
          include: {
            driverProfile: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true } },
                vehicles: { where: { isActive: true }, take: 1 },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        trip: true,
      },
    });

    if (!ride) return errorResponse("Ride request not found", 404);

    return successResponse(ride);
  } catch (error) {
    console.error("[RIDES] Get error:", error);
    return errorResponse("Failed to get ride request", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id } = await params;

    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      include: { customerProfile: true },
    });

    if (!ride) return errorResponse("Ride request not found", 404);

    if (user.role === "CUSTOMER") {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId: user.userId },
      });
      if (ride.customerProfileId !== profile?.id) {
        return errorResponse("Not authorized to cancel this ride", 403);
      }
    }

    if (!["PENDING", "MATCHING"].includes(ride.status)) {
      return errorResponse("Can only cancel pending or matching rides", 422);
    }

    const updated = await prisma.rideRequest.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: "Cancelled by user",
      },
    });

    return successResponse(updated, "Ride request cancelled");
  } catch (error) {
    console.error("[RIDES] Cancel error:", error);
    return errorResponse("Failed to cancel ride request", 500);
  }
}
