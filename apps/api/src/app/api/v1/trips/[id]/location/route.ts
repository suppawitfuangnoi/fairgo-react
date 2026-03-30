import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().optional(),
  speed: z.number().optional(),
  accuracy: z.number().optional(),
});

// POST /api/v1/trips/[id]/location — record GPS position during trip
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;
    const body = await request.json();
    const parsed = LocationSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    // Verify trip exists and is active
    const trip = await prisma.trip.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!trip) return errorResponse("Trip not found", 404);
    if (!["DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(trip.status)) {
      return errorResponse("Trip is not active", 400);
    }

    const location = await prisma.tripLocation.create({
      data: {
        tripId: id,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        heading: parsed.data.heading,
        speed: parsed.data.speed,
        accuracy: parsed.data.accuracy,
      },
    });

    // Emit via Socket.IO if available
    const io = (global as Record<string, unknown>).__socketIO;
    if (io && typeof (io as { to: (room: string) => { emit: (event: string, data: unknown) => void } }).to === "function") {
      const socketIo = io as { to: (room: string) => { emit: (event: string, data: unknown) => void } };
      socketIo.to(`trip:${id}`).emit("trip:driver:location", {
        tripId: id,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        heading: parsed.data.heading,
        speed: parsed.data.speed,
        timestamp: Date.now(),
      });
      socketIo.to("admin:monitor").emit("driver:location:update", {
        tripId: id,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        heading: parsed.data.heading,
        speed: parsed.data.speed,
        updatedAt: Date.now(),
      });
    }

    return successResponse(location);
  } catch (error) {
    console.error("[TRIPS] Location update error:", error);
    return errorResponse("Failed to update location", 500);
  }
}

// GET /api/v1/trips/[id]/location — get recent GPS trail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

    const locations = await prisma.tripLocation.findMany({
      where: { tripId: id },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return successResponse(locations.reverse()); // Return chronological order
  } catch (error) {
    console.error("[TRIPS] Get locations error:", error);
    return errorResponse("Failed to get trip locations", 500);
  }
}
