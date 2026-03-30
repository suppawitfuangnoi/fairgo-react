/**
 * OTP Service for FAIRGO
 * Uses database for persistent storage (works with Vercel serverless)
 * In production, integrate with SMS providers like Twilio, Firebase Auth, or Thai providers (ThaiBulkSMS)
 */

import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MOCK_OTP = "123456"; // Fixed OTP for development/testing

export async function generateOTP(phone: string): Promise<string> {
  const code =
    process.env.NODE_ENV === "production" &&
    process.env.MOCK_OTP_ENABLED !== "true"
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : MOCK_OTP;

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Delete any existing OTPs for this phone
  await prisma.otpCode.deleteMany({ where: { phone } });

  // Create new OTP in database
  await prisma.otpCode.create({
    data: { phone, code, expiresAt },
  });

  // In production: send SMS here
  console.log(`[OTP] Phone: ${phone}, Code: ${code}`);

  return code;
}

export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  // Accept mock OTP in development or when MOCK_OTP_ENABLED=true
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.MOCK_OTP_ENABLED === "true"
  ) {
    if (code === MOCK_OTP) {
      await prisma.otpCode.deleteMany({ where: { phone } });
      return true;
    }
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
