import { NextRequest } from "next/server";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { fareEstimateSchema } from "@/lib/validation";
import {
  calculateDistance,
  estimateDuration,
  calculateFareEstimate,
} from "@/lib/pricing";

export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const result = await validateBody(request, fareEstimateSchema);
    if ("error" in result) return result.error;

    const { vehicleType, pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude } =
      result.data;

    const distanceKm = calculateDistance(
      pickupLatitude,
      pickupLongitude,
      dropoffLatitude,
      dropoffLongitude
    );

    // Add 30% to straight-line distance for road distance approximation
    const roadDistanceKm = distanceKm * 1.3;
    const durationMinutes = estimateDuration(roadDistanceKm);

    const estimate = calculateFareEstimate(
      vehicleType,
      roadDistanceKm,
      durationMinutes
    );

    return successResponse({
      vehicleType,
      ...estimate,
      currency: "THB",
    });
  } catch (error) {
    console.error("[RIDES] Fare estimate error:", error);
    return errorResponse("Failed to calculate fare estimate", 500);
  }
}
