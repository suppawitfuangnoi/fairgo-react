/**
 * POST /api/v1/admin/users/:id/flag
 * Toggle isFlagged on a User.
 * Body: { flagged: boolean, reason?: string }
 * - flagged=true  → set isFlagged=true + reason + timestamps
 * - flagged=false → clear flag
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const FlagSchema = z.object({
  flagged: z.boolean(),
  reason: z.string().min(3).max(500).optional(),
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
    const body = await request.json().catch(() => ({}));
    const parsed = FlagSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.errors[0]?.message || "Invalid request", 400);

    const { flagged, reason } = parsed.data;
    if (flagged && !reason) return errorResponse("Reason required when flagging a user", 400);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, isFlagged: true },
    });
    if (!user) return errorResponse("User not found", 404);

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id },
      data: flagged
        ? { isFlagged: true, flagReason: reason, flaggedAt: now, flaggedBy: admin.userId }
        : { isFlagged: false, flagReason: null, flaggedAt: null, flaggedBy: null },
      select: { id: true, name: true, isFlagged: true, flagReason: true, flaggedAt: true },
    });

    await writeAuditLog({
      userId: admin.userId,
      action: flagged ? "FLAG_USER" : "UNFLAG_USER",
      entity: "User",
      entityId: id,
      oldData: { isFlagged: user.isFlagged },
      newData: { isFlagged: flagged, ...(flagged ? { flagReason: reason } : {}) },
      ipAddress: getClientIp(request),
    });

    return successResponse(updated, flagged ? "User flagged" : "User flag cleared");
  } catch (error) {
    console.error("[ADMIN] Flag user error:", error);
    return errorResponse("Failed to update user flag", 500);
  }
}
