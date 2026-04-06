/**
 * OTP Service — FAIRGO Production-Hardened
 *
 * Security model:
 *  - Phone always stored/compared in normalised +66XXXXXXXXX form
 *  - otpRef required on verify (prevents cross-phone code reuse)
 *  - Brute-force: 5 wrong attempts → LOCKED for 15 minutes
 *  - Previous PENDING OTPs invalidated on new request (same phone+purpose)
 *  - Raw code NEVER logged or returned in production
 *  - Dev/staging: debugCode in request response + console log
 *  - All events audit-logged
 */

import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";

// ── Constants ──────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS          = 5 * 60 * 1000;   // 5 min
const RESEND_COOLDOWN_MS     = 60 * 1000;        // 60 s between requests
const MAX_REQUESTS_PER_10MIN = 5;                // per phone+purpose per 10-min window
const MAX_ATTEMPTS           = 5;                // wrong attempts before lock
const LOCK_DURATION_MS       = 15 * 60 * 1000;  // 15 min brute-force lock
const MOCK_OTP               = "123456";

// ── Types ──────────────────────────────────────────────────────────────────────
export type OtpPurpose = "CUSTOMER_LOGIN" | "DRIVER_LOGIN";

export interface OtpRequestResult {
  otpRef: string;
  /** Only present in non-production — NEVER expose in production */
  debugCode?: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface OtpRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export interface OtpVerifyResult {
  valid: boolean;
  reason?: string;
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalise Thai phone to +66XXXXXXXXX */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+66" + digits.slice(1);
  if (digits.length === 9) return "+66" + digits;
  if (raw.startsWith("+")) return raw;
  return raw;
}

function generateRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "REF-";
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// ── Rate-limit check ───────────────────────────────────────────────────────────

export async function checkOtpRateLimit(
  phone: string,
  purpose: OtpPurpose
): Promise<OtpRateLimitResult> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const recentCount = await prisma.otpCode.count({
    where: { phone, purpose, createdAt: { gte: tenMinutesAgo } },
  });

  if (recentCount >= MAX_REQUESTS_PER_10MIN) {
    return {
      allowed: false,
      reason: "ขอ OTP เกินกำหนด กรุณารอ 10 นาที",
      retryAfterSeconds: 600,
    };
  }

  const lastOtp = await prisma.otpCode.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (lastOtp) {
    const elapsed = Date.now() - lastOtp.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        allowed: false,
        reason: "กรุณารอก่อนขอ OTP ใหม่",
        retryAfterSeconds,
      };
    }
  }

  return { allowed: true };
}

// ── Generate OTP ───────────────────────────────────────────────────────────────

