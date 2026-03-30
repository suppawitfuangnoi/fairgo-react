import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";

export async function PATCH(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["CUSTOMER", "DRIVER", "ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    await prisma.notification.updateMany({
      where: { userId: user.userId, isRead: false },
      data: { isRead: true },
    });
    return successResponse(null, "All notifications marked as read");
  } catch {
    return errorResponse("Failed to update notifications", 500);
  }
}
