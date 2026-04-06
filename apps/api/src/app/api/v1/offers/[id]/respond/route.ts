/**
 * POST /api/v1/offers/:id/respond
 * Customer responds to a driver offer: ACCEPT | REJECT | COUNTER
 *
 * Concurrency safety:
 * - ACCEPT: uses `updateMany WHERE status='PENDING'` inside transaction.
 *   If count=0 → another request already accepted/rejected → 409.
 * - COUNTER: same atomic check before creating counter-offer.
 * - Trip creation: Trip.rideRequestId is @unique — DB prevents duplicate trips.
 *   If trip already exists for this ride (idempotent retry), returns existing trip.
 * - Expiry is re-checked inside transaction to avoid accepting an offer the
 *   background sweep concurrently expired.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { respondToOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";
import { Prisma, TripStatus } from "@prisma/client";

const MAX_NEGOTIATION_ROUNDS = 5;
const COUNTER_OFFER_EXPIRY_MS = 90 * 1000; // 90 s

const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  "DRIVER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PICKUP_CONFIRMED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  "AWAITING_CASH_CONFIRMATION",
];

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

    // ── 1. Load offer with relations ───────────────────────────────────────
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

    // ── 2. Authorize — only the customer who owns the ride can respond ─────
    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.userId },
    });
    if (offer.rideRequest.customerProfileId !== profile?.id) {
      return errorResponse("Not authorized to respond to this offer", 403);
    }

    // ── 3. Pre-check status (cheap early exit before locking) ─────────────
    if (offer.status !== "PENDING") {
      return errorResponse("This offer has already been responded to", 422);
    }

    // ── 4. Expiry check ────────────────────────────────────────────────────
    if (offer.expiresAt && new Date() > offer.expiresAt) {
      // Mark expired (best-effort, not blocking)
      prisma.rideOffer
        .updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "EXPIRED" } })
        .catch(() => {});
      return errorResponse("This offer has expired", 410);
    }

    // ── REJECT ────────────────────────────────────────────────────────────
    if (action === "REJECT") {
      const { count } = await prisma.rideOffer.updateMany({
        where: { id: offerId, status: "PENDING" },
        data: { status: "REJECTED", respondedAt: new Date() },
      });
      if (count === 0) {
        return errorResponse("Offer was already responded to by someone else", 409);
      }
      emitToUser(offer.driverProfile.user.id, "offer:rejected", { offerId });
      await Notif.offerRejected(offer.driverProfile.user.id, offerId);
      return successResponse(null, "Offer rejected");
    }

    // ── COUNTER ───────────────────────────────────────────────────────────
    if (action === "COUNTER") {
      if (!counterFareAmount || counterFareAmount <= 0) {
        return errorResponse("Counter fare amount is required and must be positive", 422);
      }
      const newRound = offer.roundNumber + 1;
      if (newRound > MAX_NEGOTIATION_ROUNDS) {
        return errorResponse(`Maximum negotiation rounds (${MAX_NEGOTIATION_ROUNDS}) reached`, 422);
      }
      const rideRequest = offer.rideRequest;
      if (counterFareAmount < rideRequest.fareMin || counterFareAmount > rideRequest.fareMax) {
        return errorResponse(
          `Counter fare must be between ฿${rideRequest.fareMin} and ฿${rideRequest.fareMax}`,
          422
        );
      }

      let counterOffer: { id: string; expiresAt: Date | null; rideRequestId: string; fareAmount: number };
      try {
        counterOffer = await prisma.$transaction(async (tx) => {
          // Atomically mark driver's offer as COUNTERED
          const { count } = await tx.rideOffer.updateMany({
            where: { id: offerId, status: "PENDING" },
            data: { status: "COUNTERED", respondedAt: new Date() },
          });
          if (count === 0) {
            throw Object.assign(new Error("ALREADY_RESPONDED"), { code: "ALREADY_RESPONDED" });
          }

          const created = await tx.rideOffer.create({
            data: {
              rideRequestId: offer.rideRequestId,
              driverProfileId: offer.driverProfileId,
              fareAmount: counterFareAmount,
              message: message ?? null,
              proposedBy: "CUSTOMER",
              roundNumber: newRound,
              parentOfferId: offerId,
              expiresAt: new Date(Date.now() + COUNTER_OFFER_EXPIRY_MS),
            },
          });

          await tx.$executeRaw`UPDATE ride_requests SET status = 'NEGOTIATING', "updatedAt" = NOW() WHERE id = ${offer.rideRequestId}`;

          return created;
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return errorResponse("A counter-offer for this round has already been submitted", 409);
        }
        if ((err as { code?: string }).code === "ALREADY_RESPONDED") {
          return errorResponse("Offer was already responded to", 409);
        }
        throw err;
      }

      emitToUser(offer.driverProfile.user.id, "offer:counter", {
        offerId: counterOffer.id,
        rideRequestId: offer.rideRequestId,
        fareAmount: counterFareAmount,
        roundNumber: newRound,
        message: message ?? null,
        expiresAt: counterOffer.expiresAt,
      });
      await Notif.counterOffer(offer.driverProfile.user.id, {
        id: counterOffer.id,
        rideRequestId: offer.rideRequestId,
        fareAmount: counterFareAmount,
        roundNumber: newRound,
      });

      return successResponse(counterOffer, "Counter-offer sent to driver");
    }

    // ── ACCEPT ────────────────────────────────────────────────────────────
    // Check passenger doesn't already have an active trip
    const passengerActiveTrip = await prisma.trip.findFirst({
      where: {
        rideRequest: { customerProfileId: offer.rideRequest.customerProfileId },
        status: { in: ACTIVE_TRIP_STATUSES },
      },
    });
    if (passengerActiveTrip) {
      return errorResponse("You already have an active trip. Complete or cancel it first.", 409);
    }

    // Check driver doesn't already have an active trip
    const driverActiveTrip = await prisma.trip.findFirst({
      where: {
        driverProfileId: offer.driverProfileId,
        status: { in: ACTIVE_TRIP_STATUSES },
      },
    });
    if (driverActiveTrip) {
      return errorResponse(
        "This driver already has an active trip. Please choose another driver.",
        409
      );
    }

    // Idempotency: check if a trip already exists for this ride request
    // (handles the case where accept succeeded but the HTTP response was lost)
    const existingTrip = await prisma.trip.findUnique({
      where: { rideRequestId: offer.rideRequestId },
      include: {
        driverProfile: {
          include: {
            user: { select: { name: true, avatarUrl: true, phone: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });
    if (existingTrip) {
      // Idempotent — return the already-created trip
      return successResponse(existingTrip, "Trip already created (idempotent)");
    }

    // ── Create trip inside transaction with atomic offer status check ──────
    let trip: Awaited<ReturnType<typeof prisma.trip.create>>;
    try {
      trip = await prisma.$transaction(async (tx) => {
        // Atomically accept offer — count=0 means someone else responded first
        const { count } = await tx.rideOffer.updateMany({
          where: { id: offerId, status: "PENDING" },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        if (count === 0) {
          throw Object.assign(new Error("OFFER_ALREADY_RESPONDED"), {
            code: "OFFER_ALREADY_RESPONDED",
          });
        }

        // Reject all other pending offers for this ride
        await tx.rideOffer.updateMany({
          where: {
            rideRequestId: offer.rideRequestId,
            id: { not: offerId },
            status: "PENDING",
          },
          data: { status: "REJECTED", respondedAt: new Date() },
        });

        // Lock in MATCHED status
        await tx.rideRequest.update({
          where: { id: offer.rideRequestId },
          data: { status: "MATCHED" },
        });

        // Create trip — Trip.rideRequestId @unique provides DB-level idempotency
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
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "OFFER_ALREADY_RESPONDED") {
        return errorResponse("Offer was already accepted or rejected", 409);
      }
      // P2002 on Trip.rideRequestId — concurrent accept created trip first
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existingAfterRace = await prisma.trip.findUnique({
          where: { rideRequestId: offer.rideRequestId },
          include: {
            driverProfile: {
              include: {
                user: { select: { name: true, avatarUrl: true, phone: true } },
                vehicles: { where: { isActive: true }, take: 1 },
              },
            },
          },
        });
        if (existingAfterRace) {
          return successResponse(existingAfterRace, "Trip already created (race idempotent)");
        }
      }
      throw err;
    }

    // ── Log initial status ─────────────────────────────────────────────────
    const logId = `tsl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    prisma.$executeRaw`
      INSERT INTO trip_status_logs (id, "tripId", "fromStatus", "toStatus", "changedByType", "changedById", note, "createdAt")
      VALUES (${logId}, ${trip.id}, 'NONE', 'DRIVER_ASSIGNED', 'CUSTOMER', ${user.userId}, 'Trip created on offer accept', NOW())
    `.catch(() => {}); // best-effort

    // ── Notify driver ──────────────────────────────────────────────────────
    emitToUser(offer.driverProfile.user.id, "trip:created", trip);
    emitToUser(offer.driverProfile.user.id, "offer:accepted", {
      offerId,
      tripId: trip.id,
    });
    await Notif.offerAccepted(offer.driverProfile.user.id, trip.id, offer.fareAmount);

    return successResponse(trip, "Offer accepted. Trip created with fare locked!");
  } catch (error) {
    console.error("[OFFERS] Respond error:", error);
    return errorResponse("Failed to respond to offer", 500);
  }
}
