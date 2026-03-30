import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateDriverProfileSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";

export async function PATCH(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, updateDriverProfileSchema);
    if ("error" in result) return result.error;

    const profile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });

    if (!profile) {
      return errorResponse("Driver profile not found", 404);
    }

    const updated = await prisma.driverProfile.update({
      where: { userId: user.userId },
      data: result.data,
    });

    return successResponse(updated, "Driver profile updated");
  } catch (error) {
    console.error("[USERS] Update driver profile error:", error);
    return errorResponse("Failed to update driver profile", 500);
  }
}
