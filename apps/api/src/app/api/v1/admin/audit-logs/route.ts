import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * GET /api/v1/admin/audit-logs
 * Returns paginated audit logs for admin monitoring.
 * Query params:
 *   action: filter by action type
 *   entity: filter by entity type
 *   userId: filter by user who performed the action
 *   page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50"), 200);
    const action = request.nextUrl.searchParams.get("action");
    const entity = request.nextUrl.searchParams.get("entity");
    const userId = request.nextUrl.searchParams.get("userId");

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return successResponse({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        userId: l.userId,
        userName: l.user?.name ?? "System",
        userRole: l.user?.role ?? "SYSTEM",
        oldData: l.oldData,
        newData: l.newData,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[ADMIN] Audit logs error:", error);
    return errorResponse("Failed to get audit logs", 500);
  }
}
