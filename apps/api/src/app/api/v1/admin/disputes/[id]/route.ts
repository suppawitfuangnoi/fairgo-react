/**
 * GET  /api/v1/admin/disputes/:id   — Full dispute detail
 * PATCH /api/v1/admin/disputes/:id  — Update status / resolution
 *
 * PATCH rules (Phase 6):
 *   - When status is set to RESOLVED or CLOSED:
 *     • SupportTicket.resolution is saved
 *     • SupportTicket.resolvedAt is set
 *     • Payment.disputeFlag is cleared (set to false)
 *     • Payment.disputeResolvedAt, disputeResolvedBy, disputeResolutionNote
 *       are stamped
 *     • Audit log is created
 *     • DISPUTE_RESOLVED notification is sent to the reporter
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { Notif } from "@/lib/notifications";

const UpdateSchema = z.object({
  status:     z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority:   z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  resolution: z.string().max(2000).optional(),
});

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const { id } = await params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, role: true } },
      },
    });
    if (!ticket) return errorResponse("Ticket not found", 404);

    // Separately fetch trip + payment if tripId is set
    let tripDetail = null;
    if (ticket.tripId) {
      tripDetail = await prisma.trip.findUnique({
        where: { id: ticket.tripId },
        include: {
          rideRequest: {
            include: {
              customerProfile: { include: { user: { select: { name: true, phone: true } } } },
            },
          },
          driverProfile: { include: { user: { select: { name: true, phone: true } } } },
          payment: true,
        },
      });
    }

    return successResponse({ ticket, trip: tripDetail });
  } catch (error) {
    console.error("[ADMIN] Get dispute error:", error);
    return errorResponse("Failed to get dispute", 500);
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return errorResponse("Ticket not found", 404);

    const isResolving =
      parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
    const now = new Date();

    // ── 1. Update the support ticket ─────────────────────────────────────────
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(parsed.data.status     && { status: parsed.data.status }),
        ...(parsed.data.priority   && { priority: parsed.data.priority }),
        ...(parsed.data.resolution && { resolution: parsed.data.resolution }),
        ...(isResolving            && { resolvedAt: now }),
      },
    });

    // ── 2. If resolving, clear the payment's disputeFlag ────────────────────
    let paymentUpdated = null;
    if (isResolving && ticket.tripId) {
      try {
        const payment = await prisma.payment.findUnique({ where: { tripId: ticket.tripId } });
        if (payment?.disputeFlag) {
          paymentUpdated = await prisma.payment.update({
            where: { id: payment.id },
            data: {
              disputeFlag:           false,
              disputeResolvedAt:     now,
              disputeResolvedBy:     admin.userId,
              disputeResolutionNote: parsed.data.resolution ?? "Resolved by admin",
            },
          });

          // ── Audit log ────────────────────────────────────────────────────
          await prisma.auditLog.create({
            data: {
              userId:   admin.userId,
              action:   "DISPUTE_RESOLVED",
              entity:   "Payment",
              entityId: payment.id,
              newData:  {
                ticketId:   id,
                resolution: parsed.data.resolution,
                resolvedAt: now,
              } as object,
            },
          });

          // ── Notify the reporter ──────────────────────────────────────────
          await Notif.disputeResolved(
            ticket.userId,
            ticket.tripId,
            id,
            parsed.data.resolution ?? "Your dispute has been reviewed and resolved."
          );
        }
      } catch (err) {
        // Non-fatal — ticket already updated above
        console.error("[ADMIN DISPUTES] Payment flag clear error:", err);
      }
    }

    return successResponse(
      { ticket: updated, paymentUpdated },
      "Dispute updated successfully"
    );
  } catch (error) {
    console.error("[ADMIN] Update dispute error:", error);
    return errorResponse("Failed to update dispute", 500);
  }
}
