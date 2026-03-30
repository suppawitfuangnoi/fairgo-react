import { VehicleType } from "@prisma/client";

/**
 * Default pricing rules for Thailand (in THB)
 * These are used as fallback when database pricing rules are not available
 */
const DEFAULT_PRICING: Record<VehicleType, {
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
}> = {
  TAXI: {
    baseFare: 35,
    perKmRate: 6.5,
    perMinuteRate: 2,
    minimumFare: 35,
  },
  MOTORCYCLE: {
    baseFare: 25,
    perKmRate: 5,
    perMinuteRate: 1.5,
    minimumFare: 25,
  },
  TUKTUK: {
    baseFare: 40,
    perKmRate: 8,
    perMinuteRate: 2.5,
    minimumFare: 40,
  },
};

export interface FareEstimate {
  recommendedFare: number;
  fareMin: number;
  fareMax: number;
  estimatedDistance: number;
  estimatedDuration: number;
}

/**
 * Calculate recommended fare based on distance and duration
 */
export function calculateFareEstimate(
  vehicleType: VehicleType,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier = 1.0
): FareEstimate {
  const pricing = DEFAULT_PRICING[vehicleType];

  const rawFare =
    pricing.baseFare +
    pricing.perKmRate * distanceKm +
    pricing.perMinuteRate * durationMinutes;

  const recommendedFare = Math.max(
    Math.round(rawFare * surgeMultiplier),
    pricing.minimumFare
  );

  return {
    recommendedFare,
    fareMin: Math.round(recommendedFare * 0.85), // 15% below recommended
    fareMax: Math.round(recommendedFare * 1.2),  // 20% above recommended
    estimatedDistance: distanceKm,
    estimatedDuration: durationMinutes,
  };
}

/**
 * Haversine formula to calculate distance between two coordinates
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Estimate duration based on distance (rough estimate)
 * Average speed: 25 km/h in Bangkok traffic
 */
export function estimateDuration(distanceKm: number): number {
  const avgSpeedKmH = 25;
  return Math.ceil((distanceKm / avgSpeedKmH) * 60);
}
