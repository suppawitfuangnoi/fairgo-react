/**
 * GET /api/v1/admin/rides/:id/negotiation
 * Returns the full offer chain for a ride request so admins can inspect
 * the negotiation history: round numbers, who proposed each offer,
 * fare amounts, statuses, timestamps, and expiry states.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    authResult as JwtPayload; // type assertion — ensure auth passed

    const { id: rideRequestId } = await params;

    // Verify ride request exists
    const rideRequest = await prisma.rideRequest.findUnique({
      where: { id: rideRequestId },
      include: {
        customerProfile: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    });
    if (!rideRequest) {
      return errorResponse("Ride request not found", 404);
    }

    // Fetch all offers for this ride, ordered by round and creation time
    const offers = await prisma.rideOffer.findMany({
      where: { rideRequestId },
      include: {
        driverProfile: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
      },
      orderBy: [{ roundNumber: "asc" }, { createdAt: "asc" }],
    });

    const now = new Date();

    // Group by driver — each driver has their own negotiation chain
    const byDriver = new Map<string, typeof offers>();
    for (const offer of offers) {
      const driverId = offer.driverProfileId;
      if (!byDriver.has(driverId)) byDriver.set(driverId, []);
      byDriver.get(driverId)!.push(offer);
    }

    const chains = Array.from(byDriver.entries()).map(([driverProfileId, driverOffers]) => {
      const driver = driverOffers[0].driverProfile;
      const rounds = driverOffers.map((o) => ({
        offerId: o.id,
        parentOfferId: o.parentOfferId,
        roundNumber: o.roundNumber,
        proposedBy: o.proposedBy,
        fareAmount: o.fareAmount,
        status: o.status,
        message: o.message,
        createdAt: o.createdAt,
        respondedAt: o.respondedAt,
        expiresAt: o.expiresAt,
        isExpired: o.expiresAt ? now > o.expiresAt : false,
        responseTimeMs:
          o.respondedAt && o.createdAt
            ? o.respondedAt.getTime() - o.createdAt.getTime()
            : null,
      }));

      const latestOffer = driverOffers[driverOffers.length - 1];
      const finalStatus = rounds.some((r) => r.status === "ACCEPTED")
        ? "ACCEPTED"
        : rounds.some((r) => r.status === "REJECTED")
        ? "REJECTED"
        : latestOffer.status;

      return {
        driverProfileId,
        driver: {
          userId: driver.user.id,
          name: driver.user.name,
          phone: driver.user.phone,
          vehicle: driver.vehicles[0] ?? null,
        },
        totalRounds: rounds.length,
        finalStatus,
        initialFare: rounds[0]?.fareAmount ?? null,
        finalFare: latestOffer.fareAmount,
        rounds,
      };
    });

    // Summary statistics
    const totalOffers = offers.length;
    const acceptedOffer = offers.find((o) => o.status === "ACCEPTED");
    const maxRound = offers.reduce((max, o) => Math.max(max, o.roundNumber), 0);

    return successResponse({
      rideRequest: {
        id: rideRequest.id,
        status: rideRequest.status,
        pickupAddress: rideRequest.pickupAddress,
        dropoffAddress: rideRequest.dropoffAddress,
        fareMin: rideRequest.fareMin,
        fareMax: rideRequest.fareMax,
        createdAt: rideRequest.createdAt,
        expiresAt: rideRequest.expiresAt,
        customer: {
          userId: rideRequest.customerProfile.user.id,
          name: rideRequest.customerProfile.user.name,
          phone: rideRequest.customerProfile.user.phone,
        },
      },
      summary: {
        totalOffers,
        totalDrivers: chains.length,
        maxNegotiationRounds: maxRound,
        acceptedByDriverId: acceptedOffer?.driverProfileId ?? null,
        lockedFare: acceptedOffer?.fareAmount ?? null,
      },
      chains,
    });
  } catch (error) {
    console.error("[ADMIN] Negotiation chain error:", error);
    return errorResponse("Failed to fetch negotiation chain", 500);
  }
}
