/**
 * Notification Service — FAIRGO
 *
 * Central hub for all in-app notifications.
 * Responsibilities:
 *   1. Persist notification records to PostgreSQL (DB-backed for recovery)
 *   2. Emit real-time delivery via Socket.IO to the user's room
 *   3. Provide query helpers (list, unread count, mark read)
 *
 * Design principles:
 *   - createAndEmit() is the only way to send a notification — always both persist + emit
 *   - Never throw from create — notification failure should not break business logic
 *   - On reconnect/refresh, client fetches /notifications to recover missed events
 */

import { prisma } from "@/lib/prisma";
import { emitToUser } from "@/lib/socket";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationType =
  | "NEW_RIDE_REQUEST"
  | "NEW_OFFER"
  | "COUNTER_OFFER"
  | "OFFER_ACCEPTED"
  | "OFFER_REJECTED"
  | "DRIVER_EN_ROUTE"
  | "DRIVER_ARRIVED"
  | "TRIP_STARTED"
  | "AWAITING_CASH_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "TRIP_COMPLETED"
  | "TRIP_CANCELLED"
  | "DISPUTE_CREATED"
  | "DISPUTE_RESOLVED"
  | "OFFER_EXPIRED"
  | "SYSTEM_ALERT"
  | "OTP_DEBUG_INFO"
  // Legacy
  | "RIDE_REQUEST"
  | "RIDE_OFFER"
  | "RIDE_ACCEPTED"
  | "TRIP_UPDATE"
  | "PAYMENT"
  | "PROMOTION"
  | "SYSTEM";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType?: string;   // "trip" | "offer" | "ride" | "payment"
  relatedEntityId?: string;     // actual entity ID
  payload?: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface ListNotificationsOptions {
  userId: string;
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ListNotificationsResult {
  notifications: NotificationRecord[];
  unreadCount: number;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ── Core service functions ─────────────────────────────────────────────────

/**
 * Create a notification in DB and emit it to the user via Socket.IO.
 * Silently swallows errors so notification failure never breaks business logic.
 */
export async function createAndEmitNotification(
  input: CreateNotificationInput
): Promise<NotificationRecord | null> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type as Parameters<typeof prisma.notification.create>[0]["data"]["type"],
        title: input.title,
        body: input.body,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        payload: input.payload ?? null,
      },
    });

    // Real-time delivery — fire and forget (socket is optional)
    emitToUser(input.userId, "notification:new", notification);

    return notification as NotificationRecord;
  } catch (err) {
    console.error("[NOTIFICATIONS] Failed to create notification:", err);
    return null;
  }
}

/**
 * Convenience: send the same notification to multiple users simultaneously.
 */
export async function createAndEmitToMany(
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId">
): Promise<void> {
  await Promise.all(
    userIds.map((userId) => createAndEmitNotification({ ...input, userId }))
  );
}

/**
 * List notifications for a user with pagination.
 */
