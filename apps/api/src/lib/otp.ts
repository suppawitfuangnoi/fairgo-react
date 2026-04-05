/**
 * OTP Service for FAIRGO
 * Stores OTP code + reference in database — no SMS provider required.
 * Admin / developer can look up the OTP code directly in the otp_codes table
 * using the otpRef returned by POST /api/v1/auth/request-otp.
 *
 * To use real SMS in the future, replace the console.log block with
 * a call to Twilio, AWS SNS, ThaiBulkSMS, etc.
 */

import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MOCK_OTP = "123456"; // Fixed code used when MOCK_OTP_ENABLED=true

/** Generate a short, human-readable reference like "REF-A3F7K2" */
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

export async function generateOTP(phone: string): Promise<OtpResult> {
  // When MOCK_OTP_ENABLED=true (or in dev), always issue the fixed code.
  // Otherwise generate a random 6-digit code.
  const useMock =
    process.env.MOCK_OTP_ENABLED === "true" ||
    process.env.NODE_ENV !== "production";

  const code = useMock
    ? MOCK_OTP
    : Math.floor(100000 + Math.random() * 900000).toString();

  const otpRef = generateRef();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Delete any existing OTPs for this phone
  await prisma.otpCode.deleteMany({ where: { phone } });

  // Save new OTP + reference to database
  await prisma.otpCode.create({
    data: { phone, code, otpRef, expiresAt },
  });

  // Log to server console so developer can see it (replaces real SMS)
  console.log(`[OTP] Phone: ${phone} | Ref: ${otpRef} | Code: ${code}`);

  return { code, otpRef };
}

export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  // Accept the fixed mock code if MOCK_OTP_ENABLED or in dev
  const useMock =
    process.env.MOCK_OTP_ENABLED === "true" ||
    process.env.NODE_ENV !== "production";

  if (useMock && code === MOCK_OTP) {
    await prisma.otpCode.deleteMany({ where: { phone } });
    return true;
  }

  const stored = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });

  if (!stored) return false;
  if (new Date() > stored.expiresAt) {
    await prisma.otpCode.deleteMany({ where: { phone } });
    return false;
  }
  if (stored.code !== code) return false;

  await prisma.otpCode.deleteMany({ where: { phone } });
  return true;
}
