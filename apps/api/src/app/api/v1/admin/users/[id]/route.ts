import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateUserStatusSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";

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
    const result = await validateBody(request, updateUserStatusSchema);
    if ("error" in result) return result.error;

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, role: true, name: true },
    });
    if (!existingUser) return errorResponse("User not found", 404);

    // Admins cannot suspend other admins
    if (existingUser.role === "ADMIN") {
      return errorResponse("Cannot modify status of admin accounts", 403);
    }

    const newStatus = result.data.status;

    const user = await prisma.user.update({
      where: { id },
      data: { status: newStatus },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    // If driver is suspended, force them offline
    if (newStatus === "SUSPENDED" && existingUser.role === "DRIVER") {
      await prisma.driverProfile.updateMany({
        where: { userId: id },
        data: { isOnline: false },
      });
    }

    // Write audit log
    const actionMap: Record<string, string> = {
      SUSPENDED: "SUSPEND_USER",
      ACTIVE: "UNSUSPEND_USER",
      INACTIVE: "DEACTIVATE_USER",
    };
    await writeAuditLog({
      userId: admin.userId,
      action: actionMap[newStatus] ?? "UPDATE_USER_STATUS",
      entity: "User",
      entityId: id,
      oldData: { status: existingUser.status },
      newData: { status: newStatus },
      ipAddress: getClientIp(request),
    });

    return successResponse(user, `User status updated to ${newStatus}`);
  } catch (error) {
    console.error("[ADMIN] Update user error:", error);
    return errorResponse("Failed to update user", 500);
  }
}