export async function listNotifications(
  opts: ListNotificationsOptions
): Promise<ListNotificationsResult> {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { userId: opts.userId };
  if (opts.unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: opts.userId, isRead: false } }),
  ]);

  return {
    notifications: notifications as NotificationRecord[],
    unreadCount,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

/**
 * Mark a single notification as read. Validates ownership.
 * Returns false if notification not found or doesn't belong to user.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Mark all unread notifications as read for a user.
 * Returns number of records updated.
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

// ── Typed notification factories ───────────────────────────────────────────
// Calling these instead of createAndEmitNotification directly ensures
// consistent titles, bodies, and payloads across the codebase.

export const Notif = {
  newRideRequest: (driverUserId: string, ride: {
    id: string; pickupAddress: string; dropoffAddress: string;
    fareMin: number; fareMax: number; vehicleType: string;
  }) =>
    createAndEmitNotification({
      userId: driverUserId,
      type: "NEW_RIDE_REQUEST",
      title: "🚕 New Ride Request",
      body: `${ride.pickupAddress} → ${ride.dropoffAddress} · ฿${ride.fareMin}–฿${ride.fareMax}`,
      relatedEntityType: "ride",
      relatedEntityId: ride.id,
      payload: { rideId: ride.id, vehicleType: ride.vehicleType, fareMin: ride.fareMin, fareMax: ride.fareMax },
    }),

  newOffer: (customerUserId: string, offer: {
    id: string; rideRequestId: string; fareAmount: number;
    driverName: string; roundNumber: number;
  }) =>
    createAndEmitNotification({
      userId: customerUserId,
      type: offer.roundNumber > 1 ? "COUNTER_OFFER" : "NEW_OFFER",
      title: offer.roundNumber > 1 ? "🔄 Counter-offer Received" : "🤝 New Driver Offer",
      body: `${offer.driverName} offers ฿${offer.fareAmount}${offer.roundNumber > 1 ? ` (Round ${offer.roundNumber})` : ""}`,
      relatedEntityType: "offer",
      relatedEntityId: offer.id,
      payload: { offerId: offer.id, rideRequestId: offer.rideRequestId, fareAmount: offer.fareAmount, roundNumber: offer.roundNumber },
    }),

  counterOffer: (driverUserId: string, offer: {
    id: string; rideRequestId: string; fareAmount: number; roundNumber: number;
  }) =>
    createAndEmitNotification({
      userId: driverUserId,
      type: "COUNTER_OFFER",
      title: "🔄 Customer Counter-offer",
      body: `Customer countered with ฿${offer.fareAmount} (Round ${offer.roundNumber})`,
      relatedEntityType: "offer",
      relatedEntityId: offer.id,
      payload: { offerId: offer.id, rideRequestId: offer.rideRequestId, fareAmount: offer.fareAmount, roundNumber: offer.roundNumber },
    }),

  offerAccepted: (driverUserId: string, tripId: string, fare: number) =>
    createAndEmitNotification({
      userId: driverUserId,
      type: "OFFER_ACCEPTED",
      title: "✅ Offer Accepted!",
      body: `Your offer was accepted. Trip fare locked at ฿${fare}. Head to pickup now.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, fare },
    }),

  offerRejected: (driverUserId: string, offerId: string) =>
    createAndEmitNotification({
      userId: driverUserId,
      type: "OFFER_REJECTED",
      title: "❌ Offer Rejected",
      body: "The customer rejected your offer. Try another ride.",
      relatedEntityType: "offer",
      relatedEntityId: offerId,
      payload: { offerId },
    }),

  driverEnRoute: (customerUserId: string, tripId: string, driverName: string) =>
    createAndEmitNotification({
      userId: customerUserId,
      type: "DRIVER_EN_ROUTE",
      title: "🚗 Driver En Route",
      body: `${driverName} is on the way to pick you up.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId },
    }),

  driverArrived: (customerUserId: string, tripId: string, driverName: string) =>
    createAndEmitNotification({
      userId: customerUserId,
      type: "DRIVER_ARRIVED",
      title: "📍 Driver Arrived",
      body: `${driverName} has arrived at your location. Please head out.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId },
    }),

  tripStarted: (customerUserId: string, tripId: string, dropoffAddress: string) =>
    createAndEmitNotification({
      userId: customerUserId,
      type: "TRIP_STARTED",
      title: "🚀 Trip Started",
      body: `You're on your way to ${dropoffAddress}.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, dropoffAddress },
    }),

  awaitingCashPayment: (customerUserId: string, tripId: string, fare: number) =>
    createAndEmitNotification({
      userId: customerUserId,
      type: "AWAITING_CASH_PAYMENT",
      title: "💵 Cash Payment Required",
      body: `Please pay ฿${fare} to your driver to complete the trip.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, fare },
    }),

  paymentConfirmed: (userId: string, tripId: string, amount: number) =>
    createAndEmitNotification({
      userId,
      type: "PAYMENT_CONFIRMED",
      title: "💚 Payment Confirmed",
      body: `Payment of ฿${amount} confirmed. Thank you for riding with FairGo!`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, amount },
    }),

  tripCompleted: (userId: string, tripId: string, fare: number, isDriver: boolean) =>
    createAndEmitNotification({
      userId,
      type: "TRIP_COMPLETED",
      title: "🏁 Trip Completed",
      body: isDriver
        ? `Trip completed. You earned ฿${fare} (before commission).`
        : `You've arrived! Fare: ฿${fare}. Don't forget to rate your driver.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, fare },
    }),

  tripCancelled: (userId: string, tripId: string, cancelledBy: "driver" | "customer", reason?: string) =>
    createAndEmitNotification({
      userId,
      type: "TRIP_CANCELLED",
      title: "🚫 Trip Cancelled",
      body: `Trip was cancelled by ${cancelledBy}${reason ? `: ${reason}` : "."}`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, cancelledBy, reason },
    }),

  offerExpired: (userId: string, offerId: string) =>
    createAndEmitNotification({
      userId,
      type: "OFFER_EXPIRED",
      title: "⏰ Offer Expired",
      body: "A negotiation offer has expired with no response.",
      relatedEntityType: "offer",
      relatedEntityId: offerId,
      payload: { offerId },
    }),

  disputeCreated: (
    reporterUserId: string,
    tripId: string,
    ticketId: string,
    fare: number
  ) =>
    createAndEmitNotification({
      userId: reporterUserId,
      type: "DISPUTE_CREATED",
      title: "⚠️ Dispute Reported",
      body: `Your payment dispute for ฿${fare} has been received. We will review it shortly.`,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, ticketId, fare },
    }),

  disputeResolved: (
    reporterUserId: string,
    tripId: string,
    ticketId: string,
    resolutionNote: string
  ) =>
    createAndEmitNotification({
      userId: reporterUserId,
      type: "DISPUTE_RESOLVED",
      title: "✅ Dispute Resolved",
      body: resolutionNote,
      relatedEntityType: "trip",
      relatedEntityId: tripId,
      payload: { tripId, ticketId },
    }),

  systemAlert: (userId: string, title: string, message: string) =>
    createAndEmitNotification({
      userId,
      type: "SYSTEM_ALERT",
      title,
      body: message,
      payload: {},
    }),
};
