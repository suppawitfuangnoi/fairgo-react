import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { registerVehicleSchema } from "@/lib/validation";
import { JwtPayload } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const profile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!profile) return errorResponse("Driver profile not found", 404);

    const vehicles = await prisma.vehicle.findMany({
      where: { driverProfileId: profile.id },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(vehicles);
  } catch (error) {
    console.error("[VEHICLES] List error:", error);
    return errorResponse("Failed to list vehicles", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["DRIVER"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const result = await validateBody(request, registerVehicleSchema);
    if ("error" in result) return result.error;

    const profile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
    });
    if (!profile) return errorResponse("Driver profile not found", 404);

    const vehicle = await prisma.vehicle.create({
      data: {
        ...result.data,
        driverProfileId: profile.id,
      },
    });

    return successResponse(vehicle, "Vehicle registered successfully", 201);
  } catch (error) {
    console.error("[VEHICLES] Register error:", error);
    return errorResponse("Failed to register vehicle", 500);
  }
}
