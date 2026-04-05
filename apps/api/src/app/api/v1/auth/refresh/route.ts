import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
} from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { refreshTokenSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, refreshTokenSchema);
    if ("error" in result) return result.error;

    const { refreshToken: oldToken } = result.data;

    // Verify JWT
    let payload;
    try {
      payload = verifyRefreshToken(oldToken);
    } catch {
      return errorResponse("Invalid refresh token", 401);
    }

    // Find token in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      return errorResponse("Refresh token expired", 401);
    }

    // Rotate tokens
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = generateAccessToken(
      payload.userId,
      payload.role
    );
    const newRefreshToken = generateRefreshToken(
      payload.userId,
      payload.role
    );

    await prisma.refreshToken.create({
      data: {
        userId: payload.userId,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    return successResponse({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 86400,
    });
  } catch (error) {
    console.error("[AUTH] Refresh token error:", error);
    return errorResponse("Token refresh failed", 500);
  }
}
