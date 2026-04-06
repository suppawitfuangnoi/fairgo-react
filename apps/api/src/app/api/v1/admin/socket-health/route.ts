/**
 * GET /api/v1/admin/socket-health
 *
 * Returns real-time socket / presence health for the admin monitoring panel.
 *
 * Response shape:
 * {
 *   totalOnlineSockets: number,
 *   onlineDrivers: DriverPresence[],
 *   staleDrivers: DriverPresence[],   // heartbeat age > 2 min but socket still held
 *   reconnectingDrivers: string[],    // userId list (socket dropped, not yet timed out)
 *   snapshot_at: string               // ISO timestamp
 * }
 */
import { NextRequest } from "next/server";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

interface DriverPresence {
  userId: string;
  lat: number;
  lng: number;
  vehicleType?: string;
  lastHeartbeatAt: number;
  heartbeatAgeMs: number;
  isInTrip: boolean;
  updatedAt: number;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    // Access in-memory maps stored on global by server.ts
    const onlineDrivers: Map<string, {
      userId: string;
      lat: number;
      lng: number;
      vehicleType?: string;
      lastHeartbeatAt: number;
      isInTrip: boolean;
      updatedAt: number;
    }> = (global as Record<string, unknown>).__onlineDrivers as Map<string, never> ?? new Map();

    const userSockets: Map<string, string> =
      (global as Record<string, unknown>).__userSockets as Map<string, string> ?? new Map();

    const now = Date.now();

    const online: DriverPresence[] = [];
    const stale: DriverPresence[] = [];

    for (const [userId, loc] of onlineDrivers.entries()) {
      const ageMs = now - loc.lastHeartbeatAt;
      const presence: DriverPresence = {
        userId,
        lat: loc.lat,
        lng: loc.lng,
        vehicleType: loc.vehicleType,
        lastHeartbeatAt: loc.lastHeartbeatAt,
        heartbeatAgeMs: ageMs,
        isInTrip: loc.isInTrip,
        updatedAt: loc.updatedAt,
      };
      if (ageMs > STALE_THRESHOLD_MS) {
        stale.push(presence);
      } else {
        online.push(presence);
      }
    }

    return successResponse({
      totalOnlineSockets: userSockets.size,
      onlineDrivers: online,
      staleDrivers: stale,
      snapshot_at: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("[ADMIN] socket-health error:", error);
    return errorResponse("Failed to load socket health", 500);
  }
}
