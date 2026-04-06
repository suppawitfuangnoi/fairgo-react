/**
 * POST /api/v1/admin/users/:id/suspend   — suspend a user with an explicit reason
 * POST /api/v1/admin/users/:id/unsuspend — reinstate a suspended user
 *
 * Both require ADMIN role.  Admin-on-admin actions are blocked.
 * Both write an AuditLog entry.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const SuspendSchema = z.object({
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id } = await params;

    // Determine suspend vs unsuspend from URL path segment
    // /unsuspend contains "suspend" as substring, so check for /unsuspend first
    const isSuspend = !request.url.includes("/unsuspend");

    // Parse body (only required for suspend)
    let reason: string | undefined;
    if (isSuspend) {
      const body = await request.json().catch(() => ({}));
      const parsed = SuspendSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(parsed.error.errors[0]?.message || "Reason required", 400);
      }
      reason = parsed.data.reason;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, name: true },
    });
    if (!user) return errorResponse("User not found", 404);
    if (user.role === "ADMIN") return errorResponse("Cannot suspend admin accounts", 403);

    // Idempotency: already in target state
    const targetStatus = isSuspend ? "SUSPENDED" : "ACTIVE";
    if (user.status === targetStatus) {
      return successResponse({ id, status: targetStatus }, `User is already ${targetStatus.toLowerCase()}`);
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { status: targetStatus };
    if (isSuspend) {
      updateData.suspendedReason = reason;
      updateData.suspendedAt = now;
      // Force driver offline if applicable
    } else {
      updateData.suspendedReason = null;
      updateData.suspendedAt = null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, phone: true, role: true, status: true, suspendedReason: true, suspendedAt: true },
    });

    // Force driver offline on suspension
    if (isSuspend && user.role === "DRIVER") {
      await prisma.driverProfile.updateMany({
        where: { userId: id },
        data: { isOnline: false },
      });
    }

    await writeAuditLog({
      userId: admin.userId,
      action: isSuspend ? "SUSPEND_USER" : "UNSUSPEND_USER",
      entity: "User",
      entityId: id,
      oldData: { status: user.status },
      newData: { status: targetStatus, ...(isSuspend ? { suspendedReason: reason } : {}) },
      ipAddress: getClientIp(request),
    });

    return successResponse(updated, `User ${isSuspend ? "suspended" : "reinstated"} successfully`);
  } catch (error) {
    console.error("[ADMIN] Suspend/unsuspend user error:", error);
    return errorResponse("Failed to update user suspension", 500);
  }
}
