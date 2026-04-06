import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateProfileSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        customerProfile: true,
        driverProfile: {
          include: { vehicles: true },
        },
        adminProfile: true,
      },
    });

    if (!dbUser) {
      return errorResponse("User not found", 404);
    }

    return successResponse({
      id: dbUser.id,
      phone: dbUser.phone,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      status: dbUser.status,
      avatarUrl: dbUser.avatarUrl,
      locale: dbUser.locale,
      customerProfile: dbUser.customerProfile,
      driverProfile: dbUser.driverProfile,
      // Only expose adminProfile metadata to admin role callers —
      // leaking this to customer/driver apps is unnecessary and potentially risky.
      ...(user.role === "ADMIN" ? { adminProfile: dbUser.adminProfile } : {}),
      createdAt: dbUser.createdAt,
    });
  } catch (error) {
    console.error("[USERS] Get profile error:", error);
    return errorResponse("Failed to get profile", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, updateProfileSchema);
    if ("error" in result) return result.error;

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: result.data,
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        locale: true,
      },
    });

    return successResponse(updated, "Profile updated successfully");
  } catch (error) {
    console.error("[USERS] Update profile error:", error);
    return errorResponse("Failed to update profile", 500);
  }
}
