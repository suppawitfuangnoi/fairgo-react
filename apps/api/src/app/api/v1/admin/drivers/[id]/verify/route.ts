import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { verifyDriverSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { JwtPayload } from "@/lib/jwt";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(request, ["ADMIN"]);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const admin = authResult as JwtPayload;

    const { id: driverProfileId } = await params;
    const result = await validateBody(request, verifyDriverSchema);
    if ("error" in result) return result.error;

    const { status: verificationStatus } = result.data;

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
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    // Write audit log
    await writeAuditLog({
      userId: admin.userId,
      action: verificationStatus === "APPROVED" ? "APPROVE_DRIVER" : "REJECT_DRIVER",
      entity: "DriverProfile",
      entityId: driverProfileId,
      oldData: { verificationStatus: profile.verificationStatus, isVerified: profile.isVerified },
      newData: { verificationStatus, isVerified: updated.isVerified },
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
