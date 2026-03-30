import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { respondToOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";

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

    const { action } = result.data;

    // Get the offer with ride request
    const offer = await prisma.rideOffer.findUnique({
      where: { id: offerId },
      include: {
        rideRequest: {
          include: { customerProfile: true },
        },
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

    if (action === "REJECT") {
      await prisma.rideOffer.update({
        where: { id: offerId },
        data: { status: "REJECTED", respondedAt: new Date() },
      });
      // Notify driver their offer was rejected
      emitToUser(offer.driverProfile.user.id, "offer:rejected", { offerId });
      return successResponse(null, "Offer rejected");
    }

    // ACCEPT the offer - create a trip with locked fare
    const trip = await prisma.$transaction(async (tx) => {
      // Accept this offer
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

      // Update ride request to MATCHED
      await tx.rideRequest.update({
        where: { id: offer.rideRequestId },
        data: { status: "MATCHED" },
      });

      // Create the trip
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

    // Notify driver in real-time that their offer was accepted + trip created
    emitToUser(offer.driverProfile.user.id, "trip:created", trip);

    return successResponse(trip, "Offer accepted. Trip created with fare locked!");
  } catch (error) {
    console.error("[OFFERS] Respond error:", error);
    return errorResponse("Failed to respond to offer", 500);
  }
}
