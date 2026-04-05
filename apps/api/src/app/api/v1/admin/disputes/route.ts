import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/v1/admin/disputes — list support tickets as disputes
export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const status = request.nextUrl.searchParams.get("status");
    const priority = request.nextUrl.searchParams.get("priority");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [rawTickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    // Reshape to front-end Dispute shape
    const tickets = rawTickets.map((t) => ({
      id: t.id,
      title: t.subject,
      description: t.description,
      priority: t.priority,
      status: t.status,
      reporter: t.user?.name ?? "Unknown",
      tripId: t.tripId ?? undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return successResponse({
      tickets,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ADMIN] List disputes error:", error);
    return errorResponse("Failed to list disputes", 500);
  }
}
