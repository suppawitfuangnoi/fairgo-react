import { NextRequest } from "next/server";
import { checkOtpRateLimit, generateOTP, normalisePhone, OtpPurpose } from "@/lib/otp";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { requestOtpSchema } from "@/lib/validation";

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
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    // Rate limit check (includes cooldown + 10-min window)
    const rateCheck = await checkOtpRateLimit(phone, purpose);
    if (!rateCheck.allowed) {
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
