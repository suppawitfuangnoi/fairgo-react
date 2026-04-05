import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOTP } from "@/lib/otp";
import { generateAccessToken, generateRefreshToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { verifyOtpSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, verifyOtpSchema);
    if ("error" in result) return result.error;

    const { phone, code, role } = result.data;

    // Verify OTP
    const isValid = await verifyOTP(phone, code);
    if (!isValid) {
      return errorResponse("Invalid or expired OTP", 401);
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          role: role === "DRIVER" ? "DRIVER" : "CUSTOMER",
          ...(role === "DRIVER"
            ? { driverProfile: { create: {} } }
            : { customerProfile: { create: {} } }),
        },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    return successResponse({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours in seconds
    }, "Login successful");
  } catch (error) {
    console.error("[AUTH] Verify OTP error:", error);
    return errorResponse("Authentication failed", 500);
  }
}
