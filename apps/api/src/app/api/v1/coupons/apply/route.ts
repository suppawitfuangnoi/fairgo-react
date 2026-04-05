/**
 * POST /api/v1/coupons/apply — apply coupon to a trip (record redemption)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const ApplySchema = z.object({
  code: z.string().min(1).toUpperCase(),
  tripId: z.string(),
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
    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);
    const { code, tripId, fare } = parsed.data;

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) return errorResponse("ไม่พบโค้ดโปรโมชั่นนี้", 404);
    if (!coupon.isActive) return errorResponse("โค้ดโปรโมชั่นนี้ถูกปิดใช้งานแล้ว", 400);

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return errorResponse("โค้ดโปรโมชั่นหมดอายุแล้ว", 400);
    }

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

    // Atomic: record redemption + increment counter
    await prisma.$transaction([
      prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: user.userId,
          tripId,
          discount,
        },
      }),
      prisma.coupon.update({
        where: { id: coupon.id },
        data: { currentRedemptions: { increment: 1 } },
      }),
    ]);

    return successResponse({
      applied: true,
      discount: parseFloat(discount.toFixed(2)),
      finalFare: parseFloat((fare - discount).toFixed(2)),
    }, "ใช้โค้ดโปรโมชั่นสำเร็จ");
  } catch (error) {
    console.error("[COUPONS/APPLY] POST error:", error);
    return errorResponse("Failed to apply coupon", 500);
  }
}
