/**
 * POST /api/v1/admin/drivers/:id/verify
 * Approve or reject a driver's verification application.
 *
 * Body: { status: "APPROVED" | "REJECTED", rejectionReason?: string }
 * - rejectionReason is required when status = "REJECTED"
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const VerifyDriverSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().min(3).max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id: driverProfileId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = VerifyDriverSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.errors[0]?.message || "Invalid data", 400);

    const { status: verificationStatus, rejectionReason } = parsed.data;

    // Rejection requires a reason
    if (verificationStatus === "REJECTED" && !rejectionReason) {
      return errorResponse("Rejection reason is required when rejecting a driver", 400);
    }

    const profile = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });

    if (!profile) return errorResponse("Driver profile not found", 404);

    const updated = await prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: {
        verificationStatus,
        isVerified: verificationStatus === "APPROVED",
        ...(verificationStatus === "REJECTED" && rejectionReason
          ? { rejectionReason }
          : { rejectionReason: null }),
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    await writeAuditLog({
      userId: admin.userId,
      action: verificationStatus === "APPROVED" ? "APPROVE_DRIVER" : "REJECT_DRIVER",
      entity: "DriverProfile",
      entityId: driverProfileId,
      oldData: { verificationStatus: profile.verificationStatus, isVerified: profile.isVerified },
      newData: {
        verificationStatus,
        isVerified: updated.isVerified,
        ...(verificationStatus === "REJECTED" ? { rejectionReason } : {}),
      },
      ipAddress: getClientIp(request),
    });

    return successResponse(
      updated,
      `Driver ${verificationStatus === "APPROVED" ? "verified" : "rejected"}`
    );
  } catch (error) {
    console.error("[ADMIN] Verify driver error:", error);
    return errorResponse("Failed to verify driver", 500);
  }
}
