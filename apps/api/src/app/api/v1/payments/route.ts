import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { JwtPayload } from "@/lib/jwt";
import { z } from "zod";

const PLATFORM_COMMISSION_RATE = 0.15; // 15%

const PaySchema = z.object({
  tripId: z.string(),
  method: z.enum(["CASH", "CARD", "WALLET"]),
});

// GET /api/v1/payments?tripId=xxx — get payment for a trip
export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;

    const tripId = request.nextUrl.searchParams.get("tripId");
    if (!tripId) return errorResponse("tripId required", 400);

    const payment = await prisma.payment.findUnique({ where: { tripId } });
    if (!payment) return errorResponse("Payment not found", 404);

    return successResponse(payment);
  } catch (error) {
    console.error("[PAYMENTS] GET error:", error);
    return errorResponse("Failed to get payment", 500);
  }
}

// POST /api/v1/payments — process payment for completed trip
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (!("userId" in authResult)) return authResult as unknown as Response;
    const user = authResult as JwtPayload;

    const body = await request.json();
    const parsed = PaySchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.message, 400);

    const { tripId, method } = parsed.data;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        rideRequest: { include: { customerProfile: { include: { wallet: true } } } },
        driverProfile: { include: { wallet: true } },
        payment: true,
      },
    });

    if (!trip) return errorResponse("Trip not found", 404);
    if (trip.status !== "COMPLETED") return errorResponse("Trip not completed yet", 400);
    if (trip.payment) return errorResponse("Payment already processed", 409);
    if (!trip.lockedFare) return errorResponse("Trip fare not set", 400);

    const amount = trip.lockedFare;
    const commission = Math.round(amount * PLATFORM_COMMISSION_RATE * 100) / 100;
    const driverEarning = Math.round((amount - commission) * 100) / 100;

    let payment;

    if (method === "WALLET") {
      // Deduct from customer wallet
      const customerWallet = trip.rideRequest.customerProfile.wallet;
      if (!customerWallet) return errorResponse("Customer wallet not found", 404);
      if (customerWallet.balance < amount) {
        return errorResponse(`Insufficient wallet balance. Need ฿${amount}, have ฿${customerWallet.balance.toFixed(2)}`, 400);
      }

      payment = await prisma.$transaction(async (tx) => {
        // Create payment record
        const p = await tx.payment.create({
          data: {
            tripId,
            amount,
            commission,
            driverEarning,
            method: "WALLET",
            status: "COMPLETED",
            transactionRef: `TXN-${Date.now()}`,
            paidAt: new Date(),
          },
        });

        // Deduct from customer wallet
        const updatedCWallet = await tx.wallet.update({
          where: { id: customerWallet.id },
          data: { balance: { decrement: amount } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: customerWallet.id,
            type: "RIDE_PAYMENT",
            amount: -amount,
            balanceBefore: customerWallet.balance,
            balanceAfter: updatedCWallet.balance,
            description: `Ride payment - Trip ${tripId.slice(0, 8)}`,
            referenceId: tripId,
          },
        });

        // Credit driver wallet
        if (trip.driverProfile?.wallet) {
          const dWallet = trip.driverProfile.wallet;
          const updatedDWallet = await tx.wallet.update({
            where: { id: dWallet.id },
            data: { balance: { increment: driverEarning } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: dWallet.id,
              type: "RIDE_EARNING",
              amount: driverEarning,
              balanceBefore: dWallet.balance,
              balanceAfter: updatedDWallet.balance,
              description: `Ride earning - Trip ${tripId.slice(0, 8)}`,
              referenceId: tripId,
            },
          });
        }

        return p;
      });
    } else {
      // CASH or CARD — just record payment and credit driver
      payment = await prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({
          data: {
            tripId,
            amount,
            commission,
            driverEarning,
            method,
            status: method === "CASH" ? "COMPLETED" : "PENDING",
            transactionRef: method === "CASH" ? `CASH-${Date.now()}` : undefined,
            paidAt: method === "CASH" ? new Date() : undefined,
          },
        });

        // Credit driver wallet for cash/card payments too
        if (trip.driverProfile?.wallet) {
          const dWallet = trip.driverProfile.wallet;
          const updatedDWallet = await tx.wallet.update({
            where: { id: dWallet.id },
            data: { balance: { increment: driverEarning } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: dWallet.id,
              type: "RIDE_EARNING",
              amount: driverEarning,
              balanceBefore: dWallet.balance,
              balanceAfter: updatedDWallet.balance,
              description: `Ride earning (${method}) - Trip ${tripId.slice(0, 8)}`,
              referenceId: tripId,
            },
          });
        }

        return p;
      });
    }

    return successResponse(
      { payment, driverEarning, commission, amount },
      "Payment processed successfully"
    );
  } catch (error) {
    console.error("[PAYMENTS] POST error:", error);
    return errorResponse("Failed to process payment", 500);
  }
}
