import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const PricingSchema = z.object({
  vehicleType: z.enum(["TAXI", "MOTORCYCLE", "TUKTUK"]),
  baseFare: z.number().min(0),
  perKmRate: z.number().min(0),
  perMinuteRate: z.number().min(0),
  minimumFare: z.number().min(0),
  surgeMultiplier: z.number().min(1).max(5),
  isActive: z.boolean().optional(),
});

// GET /api/v1/admin/pricing — get all pricing rules
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const rules = await prisma.pricingRule.findMany({
      orderBy: { vehicleType: "asc" },
    });

    return successResponse(rules);
  } catch (error) {
    console.error("[ADMIN] Get pricing error:", error);
    return errorResponse("Failed to get pricing rules", 500);
  }
}

// PUT /api/v1/admin/pricing — upsert pricing rule
export async function PUT(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const body = await request.json();
    const parsed = PricingSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { vehicleType, ...data } = parsed.data;

    const rule = await prisma.pricingRule.upsert({
      where: { vehicleType },
      update: data,
      create: { vehicleType, ...data },
    });

    return successResponse(rule, `Pricing updated for ${vehicleType}`);
  } catch (error) {
    console.error("[ADMIN] Update pricing error:", error);
    return errorResponse("Failed to update pricing", 500);
  }
}
