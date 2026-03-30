import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { createRatingSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, createRatingSchema);
    if ("error" in result) return result.error;

    const { tripId, score, tags, comment } = result.data;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        rideRequest: { include: { customerProfile: true } },
        driverProfile: true,
      },
    });

    if (!trip) return errorResponse("Trip not found", 404);
    if (trip.status !== "COMPLETED") {
      return errorResponse("Can only rate completed trips", 422);
    }

    // Determine who is being rated
    let toUserId: string;
    if (user.role === "CUSTOMER") {
      toUserId = (await prisma.user.findFirst({
        where: { driverProfile: { id: trip.driverProfileId } },
      }))!.id;
    } else {
      toUserId = (await prisma.user.findFirst({
        where: { customerProfile: { id: trip.rideRequest.customerProfileId } },
      }))!.id;
    }

    // Check for existing rating
    const existing = await prisma.rating.findUnique({
      where: { tripId_fromUserId: { tripId, fromUserId: user.userId } },
    });
    if (existing) return errorResponse("You already rated this trip", 409);

    const rating = await prisma.rating.create({
      data: {
        tripId,
        fromUserId: user.userId,
        toUserId,
        score,
        tags,
        comment,
      },
    });

    // Update average rating
    const allRatings = await prisma.rating.findMany({
      where: { toUserId },
      select: { score: true },
    });
    const avgRating =
      allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length;

    if (user.role === "CUSTOMER") {
      await prisma.driverProfile.update({
        where: { id: trip.driverProfileId },
        data: { averageRating: avgRating },
      });
    } else {
      await prisma.customerProfile.update({
        where: { id: trip.rideRequest.customerProfileId },
        data: { averageRating: avgRating },
      });
    }

    return successResponse(rating, "Rating submitted", 201);
  } catch (error) {
    console.error("[RATINGS] Create error:", error);
    return errorResponse("Failed to submit rating", 500);
  }
}
