import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { updateUserStatusSchema } from "@/lib/validation";

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

    const { id } = await params;
    const result = await validateBody(request, updateUserStatusSchema);
    if ("error" in result) return result.error;

    const user = await prisma.user.update({
      where: { id },
      data: { status: result.data.status },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    return successResponse(user, `User status updated to ${result.data.status}`);
  } catch (error) {
    console.error("[ADMIN] Update user error:", error);
    return errorResponse("Failed to update user", 500);
  }
}
