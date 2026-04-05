/**
 * Admin Coupon Management — single coupon
 * PATCH /api/v1/admin/coupons/:id  — update / toggle active
 * DELETE /api/v1/admin/coupons/:id — soft-delete (set isActive=false)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const UpdateCouponSchema = z.object({
  description: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.number().positive().optional(),
  maxDiscount: z.number().positive().nullable().optional(),
  minFare: z.number().positive().nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = requireRole(request, "ADMIN");
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const coupon = await prisma.coupon.findUnique({ where: { id: params.id } });
    if (!coupon) return errorResponse("Coupon not found", 404);

    const body = await request.json();
    const parsed = UpdateCouponSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { validFrom, validUntil, ...rest } = parsed.data;

    const updated = await prisma.coupon.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(validFrom ? { validFrom: new Date(validFrom) } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
      },
    });

    return successResponse(updated, "Coupon updated successfully");
  } catch (error) {
    console.error("[ADMIN/COUPONS/:id] PATCH error:", error);
    return errorResponse("Failed to update coupon", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = requireRole(request, "ADMIN");
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const coupon = await prisma.coupon.findUnique({ where: { id: params.id } });
    if (!coupon) return errorResponse("Coupon not found", 404);

    // Soft-delete by deactivating
    await prisma.coupon.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return successResponse(null, "Coupon deactivated successfully");
  } catch (error) {
    console.error("[ADMIN/COUPONS/:id] DELETE error:", error);
    return errorResponse("Failed to deactivate coupon", 500);
  }
}
