/**
 * Admin OTP Logs endpoint
 *
 * GET /admin/otp-logs
 *   - Returns paginated OTP records for monitoring/support
 *   - code field exposed ONLY in non-production (NODE_ENV !== 'production')
 *
 * GET /admin/otp-logs/debug?otpRef=REF-XXXXXX
 *   - Returns full OTP record including code for non-production debugging
 *   - Returns 403 in production
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

const isProduction = () => process.env.NODE_ENV === "production";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const phone  = request.nextUrl.searchParams.get("phone");
    const status = request.nextUrl.searchParams.get("status");
    const otpRef = request.nextUrl.searchParams.get("otpRef");
    const debug  = request.nextUrl.searchParams.get("debug") === "true";
    const page   = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit  = Math.min(100, parseInt(request.nextUrl.searchParams.get("limit") || "50"));

    // debug=true + otpRef: single record lookup with code (non-prod only)
    if (debug && otpRef) {
      if (isProduction()) {
        return errorResponse("Debug mode not available in production", 403);
      }
      const record = await prisma.otpCode.findUnique({ where: { otpRef } });
      if (!record) return errorResponse("OTP record not found", 404);
      return successResponse({
        ...record,
        // Expose code only in debug mode (non-production)
        code: record.code,
      });
    }

    // Normal paginated list
    const where: Record<string, unknown> = {};
    if (phone)  where.phone  = { contains: phone };
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      prisma.otpCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id:           true,
          phone:        true,
          otpRef:       true,
          purpose:      true,
          status:       true,
          attemptCount: true,
          resendCount:  true,
          lockedUntil:  true,
          usedAt:       true,
          expiresAt:    true,
          ipAddress:    true,
          createdAt:    true,
          updatedAt:    true,
          // Expose raw code ONLY in non-production
          ...(!isProduction() ? { code: true } : {}),
        },
      }),
      prisma.otpCode.count({ where }),
    ]);

    return successResponse({
      logs,
      isProduction: isProduction(),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] OTP logs error:", error);
    return errorResponse("Failed to fetch OTP logs", 500);
  }
}
