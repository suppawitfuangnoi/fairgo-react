import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const phone = request.nextUrl.searchParams.get("phone");
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {};
    if (phone) where.phone = { contains: phone };

    const [logs, total] = await Promise.all([
      prisma.otpCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          otpRef: true,
          attemptCount: true,
          usedAt: true,
          ipAddress: true,
          expiresAt: true,
          createdAt: true,
          // Do NOT expose the actual code field
        },
      }),
      prisma.otpCode.count({ where }),
    ]);

    return successResponse({
      logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] OTP logs error:", error);
    return errorResponse("Failed to fetch OTP logs", 500);
  }
}
