import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const WithdrawSchema = z.object({
  amount: z.number().min(100),
  bankAccount: z.string().min(10),
  bankName: z.string(),
});

// POST /api/v1/wallet/withdraw — driver withdrawal request
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    if (user.role !== "DRIVER") return errorResponse("Only drivers can withdraw", 403);

    const body = await request.json();
    const parsed = WithdrawSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { amount } = parsed.data;

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.userId },
      include: { wallet: true },
    });

    if (!driverProfile) return errorResponse("Driver profile not found", 404);
    if (!driverProfile.wallet) return errorResponse("Wallet not found", 404);
    if (driverProfile.wallet.balance < amount) {
      return errorResponse(`Insufficient balance. Available: ฿${driverProfile.wallet.balance.toFixed(2)}`, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.wallet.update({
        where: { id: driverProfile.wallet!.id },
        data: { balance: { decrement: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: driverProfile.wallet!.id,
          type: "WITHDRAWAL",
          amount: -amount,
          balanceBefore: driverProfile.wallet!.balance,
          balanceAfter: w.balance,
          description: `Withdrawal to ${parsed.data.bankName} ****${parsed.data.bankAccount.slice(-4)}`,
        },
      });
      return w;
    });

    return successResponse(
      { balance: updated.balance },
      "Withdrawal request submitted. Processing in 1-3 business days."
    );
  } catch (error) {
    console.error("[WALLET] WITHDRAW error:", error);
    return errorResponse("Failed to process withdrawal", 500);
  }
}
