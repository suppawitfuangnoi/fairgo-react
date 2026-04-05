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

    const { phone, code, role, name } = result.data;

    // Verify OTP
    const isValid = await verifyOTP(phone, code);
    if (!isValid) {
      return errorResponse("Invalid or expired OTP", 401);
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { phone } });
    const isNewUser = !user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || null,
          role: role === "DRIVER" ? "DRIVER" : "CUSTOMER",
          ...(role === "DRIVER"
            ? { driverProfile: { create: {} } }
            : { customerProfile: { create: {} } }),
        },
      });
    } else if (name && !user.name) {
      // Save name for existing users who didn't have one yet
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
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

    // Include verificationStatus for driver accounts
    let verificationStatus: string | undefined;
    if (role === "DRIVER") {
      const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId: user.id },
        select: { verificationStatus: true },
      });
      verificationStatus = driverProfile?.verificationStatus;
    }

    return successResponse({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        ...(verificationStatus !== undefined ? { verificationStatus } : {}),
      },
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours in seconds
      isNewUser,
    }, "Login successful");
  } catch (error) {
    console.error("[AUTH] Verify OTP error:", error);
    return errorResponse("Authentication failed", 500);
  }
}
