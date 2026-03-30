import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateLocationSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, updateLocationSchema);
    if ("error" in result) return result.error;

    const { latitude, longitude } = result.data;

    await prisma.driverProfile.update({
      where: { userId: user.userId },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
      },
    });

    return successResponse({ latitude, longitude }, "Location updated");
  } catch (error) {
    console.error("[USERS] Update location error:", error);
    return errorResponse("Failed to update location", 500);
  }
}
