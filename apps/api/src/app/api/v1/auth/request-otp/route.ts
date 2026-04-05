import { NextRequest } from "next/server";
import { generateOTP } from "@/lib/otp";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/middleware/validate";
import { requestOtpSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const result = await validateBody(request, requestOtpSchema);
    if ("error" in result) return result.error;

    const { phone } = result.data;
    const { otpRef } = await generateOTP(phone);

    return successResponse(
      { phone, otpRef, message: "OTP sent successfully" },
      "OTP has been sent to your phone number"
    );
  } catch (error) {
    console.error("[AUTH] Request OTP error:", error);
    return errorResponse("Failed to send OTP", 500);
  }
}
