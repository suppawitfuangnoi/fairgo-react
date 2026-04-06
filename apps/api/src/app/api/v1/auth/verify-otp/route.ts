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

    // Verify OTP with attempt tracking
    const verifyResult = await verifyOTP(phone, code);
    if (!verifyResult.valid) {
      return errorResponse(
        verifyResult.reason || "Invalid or expired OTP",
        401,
        verifyResult.attemptsRemaining !== undefined
          ? { attemptsRemaining: verifyResult.attemptsRemaining }
          : undefined
      );
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
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
        userAgent: request.headers.get("user-agent") || undefined,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || undefined,
      },
    });

    let verificationStatus: string | undefined;
    if (role === "DRIVER" || user.role === "DRIVER") {
      const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId: user.id },
        select: { verificationStatus: true, isVerified: true, isOnline: true },
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
        avatarUrl: user.avatarUrl,
        ...(verificationStatus !== undefined ? { verificationStatus } : {}),
      },
      accessToken,
      refreshToken,
      expiresIn: 86400,
      isNewUser,
    }, "Login successful");
  } catch (error) {
    console.error("[AUTH] Verify OTP error:", error);
    return errorResponse("Authentication failed", 500);
  }
}
