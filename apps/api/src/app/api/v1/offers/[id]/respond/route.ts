import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { respondToOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";

const MAX_NEGOTIATION_ROUNDS = 5;
const COUNTER_OFFER_EXPIRY_MS = 90 * 1000; // 90 seconds

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["CUSTOMER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id: offerId } = await params;
    const result = await validateBody(request, respondToOfferSchema);
    if ("error" in result) return result.error;

    const { action, counterFareAmount, message } = result.data;

    const offer = await prisma.rideOffer.findUnique({
      where: { id: offerId },
      include: {
        rideRequest: { include: { customerProfile: true } },
        driverProfile: {
          include: {
            user: { select: { id: true, name: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });

    if (!offer) return errorResponse("Offer not found", 404);

    // Verify the customer owns this ride request
    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.userId },
    });
    if (offer.rideRequest.customerProfileId !== profile?.id) {
      return errorResponse("Not authorized to respond to this offer", 403);
    }

    if (offer.status !== "PENDING") {
      return errorResponse("This offer has already been responded to", 422);
    }

    // Check expiry for counter-offers
    if (offer.expiresAt && new Date() > offer.expiresAt) {
      await prisma.rideOffer.update({
        where: { id: offerId },
        data: { status: "EXPIRED" },
      });
      return errorResponse("This offer has expired", 410);
    }

    if (action === "REJECT") {
      await prisma.rideOffer.update({
        where: { id: offerId },
        data: { status: "REJECTED", respondedAt: new Date() },
      });
      emitToUser(offer.driverProfile.user.id, "offer:rejected", { offerId });
      return successResponse(null, "Offer rejected");
    }

    if (action === "COUNTER") {
      // Customer counter-offers with a new fare
      if (!counterFareAmount || counterFareAmount <= 0) {
        return errorResponse("Counter fare amount is required and must be positive", 422);
      }

      const newRound = offer.roundNumber + 1;
      if (newRound > MAX_NEGOTIATION_ROUNDS) {
        return errorResponse(`Maximum negotiation rounds (${MAX_NEGOTIATION_ROUNDS}) reached`, 422);
      }

      // Check fare is within original range
      const rideRequest = offer.rideRequest;
      if (counterFareAmount < rideRequest.fareMin || counterFareAmount > rideRequest.fareMax) {
        return errorResponse(
          `Counter fare must be between ฿${rideRequest.fareMin} and ฿${rideRequest.fareMax}`,
          422
        );
      }

      // Mark driver's offer as COUNTERED (use raw SQL to bypass Prisma enum validation for new enum values)
      await prisma.$executeRaw`UPDATE ride_offers SET status = 'COUNTERED', "respondedAt" = NOW() WHERE id = ${offerId}`;

      // Create customer's counter-offer (proposedBy is a plain string field, no enum issue)
      const counterOffer = await prisma.rideOffer.create({
        data: {
          rideRequestId: offer.rideRequestId,
          driverProfileId: offer.driverProfileId,
          fareAmount: counterFareAmount,
          message: message || null,
          proposedBy: "CUSTOMER",
          roundNumber: newRound,
          parentOfferId: offerId,
          expiresAt: new Date(Date.now() + COUNTER_OFFER_EXPIRY_MS),
        },
      });

      // Update ride status to NEGOTIATING (use raw SQL to bypass Prisma enum validation)
      await prisma.$executeRaw`UPDATE ride_requests SET status = 'NEGOTIATING', "updatedAt" = NOW() WHERE id = ${offer.rideRequestId}`;

      // Notify driver of counter-offer
      emitToUser(offer.driverProfile.user.id, "offer:counter", {
        offerId: counterOffer.id,
        rideRequestId: offer.rideRequestId,
        fareAmount: counterFareAmount,
        roundNumber: newRound,
        message: message || null,
        expiresAt: counterOffer.expiresAt,
      });

      return successResponse(counterOffer, "Counter-offer sent to driver");
    }

    // ACCEPT the offer - create a trip with locked fare
    const trip = await prisma.$transaction(async (tx) => {
      await tx.rideOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });

      // Reject all other pending offers for this ride
      await tx.rideOffer.updateMany({
        where: {
          rideRequestId: offer.rideRequestId,
          id: { not: offerId },
          status: "PENDING",
        },
        data: { status: "REJECTED", respondedAt: new Date() },
      });

      await tx.rideRequest.update({
        where: { id: offer.rideRequestId },
        data: { status: "MATCHED" },
      });

      const newTrip = await tx.trip.create({
        data: {
          rideRequestId: offer.rideRequestId,
          driverProfileId: offer.driverProfileId,
          vehicleId: offer.driverProfile.vehicles[0]?.id,
          lockedFare: offer.fareAmount,
          status: "DRIVER_ASSIGNED",
          pickupLatitude: offer.rideRequest.pickupLatitude,
          pickupLongitude: offer.rideRequest.pickupLongitude,
          pickupAddress: offer.rideRequest.pickupAddress,
          dropoffLatitude: offer.rideRequest.dropoffLatitude,
          dropoffLongitude: offer.rideRequest.dropoffLongitude,
          dropoffAddress: offer.rideRequest.dropoffAddress,
        },
        include: {
          driverProfile: {
            include: {
              user: { select: { name: true, avatarUrl: true, phone: true } },
              vehicles: { where: { isActive: true }, take: 1 },
            },
          },
        },
      });

      return newTrip;
    });

    // Notify driver in real-time
    emitToUser(offer.driverProfile.user.id, "trip:created", trip);
    emitToUser(offer.driverProfile.user.id, "offer:accepted", { offerId, tripId: trip.id });

    return successResponse(trip, "Offer accepted. Trip created with fare locked!");
  } catch (error) {
    console.error("[OFFERS] Respond error:", error);
    return errorResponse("Failed to respond to offer", 500);
  }
}
