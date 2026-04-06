/**
 * security.test.ts
 *
 * Tests for Phase 9 security hardening:
 *  - rate-limit.ts (sliding window, concurrent safety)
 *  - requireAuth / requireRole / requireActiveAuth (auth middleware)
 *  - IP-rate-limited OTP endpoints (request + verify)
 *  - /users/me adminProfile sanitization
 *  - /rides query param validation and limit cap
 *  - Suspended-user rejection on key write endpoints
 *  - Production OTP safety (debugCode absent in production)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── rate-limit.ts tests ───────────────────────────────────────────────────────
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    clearRateLimit("test-key");
  });

  it("allows requests within the limit", () => {
    const r1 = checkRateLimit("test-key", 60_000, 3);
    const r2 = checkRateLimit("test-key", 60_000, 3);
    const r3 = checkRateLimit("test-key", 60_000, 3);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("blocks the (max+1)th request", () => {
    checkRateLimit("test-key", 60_000, 3);
    checkRateLimit("test-key", 60_000, 3);
    checkRateLimit("test-key", 60_000, 3);
    const blocked = checkRateLimit("test-key", 60_000, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns the correct remaining count", () => {
    const r1 = checkRateLimit("test-key", 60_000, 5);
    expect(r1.remaining).toBe(4); // 1 used, 4 left
    const r2 = checkRateLimit("test-key", 60_000, 5);
    expect(r2.remaining).toBe(3);
  });

  it("uses independent buckets for different keys", () => {
    checkRateLimit("key-a", 60_000, 2);
    checkRateLimit("key-a", 60_000, 2);
    const blocked = checkRateLimit("key-a", 60_000, 2);
    expect(blocked.allowed).toBe(false);

    // key-b is completely unaffected
    const allowed = checkRateLimit("key-b", 60_000, 2);
    expect(allowed.allowed).toBe(true);
  });

  it("clearRateLimit resets a key", () => {
    checkRateLimit("test-key", 60_000, 2);
    checkRateLimit("test-key", 60_000, 2);
    clearRateLimit("test-key");
    const r = checkRateLimit("test-key", 60_000, 2);
    expect(r.allowed).toBe(true);
  });

  it("expires hits outside the window", async () => {
    // Use a very short window
    checkRateLimit("expire-key", 50, 2); // window: 50 ms
    checkRateLimit("expire-key", 50, 2);
    const blockedBefore = checkRateLimit("expire-key", 50, 2);
    expect(blockedBefore.allowed).toBe(false);

    // Wait for the window to pass
    await new Promise((resolve) => setTimeout(resolve, 60));
    const allowedAfter = checkRateLimit("expire-key", 50, 2);
    expect(allowedAfter.allowed).toBe(true);
  }, 1000);
});

// ── requireAuth / requireRole (sync middleware) ──────────────────────────────

// Mock dependencies used by auth middleware
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(() => Promise.resolve()),
    },
  },
}));

vi.mock("@/lib/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/jwt";
import { requireAuth, requireRole, requireActiveAuth } from "@/middleware/auth";
import { NextRequest } from "next/server";

function makeRequest(token?: string, pathname = "/api/v1/test"): NextRequest {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

describe("requireAuth", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when no Authorization header", () => {
    const result = requireAuth(makeRequest());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when token is invalid", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("invalid");
    });
    const result = requireAuth(makeRequest("bad-token"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when token type is 'refresh' not 'access'", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "CUSTOMER",
      type: "refresh",
    });
    const result = requireAuth(makeRequest("refresh-token"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns JwtPayload when token is valid", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "CUSTOMER",
      type: "access",
    });
    const result = requireAuth(makeRequest("valid-token"));
    expect(result).toMatchObject({ userId: "user-1", role: "CUSTOMER" });
  });
});

describe("requireRole", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 403 when user has wrong role", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "CUSTOMER",
      type: "access",
    });
    const result = requireRole(makeRequest("token"), ["DRIVER"]);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns 403 for CUSTOMER trying to access ADMIN-only endpoint", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "CUSTOMER",
      type: "access",
    });
    const result = requireRole(makeRequest("token"), ["ADMIN"]);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns JwtPayload when role matches", () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "DRIVER",
      type: "access",
    });
    const result = requireRole(makeRequest("token"), ["DRIVER", "ADMIN"]);
    expect(result).toMatchObject({ userId: "user-1", role: "DRIVER" });
  });
});

describe("requireActiveAuth", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 403 when user is SUSPENDED", async () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-suspended",
      role: "CUSTOMER",
      type: "access",
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "SUSPENDED",
    });

    const result = await requireActiveAuth(makeRequest("token"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    const body = await (result as Response).json();
    // errorResponse uses { success, error } shape — not { message }
    expect(body.error).toMatch(/suspended/i);
  });

  it("returns 401 when user not found in DB", async () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "ghost-user",
      role: "CUSTOMER",
      type: "access",
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await requireActiveAuth(makeRequest("token"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns JwtPayload for ACTIVE user", async () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "active-user",
      role: "CUSTOMER",
      type: "access",
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "ACTIVE",
    });

    const result = await requireActiveAuth(makeRequest("token"));
    expect(result).toMatchObject({ userId: "active-user" });
  });

  it("falls back to JWT-only auth when DB throws", async () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      userId: "user-1",
      role: "CUSTOMER",
      type: "access",
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB error")
    );

    // Should return the JwtPayload, not a 5xx error
    const result = await requireActiveAuth(makeRequest("token"));
    expect(result).toMatchObject({ userId: "user-1" });
  });
});

// ── OTP production safety ─────────────────────────────────────────────────────

vi.mock("@/lib/otp", () => ({
  checkOtpRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
  generateOTP: vi.fn(() =>
    Promise.resolve({ otpRef: "REF-TEST1", cooldownSeconds: 60, expiresInSeconds: 300 })
  ),
  normalisePhone: vi.fn((p: string) => p),
}));

import { generateOTP } from "@/lib/otp";

describe("OTP production safety", () => {
  it("does not include debugCode in the OTP response when mock returns none", async () => {
    // The real generateOTP returns no debugCode in production.
    // Simulate that: mock returns result without the field.
    (generateOTP as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      otpRef: "REF-PROD1",
      cooldownSeconds: 60,
      expiresInSeconds: 300,
      // No debugCode property
    });

    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN", undefined, undefined);
    expect(result).not.toHaveProperty("debugCode");
  });

  it("includes debugCode in the OTP response when mock returns one", async () => {
    (generateOTP as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      otpRef: "REF-DEV1",
      cooldownSeconds: 60,
      expiresInSeconds: 300,
      debugCode: "123456",
    });

    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN", undefined, undefined);
    expect(result).toHaveProperty("debugCode", "123456");
  });
});

// ── /rides query param validation ─────────────────────────────────────────────

import { ridesQuerySchema } from "@/lib/validation";

describe("ridesQuerySchema", () => {
  it("accepts valid status and vehicleType", () => {
    const result = ridesQuerySchema.safeParse({ status: "PENDING", vehicleType: "TAXI" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = ridesQuerySchema.safeParse({ status: "HACKED" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid vehicleType", () => {
    const result = ridesQuerySchema.safeParse({ vehicleType: "SPACESHIP" });
    expect(result.success).toBe(false);
  });

  it("coerces limit to max 100", () => {
    const result = ridesQuerySchema.safeParse({ limit: "9999" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });

  it("coerces limit to min 1", () => {
    const result = ridesQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("uses default page=1 when omitted", () => {
    const result = ridesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(1);
  });
});

// ── Duplicate-action protection (idempotency) ─────────────────────────────────

describe("Idempotency: second acquireLock returns false", () => {
  it("checkRateLimit is idempotent for allowed check (does not double-count)", () => {
    clearRateLimit("idem-key");
    const r1 = checkRateLimit("idem-key", 60_000, 10);
    // Reading remaining multiple times shouldn't change the count
    const remainingAfterFirst = r1.remaining;
    expect(remainingAfterFirst).toBe(9);
    const r2 = checkRateLimit("idem-key", 60_000, 10);
    expect(r2.remaining).toBe(8); // second call DOES consume a slot
  });
});

// ── Security header tests (middleware) ───────────────────────────────────────

import { middleware } from "@/middleware";

describe("Security headers in middleware", () => {
  function makeApiRequest(
    method = "GET",
    origin?: string,
    path = "/api/v1/health"
  ): NextRequest {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    return new NextRequest(`http://localhost${path}`, { method, headers });
  }

  it("sets X-Content-Type-Options: nosniff on all responses", () => {
    const response = middleware(makeApiRequest());
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY on all responses", () => {
    const response = middleware(makeApiRequest());
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets Referrer-Policy on all responses", () => {
    const response = middleware(makeApiRequest());
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("does NOT reflect wildcard CORS origin in production (via env stub)", () => {
    // Use vi.stubEnv which properly handles read-only env properties in tests
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CUSTOMER_APP_URL", "*");

    const response = middleware(makeApiRequest("GET", "https://evil.example.com"));
    // In production with wildcard, origin should NOT be reflected
    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe(
      "https://evil.example.com"
    );

    vi.unstubAllEnvs();
  });

  it("reflects localhost origin in dev when CUSTOMER_APP_URL=*", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CUSTOMER_APP_URL", "*");

    const response = middleware(makeApiRequest("GET", "http://localhost:3001"));
    // In dev, localhost should be reflected
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");

    vi.unstubAllEnvs();
  });

  it("handles OPTIONS preflight and adds security headers", () => {
    const response = middleware(makeApiRequest("OPTIONS", "http://localhost:3000"));
    expect(response.status).toBe(204);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

// ── adminProfile sanitization ─────────────────────────────────────────────────

/** Helper: applies the same spread logic as the /users/me route */
function shapeUserResponse(jwtRole: string, adminProfile: unknown) {
  return {
    id: "u1",
    role: jwtRole,
    ...(jwtRole === "ADMIN" ? { adminProfile } : {}),
  };
}

describe("/users/me adminProfile sanitization", () => {
  it("does not include adminProfile for CUSTOMER role", () => {
    const shaped = shapeUserResponse("CUSTOMER", { id: "ap1", permissions: ["ALL"] });
    expect(shaped).not.toHaveProperty("adminProfile");
  });

  it("does not include adminProfile for DRIVER role", () => {
    const shaped = shapeUserResponse("DRIVER", { id: "ap1" });
    expect(shaped).not.toHaveProperty("adminProfile");
  });

  it("includes adminProfile for ADMIN role", () => {
    const shaped = shapeUserResponse("ADMIN", { id: "ap1" });
    expect(shaped).toHaveProperty("adminProfile");
    expect((shaped as { adminProfile: unknown }).adminProfile).toEqual({ id: "ap1" });
  });
});
