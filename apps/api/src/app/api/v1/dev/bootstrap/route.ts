/**
 * Dev Bootstrap endpoint — protected by BOOTSTRAP_SECRET env var.
 * Use to:
 *  - Create the first admin user
 *  - Verify a driver by phone or userId
 *  - Get an admin JWT for testing
 *
 * Call:
 *   POST /api/v1/dev/bootstrap
 *   Headers: { "X-Bootstrap-Secret": "<value of BOOTSTRAP_SECRET env>" }
 *   Body: { "action": "verify_driver", "phone": "+66..." }
 *      or { "action": "create_admin", "phone": "+66...", "email": "...", "name": "..." }
 *      or { "action": "admin_token", "email": "..." }
 *
 * Set BOOTSTRAP_SECRET in Railway environment variables to enable.
 * Leave unset (or set to empty string) to disable this endpoint in production.
 */
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateAccessToken, generateRefreshToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit";

/**
 * Timing-safe string comparison to prevent timing attacks on the bootstrap secret.
 * A naive `===` comparison short-circuits on the first differing character, leaking
 * information about how many leading characters are correct.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function POST(request: NextRequest) {
  // ── Must be explicitly enabled via env var ────────────────────────────────
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret || secret.length < 16) {
    return errorResponse("Bootstrap endpoint is disabled", 403);
  }

  // ── IP rate limit: 5 attempts per 15 min ──────────────────────────────────
  const ip      = getClientIp(request) ?? "unknown";
  const ipLimit = checkRateLimit(`ip:${ip}:bootstrap`, 15 * 60_000, 5);
  if (!ipLimit.allowed) {
    return errorResponse("Too many bootstrap attempts. Try again later.", 429);
  }

  // ── Timing-safe secret comparison ─────────────────────────────────────────
  const providedSecret = request.headers.get("x-bootstrap-secret") ?? "";
  if (!timingSafeStringEqual(providedSecret, secret)) {
    writeAuditLog({
      action:   "BOOTSTRAP_SECRET_MISMATCH",
      entity:   "Bootstrap",
      newData:  { ip },
      ipAddress: ip,
    }).catch(() => {});
    return errorResponse("Invalid bootstrap secret", 403);
  }

  try {
    const body = await request.json();
    const { action } = body;

    // ── Verify a driver ────────────────────────────────────────────
    if (action === "verify_driver") {
      const { phone, userId } = body;
      if (!phone && !userId) return errorResponse("phone or userId required", 400);

      const user = userId
        ? await prisma.user.findFirst({ where: { id: userId, role: "DRIVER" } })
        : await prisma.user.findFirst({ where: { phone, role: "DRIVER" } });

      if (!user) return errorResponse("Driver user not found", 404);

      const profile = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return errorResponse("Driver profile not found", 404);

      const updated = await prisma.driverProfile.update({
        where: { id: profile.id },
        data: { isVerified: true, verificationStatus: "APPROVED" },
        include: { user: { select: { id: true, name: true, phone: true } } },
      });

      return successResponse(updated, `Driver ${updated.user.name} verified successfully`);
    }

    // ── Create first admin user ────────────────────────────────────
    if (action === "create_admin") {
      const { phone, email, name } = body;
      if (!phone || !email || !name) return errorResponse("phone, email, name required", 400);

      const existing = await prisma.user.findFirst({ where: { email, role: "ADMIN" } });
      if (existing) return errorResponse(`Admin with email ${email} already exists`, 409);

      const user = await prisma.user.create({
        data: {
          name,
          phone,
          email,
          role: "ADMIN",
          status: "ACTIVE",
          adminProfile: { create: {} },
        },
        select: { id: true, name: true, phone: true, email: true, role: true },
      });

      return successResponse(user, "Admin user created");
    }

    // ── Get admin JWT token by email ───────────────────────────────
    if (action === "admin_token") {
      const { email } = body;
      if (!email) return errorResponse("email required", 400);

      const user = await prisma.user.findFirst({
        where: { email, role: "ADMIN" },
        include: { adminProfile: true },
      });

      if (!user) return errorResponse("Admin user not found", 404);

      const accessToken = generateAccessToken(user.id, user.role);
      const refreshToken = generateRefreshToken(user.id, user.role);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return successResponse({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        accessToken,
        refreshToken,
        expiresIn: 86400,
      });
    }

    return errorResponse("Unknown action. Use: verify_driver | create_admin | admin_token", 400);
  } catch (error) {
    console.error("[BOOTSTRAP]", error);
    return errorResponse("Bootstrap action failed", 500);
  }
}
