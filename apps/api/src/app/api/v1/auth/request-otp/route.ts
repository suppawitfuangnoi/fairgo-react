import { NextRequest } from "next/server";
import { checkOtpRateLimit, generateOTP } from "@/lib/otp";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { requestOtpSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, requestOtpSchema);
    if ("error" in result) return result.error;

    const { phone } = result.data;

    // Extract IP for rate-limit auditing
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    // Check rate limits first
    const rateCheck = await checkOtpRateLimit(phone);
    if (!rateCheck.allowed) {
      return errorResponse(
        rateCheck.reason || "Rate limit exceeded",
        429,
        rateCheck.retryAfterSeconds ? { retryAfterSeconds: rateCheck.retryAfterSeconds } : undefined
      );
    }

    const { otpRef } = await generateOTP(phone, ipAddress);

    return successResponse(
      { phone, otpRef, message: "OTP sent successfully" },
      "OTP has been sent to your phone number"
    );
  } catch (error) {
    console.error("[AUTH] Request OTP error:", error);
    return errorResponse("Failed to send OTP", 500);
  }
}
