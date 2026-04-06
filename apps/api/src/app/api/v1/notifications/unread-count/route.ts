import { NextRequest } from "next/server";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { getUnreadCount } from "@/lib/notifications";

/**
 * GET /api/v1/notifications/unread-count
 * Lightweight endpoint for polling the badge count.
 * Response: { count: number }
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const count = await getUnreadCount(user.userId);
    return successResponse({ count });
  } catch (error) {
    console.error("[NOTIFICATIONS] unread-count error:", error);
    return errorResponse("Failed to get unread count", 500);
  }
}
