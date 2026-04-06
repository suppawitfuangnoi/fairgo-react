/**
 * auth.ts — Authentication & authorization middleware helpers
 *
 * Three tiers:
 *  1. extractUser      — parse JWT only, no DB hit
 *  2. requireAuth      — JWT must be valid; returns 401 if not
 *  3. requireActiveAuth— JWT must be valid AND user must not be SUSPENDED (DB lookup)
 *  4. requireRole      — requireAuth + role allowlist check
 *  5. requireActiveRole— requireActiveAuth + role allowlist check
 *
 * Use requireActiveAuth / requireActiveRole on any write operation where
 * a suspended user must not be allowed to proceed (offer submit, trip
 * status change, confirm payment, etc.).
 *
 * Security notes:
 *  - JWT payload never contains suspension status (tokens live for 24 h);
 *    a freshly suspended user would retain access without the DB check.
 *  - The DB check adds one SELECT per call.  For the custom single-process
 *    server this is acceptable.  Cache if throughput demands it.
 */

import { NextRequest } from "next/server";
import { verifyAccessToken, JwtPayload } from "@/lib/jwt";
import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export interface AuthenticatedRequest extends NextRequest {
  user?: JwtPayload;
}

// ── JWT-only helpers (no DB) ───────────────────────────────────────────────

export function extractUser(request: NextRequest): JwtPayload | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(request: NextRequest): JwtPayload | Response {
  const user = extractUser(request);
  if (!user) {
    return errorResponse("Unauthorized: Invalid or missing token", 401) as unknown as Response;
  }
  return user;
}

export function requireRole(request: NextRequest, roles: string[]): JwtPayload | Response {
  const result = requireAuth(request);
  if (!("userId" in (result as object))) return result;

  const user = result as JwtPayload;
  if (!roles.includes(user.role)) {
    // Log unauthorized role access attempts (best-effort)
    writeAuditLog({
      userId: user.userId,
      action: "UNAUTHORIZED_ROLE_ACCESS",
      entity: "Endpoint",
      entityId: request.nextUrl.pathname,
      newData: { requiredRoles: roles, actualRole: user.role },
      ipAddress: getClientIp(request),
    }).catch(() => {});

    return errorResponse("Forbidden: Insufficient permissions", 403) as unknown as Response;
  }
  return user;
}

// ── DB-backed helpers (check suspension status) ───────────────────────────

/**
 * Like requireAuth but also verifies the user account is ACTIVE in the DB.
 * Returns 403 if the user is SUSPENDED.
 */
export async function requireActiveAuth(
  request: NextRequest
): Promise<JwtPayload | Response> {
  const jwtResult = requireAuth(request);
  if (!("userId" in (jwtResult as object))) return jwtResult;

  const user = jwtResult as JwtPayload;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { status: true },
    });

    if (!dbUser) {
      return errorResponse("User account not found", 401) as unknown as Response;
    }

    if (dbUser.status === "SUSPENDED") {
      writeAuditLog({
        userId: user.userId,
        action: "SUSPENDED_USER_ACCESS_ATTEMPT",
        entity: "Endpoint",
        entityId: request.nextUrl.pathname,
        ipAddress: getClientIp(request),
      }).catch(() => {});

      return errorResponse(
        "Your account has been suspended. Please contact support.",
        403
      ) as unknown as Response;
    }
  } catch {
    // On DB error, fall back to JWT-only auth to avoid availability issues
    console.error("[AUTH] requireActiveAuth DB check failed — falling back to JWT-only");
  }

  return user;
}

/**
 * requireActiveAuth + role allowlist.
 */
export async function requireActiveRole(
  request: NextRequest,
  roles: string[]
): Promise<JwtPayload | Response> {
  const result = await requireActiveAuth(request);
  if (!("userId" in (result as object))) return result;

  const user = result as JwtPayload;
  if (!roles.includes(user.role)) {
    writeAuditLog({
      userId: user.userId,
      action: "UNAUTHORIZED_ROLE_ACCESS",
      entity: "Endpoint",
      entityId: request.nextUrl.pathname,
      newData: { requiredRoles: roles, actualRole: user.role },
      ipAddress: getClientIp(request),
    }).catch(() => {});

    return errorResponse("Forbidden: Insufficient permissions", 403) as unknown as Response;
  }
  return user;
}
