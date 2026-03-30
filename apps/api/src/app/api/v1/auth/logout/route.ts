import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult;

    // Delete all refresh tokens for this user
    await prisma.refreshToken.deleteMany({
      where: { userId: user.userId },
    });

    return successResponse(null, "Logged out successfully");
  } catch (error) {
    console.error("[AUTH] Logout error:", error);
    return errorResponse("Logout failed", 500);
  }
}
