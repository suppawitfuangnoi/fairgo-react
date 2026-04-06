import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOTP, normalisePhone, OtpPurpose } from "@/lib/otp";
import { generateAccessToken, generateRefreshToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { verifyOtpSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, verifyOtpSchema);
    if ("error" in result) return result.error;

    const { phone: rawPhone, otpRef, code, role, name } = result.data;

    const phone = normalisePhone(rawPhone);

    const purpose: OtpPurpose =
      role === "DRIVER" ? "DRIVER_LOGIN" : "CUSTOMER_LOGIN";

    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;

    // ── IP-level rate limit: 20 verify attempts per 10 min per IP ────────
    // The per-phone brute-force lock (5 attempts → 15 min) is the primary
    // guard; this IP limit stops IP-rotation attacks across multiple phones.
    const ipKey = `ip:${ipAddress ?? "unknown"}:otp-verify`;
    const ipLimit = checkRateLimit(ipKey, 10 * 60_000, 20);
    if (!ipLimit.allowed) {
      writeAuditLog({
        action: "OTP_VERIFY_IP_RATE_LIMIT_EXCEEDED",
        entity: "OTP",
        newData: { ip: ipAddress, phone },
        ipAddress,
        userAgent,
      }).catch(() => {});
      return errorResponse(
        "Too many verification attempts from this IP. Please try again later.",
        429,
        { retryAfterSeconds: Math.ceil(ipLimit.retryAfterMs / 1000) }
      );
    }

    // Verify OTP (otpRef + code + phone + purpose all validated)
    const verifyResult = await verifyOTP(phone, otpRef, code, purpose, ipAddress);

    if (!verifyResult.valid) {
      // Audit every failed OTP attempt for abuse detection
      writeAuditLog({
        action: "AUTH_OTP_VERIFY_FAILED",
        entity: "OTP",
        entityId: phone,
        newData: {
          reason: verifyResult.reason,
          attemptsRemaining: verifyResult.attemptsRemaining,
          locked: !!verifyResult.lockedUntil,
        },
        ipAddress,
        userAgent,
      }).catch(() => {});

      const extra: Record<string, unknown> = {};
      if (verifyResult.attemptsRemaining !== undefined) {
        extra.attemptsRemaining = verifyResult.attemptsRemaining;
      }
      if (verifyResult.lockedUntil) {
        extra.lockedUntil = verifyResult.lockedUntil.toISOString();
        extra.lockedUntilMs = verifyResult.lockedUntil.getTime();
      }
      return errorResponse(
        verifyResult.reason || "Invalid or expired OTP",
        401,
        Object.keys(extra).length > 0 ? extra : undefined
      );
    }

    // Determine target role
    const targetRole = role === "DRIVER" ? "DRIVER" : "CUSTOMER";

    // Find or create user (same phone can exist under different roles)
    let user = await prisma.user.findFirst({ where: { phone, role: targetRole } });

    // Refuse login to suspended accounts before creating tokens
    if (user && user.status === "SUSPENDED") {
      writeAuditLog({
        action: "AUTH_SUSPENDED_USER_LOGIN_ATTEMPT",
        entity: "User",
        entityId: user.id,
        newData: { phone, role: targetRole },
        ipAddress,
        userAgent,
      }).catch(() => {});
      return errorResponse(
        "Your account has been suspended. Please contact support.",
        403
      );
    }
    const isNewUser = !user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || null,
          role: targetRole,
          ...(targetRole === "DRIVER"
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
    const accessToken  = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: request.headers.get("user-agent") || undefined,
        ipAddress,
      },
    });

    // Audit successful login
    writeAuditLog({
      userId: user.id,
      action: isNewUser ? "AUTH_REGISTER" : "AUTH_LOGIN",
      entity: "User",
      entityId: user.id,
      newData: { phone, role: targetRole, isNewUser },
      ipAddress,
      userAgent,
    }).catch(() => {});

    // Include driver verification status if applicable
    let verificationStatus: string | undefined;
    if (targetRole === "DRIVER") {
      const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId: user.id },
        select: { verificationStatus: true, isVerified: true },
      });
      verificationStatus = driverProfile?.verificationStatus;
    }

    return successResponse(
      {
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
      },
      "Login successful"
    );
  } catch (error) {
    console.error("[AUTH] Verify OTP error:", error);
    return errorResponse("Authentication failed", 500);
  }
}
