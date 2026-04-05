/**
 * POST /api/v1/coupons/validate — validate a coupon code and return discount info
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const ValidateSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  fare: z.number().positive(),
});

function calculateDiscount(coupon: {
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
}, fare: number): number {
  let discount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discount = (fare * coupon.discountValue) / 100;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = coupon.discountValue;
  }
  return Math.min(discount, fare);
}

export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const body = await request.json();
    const parsed = ValidateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);
    const { code, fare } = parsed.data;

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) return errorResponse("ไม่พบโค้ดโปรโมชั่นนี้", 404);
    if (!coupon.isActive) return errorResponse("โค้ดโปรโมชั่นนี้ถูกปิดใช้งานแล้ว", 400);

    const now = new Date();
    if (now < coupon.validFrom) return errorResponse("โค้ดโปรโมชั่นยังไม่เริ่มใช้งาน", 400);
    if (now > coupon.validUntil) return errorResponse("โค้ดโปรโมชั่นหมดอายุแล้ว", 400);

    if (coupon.maxRedemptions && coupon.currentRedemptions >= coupon.maxRedemptions) {
      return errorResponse("โค้ดโปรโมชั่นถูกใช้งานครบจำนวนแล้ว", 400);
    }

    if (coupon.minFare && fare < coupon.minFare) {
      return errorResponse(`ค่าโดยสารขั้นต่ำ ฿${coupon.minFare.toFixed(2)} เพื่อใช้โค้ดนี้`, 400);
    }

    const alreadyUsed = await prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, userId: user.userId },
    });
    if (alreadyUsed) return errorResponse("คุณใช้โค้ดโปรโมชั่นนี้ไปแล้ว", 400);

    const discount = calculateDiscount(coupon, fare);
    const finalFare = fare - discount;

    return successResponse({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount: parseFloat(discount.toFixed(2)),
      finalFare: parseFloat(finalFare.toFixed(2)),
    });
  } catch (error) {
    console.error("[COUPONS/VALIDATE] POST error:", error);
    return errorResponse("Failed to validate coupon", 500);
  }
}
