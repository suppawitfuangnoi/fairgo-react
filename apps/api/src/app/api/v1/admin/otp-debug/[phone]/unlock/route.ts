/**
 * POST /api/v1/admin/otp-debug/:phone/unlock
 *
 * Non-production only.
 * Unlocks the LOCKED OTP record(s) for a given phone number by:
 *   1. Setting lockedUntil = null
 *   2. Setting attemptCount = 0
 *   3. Setting status = PENDING (if currently LOCKED)
 *
 * This allows support teams in staging/dev to unblock testers without
 * waiting for the lockout window to expire.
 *
 * CRITICAL: Returns 403 in production.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";

const isProduction = () => process.env.NODE_ENV === "production";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  // Hard production guard — NEVER expose OTP unlock in production
  if (isProduction()) {
    return errorResponse("OTP debug tools are not available in production", 403);
  }

  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);

    // Find locked OTP records for this phone
    const lockedRecords = await prisma.otpCode.findMany({
      where: {
        phone: { contains: decodedPhone },
        status: "LOCKED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lockedRecords.length) {
      return successResponse({ unlocked: 0 }, "No locked OTP records found for this phone");
    }

    // Unlock all locked records
    const unlockResult = await prisma.otpCode.updateMany({
      where: {
        phone: { contains: decodedPhone },
        status: "LOCKED",
      },
      data: {
        lockedUntil: null,
        attemptCount: 0,
        status: "PENDING",
      },
    });

    await writeAuditLog({
      userId: admin.userId,
      action: "OTP_UNLOCK",
      entity: "OtpCode",
      entityId: decodedPhone,
      oldData: { lockedCount: lockedRecords.length, phone: decodedPhone },
      newData: { unlockedCount: unlockResult.count },
      ipAddress: getClientIp(request),
    });

    return successResponse(
      { unlocked: unlockResult.count, phone: decodedPhone },
      `Unlocked ${unlockResult.count} OTP record(s) for ${decodedPhone}`
    );
  } catch (error) {
    console.error("[ADMIN] OTP unlock error:", error);
    return errorResponse("Failed to unlock OTP", 500);
  }
}
