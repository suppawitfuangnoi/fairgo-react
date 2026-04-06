import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        customerProfile: {
          include: { wallet: true },
        },
        driverProfile: {
          include: {
            vehicles: true,
            documents: true,
            wallet: true,
          },
        },
        _count: {
          select: {
            ratingsGiven: true,
            ratingsReceived: true,
            supportTickets: true,
          },
        },
      },
    });

    if (!user) return errorResponse("User not found", 404);

    return successResponse(user);
  } catch (error) {
    console.error("[ADMIN] Get user error:", error);
    return errorResponse("Failed to get user", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.errors[0]?.message || "Invalid data", 400);

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, role: true, name: true },
    });
    if (!existingUser) return errorResponse("User not found", 404);

    // Admins cannot modify other admins' status
    if (existingUser.role === "ADMIN" && parsed.data.status) {
      return errorResponse("Cannot modify status of admin accounts", 403);
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.status) updateData.status = parsed.data.status;
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
    if (parsed.data.phone) updateData.phone = parsed.data.phone;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, phone: true, email: true, role: true, status: true },
    });

    // If driver is suspended, force them offline
    if (parsed.data.status === "SUSPENDED" && existingUser.role === "DRIVER") {
      await prisma.driverProfile.updateMany({
        where: { userId: id },
        data: { isOnline: false },
      });
    }

    // Write audit log
    await writeAuditLog({
      userId: admin.userId,
      action: parsed.data.status ? `UPDATE_USER_STATUS_${parsed.data.status}` : "UPDATE_USER",
      entity: "User",
      entityId: id,
      oldData: existingUser,
      newData: updateData,
      ipAddress: getClientIp(request),
    });

    return successResponse(user, "User updated successfully");
  } catch (error) {
    console.error("[ADMIN] Update user error:", error);
    return errorResponse("Failed to update user", 500);
  }
}
