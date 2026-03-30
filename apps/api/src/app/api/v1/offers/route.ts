import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { createRideOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, createRideOfferSchema);
    if ("error" in result) return result.error;

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
      include: { vehicles: { where: { isActive: true }, take: 1 } },
    });
    if (!driverProfile) return errorResponse("Driver profile not found", 404);
    if (!driverProfile.isVerified) {
      return errorResponse("Driver must be verified to submit offers", 403);
    }

    // Check ride request exists and is PENDING
    const rideRequest = await prisma.rideRequest.findUnique({
      where: { id: result.data.rideRequestId },
    });
    if (!rideRequest) return errorResponse("Ride request not found", 404);
    if (rideRequest.status !== "PENDING") {
      return errorResponse("Ride request is no longer available", 422);
    }

    // Check if driver already submitted an offer
    const existingOffer = await prisma.rideOffer.findUnique({
      where: {
        rideRequestId_driverProfileId: {
          rideRequestId: result.data.rideRequestId,
          driverProfileId: driverProfile.id,
        },
      },
    });
    if (existingOffer) {
      return errorResponse("You already submitted an offer for this ride", 409);
    }

    const offer = await prisma.rideOffer.create({
      data: {
        rideRequestId: result.data.rideRequestId,
        driverProfileId: driverProfile.id,
        fareAmount: result.data.fareAmount,
        estimatedPickupMinutes: result.data.estimatedPickupMinutes,
        message: result.data.message,
      },
      include: {
        driverProfile: {
          include: {
            user: { select: { name: true, avatarUrl: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });

    // Update ride request status to MATCHING
    const updatedRide = await prisma.rideRequest.update({
      where: { id: result.data.rideRequestId },
      include: { customerProfile: true },
      data: { status: "MATCHING" },
    });

    // Notify customer in real-time
    emitToUser(updatedRide.customerProfile.userId, "offer:new", offer);

    return successResponse(offer, "Offer submitted successfully", 201);
  } catch (error) {
    console.error("[OFFERS] Create error:", error);
    return errorResponse("Failed to submit offer", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!driverProfile) return errorResponse("Driver profile not found", 404);

    const offers = await prisma.rideOffer.findMany({
      where: { driverProfileId: driverProfile.id },
      include: {
        rideRequest: {
          include: {
            customerProfile: {
              include: { user: { select: { name: true, avatarUrl: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse(offers);
  } catch (error) {
    console.error("[OFFERS] List error:", error);
    return errorResponse("Failed to list offers", 500);
  }
}
