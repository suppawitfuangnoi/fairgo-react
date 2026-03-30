import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const TopUpSchema = z.object({
  amount: z.number().min(100).max(50000),
  method: z.enum(["CARD", "BANK_TRANSFER"]),
  reference: z.string().optional(),
});

async function getOrCreateWallet(profile: { id: string }, role: "CUSTOMER" | "DRIVER") {
  const field = role === "CUSTOMER" ? "customerProfileId" : "driverProfileId";
  let wallet = await prisma.wallet.findUnique({ where: { [field]: profile.id } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { [field]: profile.id, balance: 0, currency: "THB" },
    });
  }
  return wallet;
}

// GET /api/v1/wallet — get balance & recent transactions
export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

    let profile: { id: string } | null = null;
    if (user.role === "CUSTOMER") {
      profile = await prisma.customerProfile.findUnique({ where: { userId: user.userId } });
    } else if (user.role === "DRIVER") {
      profile = await prisma.driverProfile.findUnique({ where: { userId: user.userId } });
    } else {
      return errorResponse("Wallet not available for this role", 403);
    }
    if (!profile) return errorResponse("Profile not found", 404);

    const wallet = await getOrCreateWallet(profile, user.role as "CUSTOMER" | "DRIVER");

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return successResponse({
      wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
      transactions,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[WALLET] GET error:", error);
    return errorResponse("Failed to get wallet", 500);
  }
}

// POST /api/v1/wallet — top up wallet
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const body = await request.json();
    const parsed = TopUpSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { amount } = parsed.data;

    let profile: { id: string } | null = null;
    if (user.role === "CUSTOMER") {
      profile = await prisma.customerProfile.findUnique({ where: { userId: user.userId } });
    } else if (user.role === "DRIVER") {
      profile = await prisma.driverProfile.findUnique({ where: { userId: user.userId } });
    } else {
      return errorResponse("Wallet not available for this role", 403);
    }
    if (!profile) return errorResponse("Profile not found", 404);

    const wallet = await getOrCreateWallet(profile, user.role as "CUSTOMER" | "DRIVER");

    // In production: verify payment with payment gateway before crediting
    // For now: simulate successful top-up
    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "TOP_UP",
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: w.balance,
          description: `Top up ฿${amount.toFixed(2)}`,
          referenceId: parsed.data.reference,
        },
      });
      return w;
    });

    return successResponse(
      { wallet: { balance: updated.balance, currency: updated.currency } },
      "Wallet topped up successfully"
    );
  } catch (error) {
    console.error("[WALLET] TOP UP error:", error);
    return errorResponse("Failed to top up wallet", 500);
  }
}
