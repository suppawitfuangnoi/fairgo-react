import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { createRideOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";

const MAX_NEGOTIATION_ROUNDS = 5;
const COUNTER_OFFER_EXPIRY_MS = 90 * 1000; // 90 seconds to respond to counter-offers

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

    // Check ride request exists and is PENDING or NEGOTIATING
    const rideRequest = await prisma.rideRequest.findUnique({
      where: { id: result.data.rideRequestId },
      include: { customerProfile: true },
    });
    if (!rideRequest) return errorResponse("Ride request not found", 404);
    if (!["PENDING", "MATCHING", "NEGOTIATING"].includes(rideRequest.status as string)) {
      return errorResponse("Ride request is no longer available", 422);
    }

    // Check if driver has a pending DRIVER-proposed offer (can't submit twice)
    // Note: customer counter-offers also reference driverProfileId, so we filter by proposedBy
    const existingPendingOffer = await prisma.rideOffer.findFirst({
      where: {
        rideRequestId: result.data.rideRequestId,
        driverProfileId: driverProfile.id,
        status: "PENDING",
        proposedBy: "DRIVER",
      },
    });
    if (existingPendingOffer) {
      return errorResponse("You already have a pending offer for this ride", 409);
    }

    // If countering, find the customer's counter-offer
    let roundNumber = 1;
    let parentOfferId: string | undefined;
    let expiresAt: Date | undefined;

    if (result.data.parentOfferId) {
      // Driver is countering a customer's counter-offer
      const parentOffer = await prisma.rideOffer.findUnique({
        where: { id: result.data.parentOfferId },
      });
      if (!parentOffer || parentOffer.rideRequestId !== result.data.rideRequestId) {
        return errorResponse("Invalid parent offer", 422);
      }
      if (parentOffer.proposedBy !== "CUSTOMER") {
        return errorResponse("Can only counter a customer counter-offer", 422);
      }
      if (parentOffer.status !== "PENDING") {
        return errorResponse("This counter-offer has already been responded to", 422);
      }

      roundNumber = parentOffer.roundNumber + 1;
      parentOfferId = parentOffer.id;
      expiresAt = new Date(Date.now() + COUNTER_OFFER_EXPIRY_MS);

      if (roundNumber > MAX_NEGOTIATION_ROUNDS) {
        return errorResponse(`Maximum negotiation rounds (${MAX_NEGOTIATION_ROUNDS}) reached`, 422);
      }

      // Mark parent offer as COUNTERED (use raw SQL to bypass Prisma enum validation for new enum values)
      await prisma.$executeRaw`UPDATE ride_offers SET status = 'COUNTERED', "respondedAt" = NOW() WHERE id = ${parentOffer.id}`;
    }

    const offer = await prisma.rideOffer.create({
      data: {
        rideRequestId: result.data.rideRequestId,
        driverProfileId: driverProfile.id,
        fareAmount: result.data.fareAmount,
        estimatedPickupMinutes: result.data.estimatedPickupMinutes,
        message: result.data.message,
        proposedBy: "DRIVER",
        roundNumber,
        parentOfferId,
        expiresAt,
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

    // Update ride request status (use raw SQL for new enum values)
    if (roundNumber > 1) {
      // NEGOTIATING is a new enum value - use raw SQL to bypass stale Prisma client enum validation
      await prisma.$executeRaw`UPDATE ride_requests SET status = 'NEGOTIATING', "updatedAt" = NOW() WHERE id = ${result.data.rideRequestId}`;
    } else {
      await prisma.rideRequest.update({
        where: { id: result.data.rideRequestId },
        data: { status: "MATCHING" },
      });
    }

    // Notify customer
    emitToUser(rideRequest.customerProfile.userId, "offer:new", {
      ...offer,
      roundNumber,
      isCounter: roundNumber > 1,
    });

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
