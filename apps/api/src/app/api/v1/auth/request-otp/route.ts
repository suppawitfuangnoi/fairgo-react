import { NextRequest } from "next/server";
import { checkOtpRateLimit, generateOTP, normalisePhone, OtpPurpose } from "@/lib/otp";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { requestOtpSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, requestOtpSchema);
    if ("error" in result) return result.error;

    const { phone: rawPhone, role } = result.data;

    // Normalise phone to +66XXXXXXXXX
    const phone = normalisePhone(rawPhone);

    // Derive purpose from role
    const purpose: OtpPurpose =
      role === "DRIVER" ? "DRIVER_LOGIN" : "CUSTOMER_LOGIN";

    // Extract request metadata
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;

    // ── IP-level rate limit: 10 OTP requests per 10 min per IP ───────────
    // This prevents phone-number enumeration and SMS bombing from a single IP.
    const ipKey = `ip:${ipAddress ?? "unknown"}:otp-request`;
    const ipLimit = checkRateLimit(ipKey, 10 * 60_000, 10);
    if (!ipLimit.allowed) {
      writeAuditLog({
        action: "OTP_IP_RATE_LIMIT_EXCEEDED",
        entity: "OTP",
        newData: { ip: ipAddress, phone },
        ipAddress,
        userAgent,
      }).catch(() => {});
      return errorResponse(
        "Too many OTP requests from this IP. Please try again later.",
        429,
        { retryAfterSeconds: Math.ceil(ipLimit.retryAfterMs / 1000) }
      );
    }

    // ── Per-phone rate limit (includes cooldown + 10-min window) ─────────
    const rateCheck = await checkOtpRateLimit(phone, purpose);
    if (!rateCheck.allowed) {
      writeAuditLog({
        action: "OTP_PHONE_RATE_LIMIT_EXCEEDED",
        entity: "OTP",
        newData: { phone },
        ipAddress,
        userAgent,
      }).catch(() => {});
      return errorResponse(
        rateCheck.reason || "Rate limit exceeded",
        429,
        rateCheck.retryAfterSeconds
          ? { retryAfterSeconds: rateCheck.retryAfterSeconds }
          : undefined
      );
    }

    const otpResult = await generateOTP(phone, purpose, ipAddress, userAgent);

    // Response payload — debugCode only present in non-production
    return successResponse(
      {
        phone,
        otpRef: otpResult.otpRef,
        cooldownSeconds: otpResult.cooldownSeconds,
        expiresInSeconds: otpResult.expiresInSeconds,
        // Only expose debug OTP in non-production environments
        ...(otpResult.debugCode !== undefined
          ? { debugCode: otpResult.debugCode }
          : {}),
      },
      "OTP sent successfully"
    );
  } catch (error) {
    console.error("[AUTH] Request OTP error:", error);
    return errorResponse("Failed to send OTP", 500);
  }
}
