/**
 * OTP Service for FAIRGO
 * Stores OTP code + reference in database — no SMS provider required.
 * Admin / developer can look up the OTP code directly in the otp_codes table
 * using the otpRef returned by POST /api/v1/auth/request-otp.
 *
 * Rate limiting rules:
 *  - Max 3 OTP requests per phone per 10 minutes
 *  - 1-minute cooldown between resend requests
 *  - Max 5 wrong attempts before OTP is invalidated
 *  - Successful verify marks OTP as used (usedAt timestamp, preserved for audit)
 */

import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_10MIN = 3;
const MAX_ATTEMPTS = 5;
const MOCK_OTP = "123456";

function generateRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "REF-";
  for (let i = 0; i < 6; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

export interface OtpResult {
  code: string;
  otpRef: string;
}

export interface OtpRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export async function checkOtpRateLimit(phone: string): Promise<OtpRateLimitResult> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: tenMinutesAgo } },
  });

  if (recentCount >= MAX_REQUESTS_PER_10MIN) {
    return {
      allowed: false,
      reason: `Too many OTP requests. Maximum ${MAX_REQUESTS_PER_10MIN} per 10 minutes.`,
      retryAfterSeconds: 600,
    };
  }

  const lastOtp = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (lastOtp) {
    const timeSinceLastMs = Date.now() - lastOtp.createdAt.getTime();
    if (timeSinceLastMs < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastMs) / 1000);
      return { allowed: false, reason: "Please wait before requesting another OTP.", retryAfterSeconds };
    }
  }

  return { allowed: true };
}

export async function generateOTP(phone: string, ipAddress?: string): Promise<OtpResult> {
  const useMock =
    process.env.MOCK_OTP_ENABLED === "true" ||
    process.env.NODE_ENV !== "production";

  const code = useMock
    ? MOCK_OTP
    : Math.floor(100000 + Math.random() * 900000).toString();

  const otpRef = generateRef();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Clean up old OTPs (older than 1 hour) — preserve recent for rate limiting
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.otpCode.deleteMany({
    where: { phone, createdAt: { lt: oneHourAgo } },
  });

  await prisma.otpCode.create({
    data: { phone, code, otpRef, expiresAt, ipAddress },
  });

  console.log(`[OTP] Phone: ${phone} | Ref: ${otpRef} | Code: ${code}`);
  return { code, otpRef };
}

export interface OtpVerifyResult {
  valid: boolean;
  reason?: string;
  attemptsRemaining?: number;
}

export async function verifyOTP(phone: string, code: string): Promise<OtpVerifyResult> {
  const useMock =
    process.env.MOCK_OTP_ENABLED === "true" ||
    process.env.NODE_ENV !== "production";

  if (useMock && code === MOCK_OTP) {
    await prisma.otpCode.updateMany({
      where: { phone, usedAt: null },
      data: { usedAt: new Date() },
    });
    return { valid: true };
  }

  const stored = await prisma.otpCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!stored) return { valid: false, reason: "No pending OTP found. Please request a new one." };

  if (new Date() > stored.expiresAt) {
    await prisma.otpCode.delete({ where: { id: stored.id } });
    return { valid: false, reason: "OTP has expired. Please request a new one." };
  }

  if (stored.attemptCount >= MAX_ATTEMPTS) {
    await prisma.otpCode.delete({ where: { id: stored.id } });
    return { valid: false, reason: "Too many failed attempts. Please request a new OTP." };
  }

  if (stored.code !== code) {
    const newAttemptCount = stored.attemptCount + 1;
    await prisma.otpCode.update({
      where: { id: stored.id },
      data: { attemptCount: newAttemptCount },
    });
    return { valid: false, reason: "Invalid OTP code.", attemptsRemaining: MAX_ATTEMPTS - newAttemptCount };
  }

  // Mark as used — preserve record for audit
  await prisma.otpCode.update({
    where: { id: stored.id },
    data: { usedAt: new Date() },
  });

  return { valid: true };
}