export async function generateOTP(
  phone: string,
  purpose: OtpPurpose,
  ipAddress?: string,
  userAgent?: string
): Promise<OtpRequestResult> {
  const useMock = process.env.MOCK_OTP_ENABLED === "true" || !isProduction();
  const code    = useMock ? MOCK_OTP : generateCode();
  const otpRef  = generateRef();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Invalidate previous PENDING OTPs for this phone+purpose
  await prisma.otpCode.updateMany({
    where: { phone, purpose, status: "PENDING" },
    data: { status: "INVALIDATED" },
  });

  // Purge records older than 2 hours (keep recent for rate-limit counting)
  await prisma.otpCode.deleteMany({
    where: { phone, createdAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
  });

  await prisma.otpCode.create({
    data: { phone, code, otpRef, purpose, status: "PENDING", expiresAt, ipAddress, userAgent },
  });

  await writeAuditLog({
    action: "OTP_REQUESTED",
    entity: "OtpCode",
    entityId: otpRef,
    newData: { phone, purpose, otpRef },
    ipAddress,
    userAgent,
  });

  if (!isProduction()) {
    console.log(`[OTP] Phone: ${phone} | Purpose: ${purpose} | Ref: ${otpRef} | Code: ${code}`);
  } else {
    console.log(`[OTP] Phone: ${phone} | Purpose: ${purpose} | Ref: ${otpRef}`);
  }

  return {
    otpRef,
    ...(!isProduction() ? { debugCode: code } : {}),
    cooldownSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    expiresInSeconds: Math.ceil(OTP_EXPIRY_MS / 1000),
  };
}

// ── Verify OTP ─────────────────────────────────────────────────────────────────

export async function verifyOTP(
  phone: string,
  otpRef: string,
  code: string,
  purpose: OtpPurpose,
  ipAddress?: string
): Promise<OtpVerifyResult> {
  const now = new Date();

  // Lookup by unique otpRef
  const stored = await prisma.otpCode.findUnique({ where: { otpRef } });

  if (!stored) {
    await _auditFail(otpRef, phone, "not_found", ipAddress);
    return { valid: false, reason: "ไม่พบ OTP กรุณาขอรหัสใหม่" };
  }

  // Phone + purpose must match (anti-substitution)
  if (stored.phone !== phone || stored.purpose !== purpose) {
    await _auditFail(otpRef, phone, "phone_or_purpose_mismatch", ipAddress);
    return { valid: false, reason: "ไม่พบ OTP กรุณาขอรหัสใหม่" };
  }

  if (stored.status === "USED") {
    return { valid: false, reason: "OTP นี้ถูกใช้งานแล้ว กรุณาขอรหัสใหม่" };
  }

  if (stored.status === "INVALIDATED") {
    return { valid: false, reason: "OTP ถูกยกเลิกแล้ว กรุณาขอรหัสใหม่" };
  }

  // Brute-force lock check
  if (stored.status === "LOCKED" || (stored.lockedUntil && stored.lockedUntil > now)) {
    const lockedUntil = stored.lockedUntil ?? new Date(now.getTime() + LOCK_DURATION_MS);
    const minsRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
    return {
      valid: false,
      reason: `OTP ถูกล็อก ${minsRemaining} นาที เนื่องจากป้อนผิดหลายครั้ง กรุณาขอรหัสใหม่`,
      lockedUntil,
    };
  }

  // Expiry check
  if (now > stored.expiresAt || stored.status === "EXPIRED") {
    await prisma.otpCode.update({ where: { id: stored.id }, data: { status: "EXPIRED" } });
    return { valid: false, reason: "OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" };
  }

  // Wrong code
  if (stored.code !== code) {
    const newCount   = stored.attemptCount + 1;
    const shouldLock = newCount >= MAX_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(now.getTime() + LOCK_DURATION_MS) : undefined;

    await prisma.otpCode.update({
      where: { id: stored.id },
      data: {
        attemptCount: newCount,
        status: shouldLock ? "LOCKED" : "PENDING",
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });

    await writeAuditLog({
      action: shouldLock ? "OTP_LOCKED" : "OTP_VERIFY_FAIL",
      entity: "OtpCode",
      entityId: otpRef,
      newData: { phone, attemptCount: newCount, locked: shouldLock },
      ipAddress,
    });

    if (shouldLock) {
      return {
        valid: false,
        reason: `OTP ถูกล็อก 15 นาที เนื่องจากป้อนผิด ${MAX_ATTEMPTS} ครั้ง`,
        lockedUntil,
      };
    }
    return {
      valid: false,
      reason: "รหัส OTP ไม่ถูกต้อง",
      attemptsRemaining: MAX_ATTEMPTS - newCount,
    };
  }

  // ── SUCCESS ───────────────────────────────────────────
  await prisma.otpCode.update({
    where: { id: stored.id },
    data: { status: "USED", usedAt: now },
  });

  await writeAuditLog({
    action: "OTP_VERIFIED",
    entity: "OtpCode",
    entityId: otpRef,
    newData: { phone, purpose },
    ipAddress,
  });

  return { valid: true };
}

async function _auditFail(
  otpRef: string,
  phone: string,
  reason: string,
  ipAddress?: string
): Promise<void> {
  await writeAuditLog({
    action: "OTP_VERIFY_FAIL",
    entity: "OtpCode",
    entityId: otpRef,
    newData: { phone, reason },
    ipAddress,
  });
}

// ── Admin debug (non-production only) ─────────────────────────────────────────

export async function getOtpDebugInfo(otpRef: string): Promise<{
  found: boolean;
  phone?: string;
  code?: string;
  status?: string;
  expiresAt?: Date;
  attemptCount?: number;
}> {
  if (isProduction()) return { found: false };

  const record = await prisma.otpCode.findUnique({ where: { otpRef } });
  if (!record) return { found: false };

  return {
    found: true,
    phone: record.phone,
    code: record.code,
    status: record.status,
    expiresAt: record.expiresAt,
    attemptCount: record.attemptCount,
  };
}
