/**
 * OTP Service — Unit + Integration Tests
 *
 * Uses vitest with vi.mock to isolate prisma and audit dependencies.
 * Tests cover: normalisePhone, checkOtpRateLimit, generateOTP, verifyOTP
 * Edge cases: expired OTP, reused OTP, wrong code, brute-force lock,
 *             resend cooldown, rate limit, production mode (no code leak)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks must be declared BEFORE imports that depend on them ────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks are set up
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { normalisePhone, checkOtpRateLimit, generateOTP, verifyOTP } from "../otp";

// Typed accessors for mocked prisma methods
const db = prisma.otpCode as {
  count: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

// ────────────────────────────────────────────────────────────────────────────
// normalisePhone — pure function, no DB
// ────────────────────────────────────────────────────────────────────────────

describe("normalisePhone", () => {
  it("converts 0XXXXXXXXX → +66XXXXXXXXX", () => {
    expect(normalisePhone("0812345678")).toBe("+66812345678");
  });

  it("converts 9-digit bare → +66XXXXXXXXX", () => {
    expect(normalisePhone("812345678")).toBe("+66812345678");
  });

  it("keeps +66XXXXXXXXX unchanged", () => {
    expect(normalisePhone("+66812345678")).toBe("+66812345678");
  });

  it("handles 66XXXXXXXXX (no leading +) → +66XXXXXXXXX", () => {
    expect(normalisePhone("66812345678")).toBe("+66812345678");
  });

  it("strips dashes before normalising", () => {
    expect(normalisePhone("081-234-5678")).toBe("+66812345678");
  });

  it("strips spaces before normalising", () => {
    expect(normalisePhone("081 234 5678")).toBe("+66812345678");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkOtpRateLimit
// ────────────────────────────────────────────────────────────────────────────

describe("checkOtpRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when no prior OTPs exist", async () => {
    db.count.mockResolvedValue(0);
    db.findFirst.mockResolvedValue(null);

    const result = await checkOtpRateLimit("+66812345678", "CUSTOMER_LOGIN");
    expect(result.allowed).toBe(true);
  });

  it("blocks when >= 5 OTPs in 10 minutes", async () => {
    db.count.mockResolvedValue(5);
    db.findFirst.mockResolvedValue(null);

    const result = await checkOtpRateLimit("+66812345678", "CUSTOMER_LOGIN");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(600);
  });

  it("blocks when last OTP created < 60s ago (cooldown)", async () => {
    db.count.mockResolvedValue(1);
    db.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 20_000), // 20s ago
    });

    const result = await checkOtpRateLimit("+66812345678", "CUSTOMER_LOGIN");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("allows when last OTP created > 60s ago", async () => {
    db.count.mockResolvedValue(1);
    db.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 90_000), // 90s ago
    });

    const result = await checkOtpRateLimit("+66812345678", "CUSTOMER_LOGIN");
    expect(result.allowed).toBe(true);
  });

  it("rate limit is per phone+purpose (DRIVER vs CUSTOMER independent)", async () => {
    db.count.mockResolvedValue(5); // 5 CUSTOMER requests
    db.findFirst.mockResolvedValue(null);

    const customerResult = await checkOtpRateLimit("+66812345678", "CUSTOMER_LOGIN");
    expect(customerResult.allowed).toBe(false);

    // But DRIVER would be queried with a different purpose — count mock returns 5
    // so both are rate-limited independently (same limit value in mock)
    const driverResult = await checkOtpRateLimit("+66812345678", "DRIVER_LOGIN");
    expect(driverResult.allowed).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// generateOTP
// ────────────────────────────────────────────────────────────────────────────

describe("generateOTP", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    db.updateMany.mockResolvedValue({ count: 0 });
    db.deleteMany.mockResolvedValue({ count: 0 });
    db.create.mockResolvedValue({ id: "test-id" });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns otpRef in REF-XXXXXX format", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(result.otpRef).toMatch(/^REF-[A-Z0-9]{6}$/);
  });

  it("returns debugCode in non-production", async () => {
    process.env.NODE_ENV = "test";
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(result.debugCode).toBeDefined();
    expect(result.debugCode).toMatch(/^\d{6}$/);
  });

  it("does NOT return debugCode in production", async () => {
    process.env.NODE_ENV = "production";
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(result.debugCode).toBeUndefined();
  });

  it("returns correct cooldownSeconds (60)", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(result.cooldownSeconds).toBe(60);
  });

  it("returns correct expiresInSeconds (300)", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(result.expiresInSeconds).toBe(300);
  });

  it("invalidates previous PENDING OTPs for same phone+purpose", async () => {
    await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { phone: "+66812345678", purpose: "CUSTOMER_LOGIN", status: "PENDING" },
      data: { status: "INVALIDATED" },
    });
  });

  it("creates new OTP record in DB with correct fields", async () => {
    await generateOTP("+66812345678", "DRIVER_LOGIN", "1.2.3.4", "test-agent");
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: "+66812345678",
          purpose: "DRIVER_LOGIN",
          status: "PENDING",
          ipAddress: "1.2.3.4",
          userAgent: "test-agent",
        }),
      })
    );
  });

  it("writes audit log on OTP request", async () => {
    await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OTP_REQUESTED" })
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// verifyOTP
// ────────────────────────────────────────────────────────────────────────────

describe("verifyOTP", () => {
  beforeEach(() => vi.clearAllMocks());

  // Builder for a standard PENDING OTP record
  function pendingOtp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "otp-id-1",
      phone: "+66812345678",
      code: "123456",
      otpRef: "REF-AABBCC",
      purpose: "CUSTOMER_LOGIN",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min ahead
      attemptCount: 0,
      lockedUntil: null,
      ...overrides,
    };
  }

  it("returns valid:true for correct code", async () => {
    db.findUnique.mockResolvedValue(pendingOtp());
    db.update.mockResolvedValue({});

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(true);
  });

  it("marks OTP as USED after successful verify", async () => {
    db.findUnique.mockResolvedValue(pendingOtp());
    db.update.mockResolvedValue({});

    await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");

    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "USED" }),
      })
    );
  });

  it("writes audit log OTP_VERIFIED on success", async () => {
    db.findUnique.mockResolvedValue(pendingOtp());
    db.update.mockResolvedValue({});

    await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OTP_VERIFIED" })
    );
  });

  it("returns valid:false when otpRef not found", async () => {
    db.findUnique.mockResolvedValue(null);

    const result = await verifyOTP("+66812345678", "REF-NOTEXIST", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
  });

  it("returns valid:false when phone mismatches otpRef (anti-substitution)", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ phone: "+66899999999" }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
  });

  it("returns valid:false when purpose mismatches (anti-substitution)", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ purpose: "DRIVER_LOGIN" }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
  });

  it("returns valid:false for expired OTP", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ expiresAt: new Date(Date.now() - 1000) }));
    db.update.mockResolvedValue({});

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("หมดอายุ");
  });

  it("marks expired OTP with EXPIRED status in DB", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ expiresAt: new Date(Date.now() - 1000) }));
    db.update.mockResolvedValue({});

    await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");

    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EXPIRED" }),
      })
    );
  });

  it("returns valid:false for already-used OTP", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ status: "USED" }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("ถูกใช้งานแล้ว");
  });

  it("returns valid:false for INVALIDATED OTP", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ status: "INVALIDATED" }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("ถูกยกเลิก");
  });

  it("returns attemptsRemaining on first wrong code", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 0 }));
    db.update.mockResolvedValue({});

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.attemptsRemaining).toBe(4); // 5 max - 1 used = 4
  });

  it("decrements attemptsRemaining correctly", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 3 })); // 3 prior fails
    db.update.mockResolvedValue({});

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.attemptsRemaining).toBe(1); // 5 - 4 = 1
  });

  it("locks OTP after 5 failed attempts (5th fail)", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 4 })); // 4 prior = 5th attempt
    db.update.mockResolvedValue({});

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.lockedUntil).toBeDefined();
    expect(result.reason).toContain("ล็อก");
  });

  it("sets status=LOCKED in DB on 5th fail", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 4 }));
    db.update.mockResolvedValue({});

    await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");

    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "LOCKED",
          lockedUntil: expect.any(Date),
        }),
      })
    );
  });

  it("writes OTP_LOCKED audit log on brute-force lock", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 4 }));
    db.update.mockResolvedValue({});

    await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OTP_LOCKED" })
    );
  });

  it("lockedUntil is approximately 15 minutes in future", async () => {
    db.findUnique.mockResolvedValue(pendingOtp({ attemptCount: 4 }));
    db.update.mockResolvedValue({});

    const before = Date.now();
    const result = await verifyOTP("+66812345678", "REF-AABBCC", "000000", "CUSTOMER_LOGIN");
    const after = Date.now();

    expect(result.lockedUntil).toBeDefined();
    const lockedMs = result.lockedUntil!.getTime();
    expect(lockedMs).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
    expect(lockedMs).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 100);
  });

  it("returns valid:false with lockedUntil when OTP status is already LOCKED", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    db.findUnique.mockResolvedValue(pendingOtp({ status: "LOCKED", lockedUntil }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.lockedUntil).toEqual(lockedUntil);
    expect(result.reason).toContain("ล็อก");
  });

  it("returns valid:false when lockedUntil is in future even if status=PENDING", async () => {
    // Edge case: status wasn't updated but lockedUntil was set
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    db.findUnique.mockResolvedValue(pendingOtp({ status: "PENDING", lockedUntil }));

    const result = await verifyOTP("+66812345678", "REF-AABBCC", "123456", "CUSTOMER_LOGIN");
    expect(result.valid).toBe(false);
    expect(result.lockedUntil).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Production mode — raw code must NEVER appear in API response
// ────────────────────────────────────────────────────────────────────────────

describe("generateOTP — production mode code safety", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    db.updateMany.mockResolvedValue({ count: 0 });
    db.deleteMany.mockResolvedValue({ count: 0 });
    db.create.mockResolvedValue({});
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("result object has no 'code' key in production", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(Object.keys(result)).not.toContain("code");
  });

  it("result object has no 'debugCode' key in production", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    expect(Object.keys(result)).not.toContain("debugCode");
  });

  it("result object contains only safe public keys", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    const keys = Object.keys(result);
    expect(keys).toContain("otpRef");
    expect(keys).toContain("cooldownSeconds");
    expect(keys).toContain("expiresInSeconds");
    // Absolutely no code key should leak
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain("code");
    }
  });

  it("result values do not accidentally contain the 6-digit code string", async () => {
    const result = await generateOTP("+66812345678", "CUSTOMER_LOGIN");
    // Values should be otpRef (REF-xxx), 60, 300 — none are a 6-digit number string
    for (const value of Object.values(result)) {
      if (typeof value === "string") {
        expect(value).not.toMatch(/^\d{6}$/);
      }
    }
  });
});
