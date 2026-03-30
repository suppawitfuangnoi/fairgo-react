import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = requireRole(request, ["CUSTOMER", "DRIVER", "ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const notification = await prisma.notification.updateMany({
      where: { id: params.id, userId: user.userId },
      data: { isRead: true },
    });
    if (!notification.count) return errorResponse("Notification not found", 404);
    return successResponse(null, "Marked as read");
  } catch (error) {
    return errorResponse("Failed to update notification", 500);
  }
}
