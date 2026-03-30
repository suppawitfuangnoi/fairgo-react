import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  adminNote: z.string().optional(),
  resolution: z.string().optional(),
});

// GET /api/v1/admin/disputes/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, role: true } },
        trip: {
          include: {
            rideRequest: {
              include: {
                customerProfile: { include: { user: { select: { name: true, phone: true } } } },
              },
            },
            driverProfile: { include: { user: { select: { name: true, phone: true } } } },
            payment: true,
          },
        },
      },
    });

    if (!ticket) return errorResponse("Ticket not found", 404);
    return successResponse(ticket);
  } catch (error) {
    console.error("[ADMIN] Get dispute error:", error);
    return errorResponse("Failed to get dispute", 500);
  }
}

// PATCH /api/v1/admin/disputes/[id] — update status/resolution
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.priority && { priority: parsed.data.priority }),
        ...(parsed.data.resolution && { resolution: parsed.data.resolution }),
        ...(parsed.data.status === "RESOLVED" && { resolvedAt: new Date() }),
      },
    });

    return successResponse(updated, "Dispute updated successfully");
  } catch (error) {
    console.error("[ADMIN] Update dispute error:", error);
    return errorResponse("Failed to update dispute", 500);
  }
}
