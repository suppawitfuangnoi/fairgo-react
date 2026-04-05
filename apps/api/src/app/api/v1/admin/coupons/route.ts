/**
 * Admin Coupon Management
 * GET  /api/v1/admin/coupons        — list all coupons
 * POST /api/v1/admin/coupons        — create a new coupon
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const CreateCouponSchema = z.object({
  code: z.string().min(3).max(20).toUpperCase(),
  description: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  maxDiscount: z.number().positive().optional(),
  minFare: z.number().positive().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  validFrom: z.string(),
  validUntil: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, "ADMIN");
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { redemptions: true } },
      },
    });

    return successResponse(coupons);
  } catch (error) {
    console.error("[ADMIN/COUPONS] GET error:", error);
    return errorResponse("Failed to get coupons", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, "ADMIN");
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const body = await request.json();
    const parsed = CreateCouponSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { code, description, discountType, discountValue, maxDiscount, minFare, maxRedemptions, validFrom, validUntil } = parsed.data;

    // Check for duplicate code
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) return errorResponse("Coupon code already exists", 409);

    const coupon = await prisma.coupon.create({
      data: {
        code,
        description,
        discountType,
        discountValue,
        maxDiscount,
        minFare,
        maxRedemptions,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        isActive: true,
      },
    });

    return successResponse(coupon, "Coupon created successfully");
  } catch (error) {
    console.error("[ADMIN/COUPONS] POST error:", error);
    return errorResponse("Failed to create coupon", 500);
  }
}
