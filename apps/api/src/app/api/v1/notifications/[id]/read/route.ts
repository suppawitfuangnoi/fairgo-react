import { NextRequest } from "next/server";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { markNotificationRead } from "@/lib/notifications";

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read (sets readAt timestamp).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const { id } = await params;
    const updated = await markNotificationRead(id, user.userId);
    if (!updated) return errorResponse("Notification not found", 404);
    return successResponse(null, "Marked as read");
  } catch (error) {
    console.error("[NOTIFICATIONS] mark-read error:", error);
    return errorResponse("Failed to update notification", 500);
  }
}
