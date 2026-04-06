/**
 * POST /api/v1/offers — Driver submits an offer (initial or counter-counter)
 * GET  /api/v1/offers — Driver lists their own offers
 *
 * Concurrency safety:
 * - DB partial unique index `ride_offers_one_pending_driver` prevents two
 *   concurrent PENDING DRIVER offers for the same (rideRequest, driver).
 *   Caught as Prisma P2002 → HTTP 409.
 * - DB unique index `ride_offers_unique_round` prevents duplicate round entries.
 * - parentOfferId state is validated inside a transaction with atomic update.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireActiveRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { createRideOfferSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";
import { emitToUser } from "@/lib/socket";
import { Notif } from "@/lib/notifications";
import { Prisma } from "@prisma/client";

const MAX_NEGOTIATION_ROUNDS = 5;
const COUNTER_OFFER_EXPIRY_MS = 90 * 1000; // 90 s

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireActiveRole(request, ["DRIVER"]);
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

    // ── 1. Validate ride request ───────────────────────────────────────────
    const rideRequest = await prisma.rideRequest.findUnique({
      where: { id: result.data.rideRequestId },
      include: { customerProfile: true },
    });
    if (!rideRequest) return errorResponse("Ride request not found", 404);
    if (rideRequest.expiresAt && rideRequest.expiresAt < new Date()) {
      return errorResponse("This ride request has expired", 410);
    }
    if (!["PENDING", "MATCHING", "NEGOTIATING"].includes(rideRequest.status as string)) {
      return errorResponse("Ride request is no longer available", 422);
    }

    // ── 2. Validate fare is within customer's stated range ─────────────────
    if (
      result.data.fareAmount < rideRequest.fareMin ||
      result.data.fareAmount > rideRequest.fareMax
    ) {
      return errorResponse(
        `Fare must be between ฿${rideRequest.fareMin} and ฿${rideRequest.fareMax}`,
        422
      );
    }

    // ── 3. Resolve parentOfferId chain ─────────────────────────────────────
    let roundNumber = 1;
    let parentOfferId: string | undefined;
    let expiresAt: Date | undefined;

    if (result.data.parentOfferId) {
      const parentOffer = await prisma.rideOffer.findUnique({
        where: { id: result.data.parentOfferId },
      });
      if (!parentOffer) return errorResponse("Parent offer not found", 404);
      if (parentOffer.rideRequestId !== result.data.rideRequestId) {
        return errorResponse("Parent offer belongs to a different ride request", 422);
      }
      if (parentOffer.proposedBy !== "CUSTOMER") {
        return errorResponse("Can only counter a customer's counter-offer", 422);
      }
      if (parentOffer.status !== "PENDING") {
        return errorResponse("This counter-offer has already been responded to", 422);
      }
      if (parentOffer.expiresAt && parentOffer.expiresAt < new Date()) {
        return errorResponse("This counter-offer has expired", 410);
      }
      if (parentOffer.driverProfileId !== driverProfile.id) {
        return errorResponse("Cannot counter an offer from a different negotiation chain", 403);
      }

      roundNumber = parentOffer.roundNumber + 1;
      if (roundNumber > MAX_NEGOTIATION_ROUNDS) {
        return errorResponse(
          `Maximum negotiation rounds (${MAX_NEGOTIATION_ROUNDS}) reached`,
          422
        );
      }
      parentOfferId = parentOffer.id;
      expiresAt = new Date(Date.now() + COUNTER_OFFER_EXPIRY_MS);
    }

    // ── 4. Atomic create inside transaction ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let offer: any;
    try {
      offer = await prisma.$transaction(async (tx) => {
        // Atomically mark parent as COUNTERED — if count=0 someone beat us to it
        if (parentOfferId) {
          const { count } = await tx.rideOffer.updateMany({
            where: { id: parentOfferId, status: "PENDING" },
            data: { status: "COUNTERED", respondedAt: new Date() },
          });
          if (count === 0) {
            throw Object.assign(new Error("PARENT_ALREADY_RESPONDED"), {
              code: "PARENT_ALREADY_RESPONDED",
            });
          }
        }

        const created = await tx.rideOffer.create({
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

        // Update ride request status
        if (roundNumber > 1) {
          await tx.$executeRaw`UPDATE ride_requests SET status = 'NEGOTIATING', "updatedAt" = NOW() WHERE id = ${result.data.rideRequestId}`;
        } else {
          await tx.rideRequest.update({
            where: { id: result.data.rideRequestId },
            data: { status: "MATCHING" },
          });
        }

        return created;
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("You already have a pending offer for this ride", 409);
      }
      if ((err as { code?: string }).code === "PARENT_ALREADY_RESPONDED") {
        return errorResponse("This counter-offer has already been responded to", 409);
      }
      throw err;
    }

    // ── 5. Notify customer ─────────────────────────────────────────────────
    emitToUser(rideRequest.customerProfile.userId, "offer:new", {
      ...offer,
      roundNumber,
      isCounter: roundNumber > 1,
    });
    await Notif.newOffer(rideRequest.customerProfile.userId, {
      id: offer.id,
      rideRequestId: offer.rideRequestId,
      fareAmount: offer.fareAmount,
      driverName:
        (offer.driverProfile as { user: { name: string | null } }).user.name ?? "Driver",
      roundNumber,
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
