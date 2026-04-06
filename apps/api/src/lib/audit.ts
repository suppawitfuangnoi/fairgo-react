import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface AuditLogParams {
  userId?: string;       // Who performed the action
  action: string;        // e.g. "APPROVE_DRIVER", "BLOCK_USER", "UPDATE_TRIP_STATUS"
  entity: string;        // e.g. "DriverProfile", "User", "Trip"
  entityId?: string;     // ID of the affected entity
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Records an audit log entry for critical system actions.
 * Silently swallows errors to prevent audit logging from breaking business logic.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldData: params.oldData as Prisma.InputJsonValue | undefined,
        newData: params.newData as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    // Log audit errors to console but don't throw — audit must not block business logic
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}

export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}
