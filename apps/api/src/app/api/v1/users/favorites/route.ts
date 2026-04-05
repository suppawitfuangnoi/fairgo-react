/**
 * GET  /api/v1/users/favorites  — list favorite drivers for the logged-in customer
 * POST /api/v1/users/favorites  — toggle a driver in/out of favorites
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.userId },
      select: { favoriteDriverIds: true },
    });

    if (!profile) return errorResponse("Customer profile not found", 404);

    // Fetch driver details for each favorite
    const drivers = await prisma.driverProfile.findMany({
      where: { id: { in: profile.favoriteDriverIds } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, phone: true } },
        vehicles: { where: { isActive: true }, take: 1 },
      },
    });

    return successResponse({ favoriteDriverIds: profile.favoriteDriverIds, drivers });
  } catch (error) {
    console.error("[FAVORITES] GET error:", error);
    return errorResponse("Failed to get favorites", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const body = await request.json();
    const { driverProfileId } = body as { driverProfileId: string };

    if (!driverProfileId) return errorResponse("driverProfileId required", 400);

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.userId },
      select: { id: true, favoriteDriverIds: true },
    });

    if (!profile) return errorResponse("Customer profile not found", 404);

    const isFavorite = profile.favoriteDriverIds.includes(driverProfileId);
    const updatedIds = isFavorite
      ? profile.favoriteDriverIds.filter((id) => id !== driverProfileId) // remove
      : [...profile.favoriteDriverIds, driverProfileId]; // add

    await prisma.customerProfile.update({
      where: { id: profile.id },
      data: { favoriteDriverIds: updatedIds },
    });

    return successResponse({
      favoriteDriverIds: updatedIds,
      action: isFavorite ? "removed" : "added",
    }, isFavorite ? "Removed from favorites" : "Added to favorites");
  } catch (error) {
    console.error("[FAVORITES] POST error:", error);
    return errorResponse("Failed to update favorites", 500);
  }
}
