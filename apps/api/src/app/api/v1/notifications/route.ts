import { NextRequest } from "next/server";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications";

/**
 * GET /api/v1/notifications
 * Query params: page, limit, unread=true
 * Response includes unreadCount so bell badge can update in one call.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const page  = parseInt(request.nextUrl.searchParams.get("page")  || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";

    const result = await listNotifications({ userId: user.userId, page, limit, unreadOnly });
    return successResponse(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFICATIONS] GET error:", error);
    return errorResponse(`Failed to get notifications: ${msg}`, 500);
  }
}

/**
 * PATCH /api/v1/notifications
 * Mark ALL unread notifications as read for the authenticated user.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const count = await markAllNotificationsRead(user.userId);
    return successResponse({ updated: count }, "All notifications marked as read");
  } catch (error) {
    console.error("[NOTIFICATIONS] PATCH error:", error);
    return errorResponse("Failed to update notifications", 500);
  }
}
