import { NextRequest } from "next/server";
import { verifyAccessToken, JwtPayload } from "@/lib/jwt";
import { errorResponse } from "@/lib/api-response";

export interface AuthenticatedRequest extends NextRequest {
  user?: JwtPayload;
}

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
  if ("userId" in (result as JwtPayload)) {
    const user = result as JwtPayload;
    if (!roles.includes(user.role)) {
      return errorResponse("Forbidden: Insufficient permissions", 403) as unknown as Response;
    }
    return user;
  }
  return result;
}
