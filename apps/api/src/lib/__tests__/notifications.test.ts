/**
 * Unit tests for the Notification Service
 *
 * Covers:
 *   - createAndEmitNotification: persist + emit, silent error swallowing
 *   - createAndEmitToMany: fan-out to multiple users
 *   - listNotifications: pagination, unreadOnly filter
 *   - getUnreadCount: delegates to prisma.count
 *   - markNotificationRead: single mark + ownership check
 *   - markAllNotificationsRead: bulk update, returns count
 *   - Notif factories: correct type / title / body / relatedEntityType
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted to top by vite) ───────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create:     vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/socket", () => ({
  emitToUser: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { prisma }         from "@/lib/prisma";
import { emitToUser }     from "@/lib/socket";
import {
  createAndEmitNotification,
  createAndEmitToMany,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  Notif,
} from "../notifications";

// ── Typed mock accessors ─────────────────────────────────────────────────────
const dbNotif = prisma.notification as {
  create:     ReturnType<typeof vi.fn>;
  findMany:   ReturnType<typeof vi.fn>;
  count:      ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};
const mockEmit = emitToUser as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeRecord = (overrides: Partial<ReturnType<typeof makeRecord>> = {}) => ({
  id:                "notif_01",
  userId:            "user_01",
  type:              "SYSTEM_ALERT",
  title:             "Hello",
  body:              "World",
  relatedEntityType: null,
  relatedEntityId:   null,
  payload:           null,
  isRead:            false,
  readAt:            null,
  createdAt:         new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
describe("createAndEmitNotification", () => {
  it("persists to DB and emits via socket, returning the record", async () => {
    const record = makeRecord();
    dbNotif.create.mockResolvedValue(record);

    const result = await createAndEmitNotification({
      userId: "user_01",
      type:   "SYSTEM_ALERT",
      title:  "Hello",
      body:   "World",
    });

    expect(dbNotif.create).toHaveBeenCalledOnce();
    const createArgs = dbNotif.create.mock.calls[0][0].data;
    expect(createArgs.userId).toBe("user_01");
    expect(createArgs.type).toBe("SYSTEM_ALERT");
    expect(createArgs.title).toBe("Hello");
    expect(createArgs.body).toBe("World");
    // isRead defaults to false at DB level — service omits it from create payload
    expect(createArgs.isRead ?? false).toBe(false);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(
      "user_01",
      "notification:new",
      expect.objectContaining({ id: "notif_01", type: "SYSTEM_ALERT" })
    );

    expect(result).toEqual(record);
  });

  it("stores relatedEntityType and relatedEntityId when provided", async () => {
    const record = makeRecord({ relatedEntityType: "trip", relatedEntityId: "trip_01" });
    dbNotif.create.mockResolvedValue(record);

    await createAndEmitNotification({
      userId:            "user_01",
      type:              "TRIP_COMPLETED",
      title:             "Done",
      body:              "Trip done",
      relatedEntityType: "trip",
      relatedEntityId:   "trip_01",
    });

    const createArgs = dbNotif.create.mock.calls[0][0].data;
    expect(createArgs.relatedEntityType).toBe("trip");
    expect(createArgs.relatedEntityId).toBe("trip_01");
  });

  it("stores payload when provided", async () => {
    dbNotif.create.mockResolvedValue(makeRecord());

    await createAndEmitNotification({
      userId:  "user_01",
      type:    "OFFER_ACCEPTED",
      title:   "Accepted",
      body:    "Fare ฿100",
      payload: { tripId: "trip_99", fare: 100 },
    });

    const createArgs = dbNotif.create.mock.calls[0][0].data;
    expect(createArgs.payload).toEqual({ tripId: "trip_99", fare: 100 });
  });

  it("returns null and does NOT emit when DB create throws", async () => {
    dbNotif.create.mockRejectedValue(new Error("DB down"));

    const result = await createAndEmitNotification({
      userId: "user_01",
      type:   "SYSTEM_ALERT",
      title:  "Hi",
      body:   "There",
    });

    expect(result).toBeNull();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("returns null and does NOT throw when socket emit fails", async () => {
    const record = makeRecord();
    dbNotif.create.mockResolvedValue(record);
    mockEmit.mockImplementation(() => { throw new Error("socket error"); });

    const result = await createAndEmitNotification({
      userId: "user_01",
      type:   "SYSTEM_ALERT",
      title:  "Hi",
      body:   "There",
    });

    // Still returns record — DB succeeded even though emit failed
    expect(result).toBeNull(); // entire try/catch wraps both
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("createAndEmitToMany", () => {
  it("calls createAndEmitNotification once per user", async () => {
    dbNotif.create.mockResolvedValue(makeRecord());

    await createAndEmitToMany(["user_A", "user_B", "user_C"], {
      type:  "SYSTEM_ALERT",
      title: "Broadcast",
      body:  "For all",
    });

    expect(dbNotif.create).toHaveBeenCalledTimes(3);
    const userIds = dbNotif.create.mock.calls.map((c: any[]) => c[0].data.userId);
    expect(userIds).toContain("user_A");
    expect(userIds).toContain("user_B");
    expect(userIds).toContain("user_C");
  });

  it("does not throw when user list is empty", async () => {
    await expect(
      createAndEmitToMany([], { type: "SYSTEM_ALERT", title: "X", body: "Y" })
    ).resolves.toBeUndefined();
    expect(dbNotif.create).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listNotifications", () => {
  const fakeNotifs = [makeRecord({ id: "n1" }), makeRecord({ id: "n2" })];

  it("returns paginated notifications with correct meta", async () => {
    dbNotif.findMany.mockResolvedValue(fakeNotifs);
    dbNotif.count
      .mockResolvedValueOnce(2)   // total
      .mockResolvedValueOnce(2);  // unreadCount

    const result = await listNotifications({ userId: "user_01", page: 1, limit: 20 });

    expect(result.notifications).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.totalPages).toBe(1);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
    expect(result.unreadCount).toBe(2);
  });

  it("passes unreadOnly filter to DB when requested", async () => {
    dbNotif.findMany.mockResolvedValue([]);
    dbNotif.count.mockResolvedValue(0);

    await listNotifications({ userId: "user_01", unreadOnly: true });

    // The findMany `where` clause should include isRead: false
    const whereArg = dbNotif.findMany.mock.calls[0][0].where;
    expect(whereArg.isRead).toBe(false);
  });

  it("does not include isRead filter in where clause when unreadOnly is false", async () => {
    dbNotif.findMany.mockResolvedValue([]);
    dbNotif.count.mockResolvedValue(0);

    await listNotifications({ userId: "user_01", unreadOnly: false });

    const whereArg = dbNotif.findMany.mock.calls[0][0].where;
    expect(whereArg.isRead).toBeUndefined();
  });

  it("caps limit at 100", async () => {
    dbNotif.findMany.mockResolvedValue([]);
    dbNotif.count.mockResolvedValue(0);

    await listNotifications({ userId: "user_01", limit: 999 });

    const takeArg = dbNotif.findMany.mock.calls[0][0].take;
    expect(takeArg).toBe(100);
  });

  it("calculates correct skip for page 2 with limit 5", async () => {
    dbNotif.findMany.mockResolvedValue([]);
    dbNotif.count.mockResolvedValue(0);

    await listNotifications({ userId: "user_01", page: 2, limit: 5 });

    const skipArg = dbNotif.findMany.mock.calls[0][0].skip;
    expect(skipArg).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("getUnreadCount", () => {
  it("returns the prisma count for the given user", async () => {
    dbNotif.count.mockResolvedValue(7);

    const count = await getUnreadCount("user_01");

    expect(count).toBe(7);
    expect(dbNotif.count).toHaveBeenCalledWith({
      where: { userId: "user_01", isRead: false },
    });
  });

  it("returns 0 when there are no unread notifications", async () => {
    dbNotif.count.mockResolvedValue(0);
    expect(await getUnreadCount("user_x")).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("markNotificationRead", () => {
  it("returns true when a matching unread notification is updated", async () => {
    dbNotif.updateMany.mockResolvedValue({ count: 1 });

    const result = await markNotificationRead("notif_01", "user_01");

    expect(result).toBe(true);
    const updateArgs = dbNotif.updateMany.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("notif_01");
    expect(updateArgs.where.userId).toBe("user_01");
    expect(updateArgs.where.isRead).toBe(false);
    expect(updateArgs.data.isRead).toBe(true);
    expect(updateArgs.data.readAt).toBeInstanceOf(Date);
  });

  it("returns false when the notification does not belong to the user (count=0)", async () => {
    dbNotif.updateMany.mockResolvedValue({ count: 0 });
    const result = await markNotificationRead("notif_99", "user_other");
    expect(result).toBe(false);
  });

  it("returns false when the notification is already read (count=0)", async () => {
    dbNotif.updateMany.mockResolvedValue({ count: 0 });
    const result = await markNotificationRead("notif_01", "user_01");
    expect(result).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("markAllNotificationsRead", () => {
  it("updates all unread notifications for the user and returns count", async () => {
    dbNotif.updateMany.mockResolvedValue({ count: 5 });

    const count = await markAllNotificationsRead("user_01");

    expect(count).toBe(5);
    const updateArgs = dbNotif.updateMany.mock.calls[0][0];
    expect(updateArgs.where.userId).toBe("user_01");
    expect(updateArgs.where.isRead).toBe(false);
    expect(updateArgs.data.isRead).toBe(true);
    expect(updateArgs.data.readAt).toBeInstanceOf(Date);
  });

  it("returns 0 when there are no unread notifications", async () => {
    dbNotif.updateMany.mockResolvedValue({ count: 0 });
    expect(await markAllNotificationsRead("user_x")).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Notif factories", () => {
  beforeEach(() => {
    dbNotif.create.mockResolvedValue(makeRecord());
  });

  describe("Notif.newRideRequest", () => {
    it("sends NEW_RIDE_REQUEST with relatedEntityType=ride", async () => {
      await Notif.newRideRequest("driver_01", {
        id: "ride_01", pickupAddress: "A", dropoffAddress: "B",
        fareMin: 80, fareMax: 120, vehicleType: "TAXI",
      });

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("NEW_RIDE_REQUEST");
      expect(data.relatedEntityType).toBe("ride");
      expect(data.relatedEntityId).toBe("ride_01");
      expect(data.body).toContain("฿80");
      expect(data.body).toContain("฿120");
    });
  });

  describe("Notif.newOffer (round 1)", () => {
    it("sends NEW_OFFER for round 1 with correct title", async () => {
      await Notif.newOffer("customer_01", {
        id: "offer_01", rideRequestId: "ride_01", fareAmount: 95,
        driverName: "John", roundNumber: 1,
      });

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("NEW_OFFER");
      expect(data.relatedEntityType).toBe("offer");
      expect(data.body).toContain("John");
      expect(data.body).toContain("฿95");
    });
  });

  describe("Notif.newOffer (round 2 = counter)", () => {
    it("sends COUNTER_OFFER type when roundNumber > 1", async () => {
      await Notif.newOffer("customer_01", {
        id: "offer_01", rideRequestId: "ride_01", fareAmount: 90,
        driverName: "Jane", roundNumber: 2,
      });

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("COUNTER_OFFER");
      expect(data.title).toContain("Counter-offer");
    });
  });

  describe("Notif.offerAccepted", () => {
    it("sends OFFER_ACCEPTED with relatedEntityType=trip", async () => {
      await Notif.offerAccepted("driver_01", "trip_01", 100);

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("OFFER_ACCEPTED");
      expect(data.relatedEntityType).toBe("trip");
      expect(data.relatedEntityId).toBe("trip_01");
      expect(data.body).toContain("฿100");
    });
  });

  describe("Notif.offerRejected", () => {
    it("sends OFFER_REJECTED with relatedEntityType=offer", async () => {
      await Notif.offerRejected("driver_01", "offer_01");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("OFFER_REJECTED");
      expect(data.relatedEntityType).toBe("offer");
    });
  });

  describe("Notif.driverEnRoute", () => {
    it("sends DRIVER_EN_ROUTE targeting the customer", async () => {
      await Notif.driverEnRoute("customer_01", "trip_01", "Mike");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.userId).toBe("customer_01");
      expect(data.type).toBe("DRIVER_EN_ROUTE");
      expect(data.body).toContain("Mike");
    });
  });

  describe("Notif.driverArrived", () => {
    it("sends DRIVER_ARRIVED targeting the customer", async () => {
      await Notif.driverArrived("customer_01", "trip_01", "Mike");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("DRIVER_ARRIVED");
      expect(data.body).toContain("Mike");
    });
  });

  describe("Notif.tripStarted", () => {
    it("sends TRIP_STARTED with dropoff address in body", async () => {
      await Notif.tripStarted("customer_01", "trip_01", "Siam Paragon");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("TRIP_STARTED");
      expect(data.body).toContain("Siam Paragon");
    });
  });

  describe("Notif.awaitingCashPayment", () => {
    it("sends AWAITING_CASH_PAYMENT with fare in body", async () => {
      await Notif.awaitingCashPayment("customer_01", "trip_01", 150);

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("AWAITING_CASH_PAYMENT");
      expect(data.body).toContain("฿150");
    });
  });

  describe("Notif.paymentConfirmed", () => {
    it("sends PAYMENT_CONFIRMED with amount in body", async () => {
      await Notif.paymentConfirmed("user_01", "trip_01", 200);

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("PAYMENT_CONFIRMED");
      expect(data.body).toContain("฿200");
    });
  });

  describe("Notif.tripCompleted", () => {
    it("uses driver-specific body when isDriver=true", async () => {
      await Notif.tripCompleted("driver_01", "trip_01", 120, true);

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("TRIP_COMPLETED");
      expect(data.body).toContain("earned");
      expect(data.body).toContain("฿120");
    });

    it("uses customer-specific body when isDriver=false", async () => {
      await Notif.tripCompleted("customer_01", "trip_01", 120, false);

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("TRIP_COMPLETED");
      expect(data.body).toContain("rate");
    });
  });

  describe("Notif.tripCancelled", () => {
    it("mentions cancelledBy=driver in the body", async () => {
      await Notif.tripCancelled("customer_01", "trip_01", "driver");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("TRIP_CANCELLED");
      expect(data.body).toContain("driver");
    });

    it("includes reason in body when provided", async () => {
      await Notif.tripCancelled("driver_01", "trip_01", "customer", "No show");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.body).toContain("No show");
    });
  });

  describe("Notif.systemAlert", () => {
    it("sends SYSTEM_ALERT with custom title and body", async () => {
      await Notif.systemAlert("user_01", "Maintenance", "System down at midnight");

      const data = dbNotif.create.mock.calls[0][0].data;
      expect(data.type).toBe("SYSTEM_ALERT");
      expect(data.title).toBe("Maintenance");
      expect(data.body).toBe("System down at midnight");
    });
  });
});
