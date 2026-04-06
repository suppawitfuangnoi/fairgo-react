/**
 * Custom Next.js server with Socket.IO
 *
 * Run with: npx ts-node --project tsconfig.server.json server.ts
 * Or add "dev:socket": "ts-node --project tsconfig.server.json server.ts"
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "./src/lib/jwt";
import { PrismaClient } from "@prisma/client";
import { startScheduler } from "./src/lib/jobs/scheduler";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "4000");

const app = next({ dev });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// In-memory state for active drivers and riders
// ──────────────────────────────────────────────
interface DriverLocation {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  vehicleType?: string;
  updatedAt: number;
  lastHeartbeatAt: number;
  isInTrip: boolean;
}

const onlineDrivers = new Map<string, DriverLocation>(); // userId -> location
const userSockets  = new Map<string, string>();           // userId -> socketId

// ──────────────────────────────────────────────
// Stale-driver auto-offline timer
// Mark drivers offline if no heartbeat for >90 s.
// Drivers actively in a trip (isInTrip) are exempt.
// ──────────────────────────────────────────────
const HEARTBEAT_TIMEOUT_MS = 90_000; // 90 s

async function markDriverOffline(userId: string, io: SocketIOServer) {
  onlineDrivers.delete(userId);
  try {
    await prisma.driverProfile.updateMany({
      where: { userId },
      data: { isOnline: false },
    });
  } catch (err) {
    console.warn("[Socket] DB offline update failed for", userId, err);
  }
  io.to("admin:monitor").emit("driver:status:change", {
    userId,
    isOnline: false,
    reason: "heartbeat_timeout",
  });
  console.log(`[Socket] Auto-offline: driver ${userId} (heartbeat timeout)`);
}

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "https://fairgo-react-admin.vercel.app",
        "https://fairgo-react-customer.vercel.app",
        "https://fairgo-react-driver.vercel.app",
        ...(process.env.ADMIN_WEB_URL    ? [process.env.ADMIN_WEB_URL]    : []),
        ...(process.env.CUSTOMER_APP_URL ? [process.env.CUSTOMER_APP_URL] : []),
        ...(process.env.DRIVER_APP_URL   ? [process.env.DRIVER_APP_URL]   : []),
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // ──────────────────────────────────────────────
  // Stale-driver sweep every 60 s
  // ──────────────────────────────────────────────
  setInterval(() => {
    const now = Date.now();
    for (const [userId, loc] of onlineDrivers.entries()) {
      if (loc.isInTrip) continue; // never auto-offline a driver in a trip
      const age = now - loc.lastHeartbeatAt;
      if (age > HEARTBEAT_TIMEOUT_MS) {
        markDriverOffline(userId, io).catch(() => {});
      }
    }
  }, 60_000);

  // ──────────────────────────────────────────────
  // Offer expiry sweep every 30 s
  // Atomically expires PENDING offers past their expiresAt
  // and notifies both parties in real time.
  // ──────────────────────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const expiredIds = await prisma.$queryRaw<{ id: string; rideRequestId: string; proposedBy: string }[]>`
        UPDATE ride_offers
        SET status = 'EXPIRED', "respondedAt" = ${now}
        WHERE status = 'PENDING'
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" < ${now}
        RETURNING id, "rideRequestId", "proposedBy"
      `;
      if (expiredIds.length === 0) return;

      const ids = expiredIds.map((r) => r.id);
      console.log(`[Socket] Offer expiry sweep: expired ${ids.length} offers`);

      // Load full offer data for notifications
      const expiredOffers = await prisma.rideOffer.findMany({
        where: { id: { in: ids } },
        include: {
          rideRequest: { include: { customerProfile: true } },
          driverProfile: { include: { user: { select: { id: true } } } },
        },
      });

      for (const offer of expiredOffers) {
        const driverUserId = offer.driverProfile.user.id;
        const customerUserId = offer.rideRequest.customerProfile.userId;
        const payload = { offerId: offer.id, rideRequestId: offer.rideRequestId };
        const driverSid = userSockets.get(driverUserId);
        const customerSid = userSockets.get(customerUserId);
        if (driverSid) io.to(`user:${driverUserId}`).emit("offer:expired", payload);
        if (customerSid) io.to(`user:${customerUserId}`).emit("offer:expired", payload);
      }

      // Reset ride requests with no remaining PENDING offers back to PENDING
      const affectedRideIds = [...new Set(expiredOffers.map((o) => o.rideRequestId))];
      for (const rideId of affectedRideIds) {
        const activePending = await prisma.rideOffer.count({
          where: { rideRequestId: rideId, status: "PENDING" },
        });
        if (activePending === 0) {
          await prisma.rideRequest.updateMany({
            where: { id: rideId, status: { in: ["MATCHING", "NEGOTIATING"] } },
            data: { status: "PENDING" },
          });
          const rideReq = expiredOffers.find((o) => o.rideRequestId === rideId)?.rideRequest;
          if (rideReq) {
            io.to(`user:${rideReq.customerProfile.userId}`).emit("ride:back_to_pending", { rideRequestId: rideId });
          }
        }
      }
    } catch (err) {
      console.error("[Socket] Offer expiry sweep error:", err);
    }
  }, 30_000);

  // ──────────────────────────────────────────────
  // Authentication middleware
  // ──────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as Socket & { user: typeof payload }).user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // ──────────────────────────────────────────────
  // Connection handler
  // ──────────────────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const user = (socket as Socket & { user: { userId: string; role: string } }).user;
    console.log(`[Socket.IO] Connected: ${user.userId} (${user.role}) sid=${socket.id}`);

    // Track socket <-> userId (update on reconnect)
    userSockets.set(user.userId, socket.id);

    // Join user's personal room
    socket.join(`user:${user.userId}`);

    // Role-specific setup
    if (user.role === "ADMIN") {
      socket.join("admin:monitor");
      // Send current online drivers snapshot
      socket.emit("drivers:snapshot", Array.from(onlineDrivers.values()));
    }

    if (user.role === "DRIVER") {
      socket.join(`driver:${user.userId}`);
    }

    if (user.role === "CUSTOMER") {
      socket.join(`customer:${user.userId}`);
    }

    // ──────────────────────────────────────────────
    // Generic room join — lets clients rejoin trip/ride rooms after reconnect
    // ──────────────────────────────────────────────
    socket.on("join:room", (payload: string | { room: string }) => {
      const room = typeof payload === "string" ? payload : payload?.room;
      if (!room) return;
      // Security: only allow joining rooms the user is permitted to access
      const allowed =
        room === `user:${user.userId}` ||
        room === `driver:${user.userId}` ||
        room === `customer:${user.userId}` ||
        room.startsWith("trip:") ||
        room.startsWith("ride:") ||
        room.startsWith("zone:");
      if (!allowed) {
        console.warn(`[Socket.IO] join:room denied: ${user.userId} -> ${room}`);
        return;
      }
      socket.join(room);
      console.log(`[Socket.IO] ${user.userId} joined ${room}`);
    });

    socket.on("leave:room", (payload: string | { room: string }) => {
      const room = typeof payload === "string" ? payload : payload?.room;
      if (room) socket.leave(room);
    });

    // ──────────────────────────────────────────────
    // Driver: heartbeat
    // ──────────────────────────────────────────────
    socket.on("driver:heartbeat", async (data?: { tripId?: string }) => {
      if (user.role !== "DRIVER") return;

      const now = Date.now();
      const existing = onlineDrivers.get(user.userId);
      const isInTrip = Boolean(data?.tripId || existing?.isInTrip);

      if (existing) {
        existing.lastHeartbeatAt = now;
        existing.isInTrip = isInTrip;
      } else {
        // Heartbeat arrived before driver:online — treat as implicit online
        onlineDrivers.set(user.userId, {
          driverId: user.userId,
          userId: user.userId,
          lat: 0,
          lng: 0,
          updatedAt: now,
          lastHeartbeatAt: now,
          isInTrip,
        });
      }

      // Persist lastSeenAt to DB (best-effort, non-blocking)
      prisma.driverProfile.updateMany({
        where: { userId: user.userId },
        data: { lastSeenAt: new Date(now) },
      }).catch(() => {});

      // Notify admin monitor
      io.to("admin:monitor").emit("driver:heartbeat", {
        userId: user.userId,
        timestamp: now,
        isInTrip,
      });
    });

    // ──────────────────────────────────────────────
    // Driver: update GPS location
    // ──────────────────────────────────────────────
    socket.on(
      "driver:location",
      (data: {
        lat: number;
        lng: number;
        heading?: number;
        speed?: number;
        vehicleType?: string;
        tripId?: string;
      }) => {
        if (user.role !== "DRIVER") return;

        const now = Date.now();
        const location: DriverLocation = {
          driverId: user.userId,
          userId: user.userId,
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
          speed: data.speed,
          vehicleType: data.vehicleType,
          updatedAt: now,
          lastHeartbeatAt: onlineDrivers.get(user.userId)?.lastHeartbeatAt ?? now,
          isInTrip: Boolean(data.tripId),
        };
        onlineDrivers.set(user.userId, location);

        // Persist location to DB (best-effort)
        prisma.driverProfile.updateMany({
          where: { userId: user.userId },
          data: {
            currentLatitude: data.lat,
            currentLongitude: data.lng,
            lastLocationUpdate: new Date(now),
          },
        }).catch(() => {});

        // Broadcast to zone room based on rough lat/lng grid
        const zone = `zone:${Math.floor(data.lat * 10)}:${Math.floor(data.lng * 10)}`;
        socket.join(zone);

        // Broadcast to admin monitor
        io.to("admin:monitor").emit("driver:location:update", location);

        // If on an active trip, update customer too
        if (data.tripId) {
          io.to(`trip:${data.tripId}`).emit("trip:driver:location", location);
        }
      }
    );

    // ──────────────────────────────────────────────
    // Driver: go online/offline
    // ──────────────────────────────────────────────
    socket.on("driver:online", async (data: { vehicleType?: string; tripId?: string }) => {
      if (user.role !== "DRIVER") return;

      const now = Date.now();
      const existing = onlineDrivers.get(user.userId);
      onlineDrivers.set(user.userId, {
        ...(existing ?? { lat: 0, lng: 0 }),
        driverId: user.userId,
        userId: user.userId,
        vehicleType: data?.vehicleType ?? existing?.vehicleType,
        updatedAt: now,
        lastHeartbeatAt: now,
        isInTrip: Boolean(data?.tripId),
      });

      // Persist to DB
      prisma.driverProfile.updateMany({
        where: { userId: user.userId },
        data: { isOnline: true, lastSeenAt: new Date(now) },
      }).catch(() => {});

      io.to("admin:monitor").emit("driver:status:change", {
        userId: user.userId,
        isOnline: true,
        vehicleType: data?.vehicleType,
      });

      // If reconnecting mid-trip, rejoin trip room
      if (data?.tripId) {
        socket.join(`trip:${data.tripId}`);
        console.log(`[Socket.IO] Driver ${user.userId} rejoined trip:${data.tripId} on reconnect`);
      }
    });

    socket.on("driver:offline", async () => {
      if (user.role !== "DRIVER") return;
      onlineDrivers.delete(user.userId);

      prisma.driverProfile.updateMany({
        where: { userId: user.userId },
        data: { isOnline: false },
      }).catch(() => {});

      io.to("admin:monitor").emit("driver:status:change", {
        userId: user.userId,
        isOnline: false,
      });
    });

    // ──────────────────────────────────────────────
    // Customer: join trip room
    // ──────────────────────────────────────────────
    socket.on("trip:join", (tripId: string) => {
      socket.join(`trip:${tripId}`);
      console.log(`[Socket.IO] ${user.userId} joined trip:${tripId}`);
    });

    socket.on("trip:leave", (tripId: string) => {
      socket.leave(`trip:${tripId}`);
    });

    // ──────────────────────────────────────────────
    // Ride request broadcast (handled by API, triggered here)
    // ──────────────────────────────────────────────
    socket.on(
      "ride:broadcast",
      (data: {
        rideRequestId: string;
        vehicleType: string;
        pickupLat: number;
        pickupLng: number;
        dropoffAddress: string;
        suggestedFare: number;
        customerName: string;
      }) => {
        if (user.role !== "CUSTOMER") return;
        // Broadcast to nearby driver zone
        const zone = `zone:${Math.floor(data.pickupLat * 10)}:${Math.floor(data.pickupLng * 10)}`;
        io.to(zone).to("admin:monitor").emit("ride:new_request", {
          ...data,
          customerId: user.userId,
          timestamp: Date.now(),
        });
      }
    );

    // ──────────────────────────────────────────────
    // In-app Chat — relay messages within trip room
    // ──────────────────────────────────────────────
    socket.on(
      "chat:message",
      (data: { tripId: string; text: string; fromRole: string }) => {
        if (!data.tripId || !data.text) return;
        const payload = {
          fromUserId: user.userId,
          fromRole: data.fromRole || user.role,
          text: data.text,
          timestamp: new Date().toISOString(),
        };
        // Broadcast to everyone else in the trip room
        socket.to(`trip:${data.tripId}`).emit("chat:message", payload);
        console.log(`[Chat] trip:${data.tripId} from ${user.role}: ${data.text}`);
      }
    );

    // ──────────────────────────────────────────────
    // Disconnect
    // ──────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Disconnected: ${user.userId} reason=${reason}`);

      // Only remove from userSockets if this socket is still the current one
      // (a reconnect may have already replaced it)
      if (userSockets.get(user.userId) === socket.id) {
        userSockets.delete(user.userId);
      }

      if (user.role === "DRIVER") {
        const loc = onlineDrivers.get(user.userId);
        // For transport-level drops, don't immediately mark offline —
        // the stale-driver timer will handle it if they don't reconnect.
        // Only explicitly mark offline for intentional disconnects.
        const intentional = reason === "server namespace disconnect" || reason === "client namespace disconnect";

        if (intentional) {
          onlineDrivers.delete(user.userId);
          prisma.driverProfile.updateMany({
            where: { userId: user.userId },
            data: { isOnline: false },
          }).catch(() => {});
          io.to("admin:monitor").emit("driver:status:change", {
            userId: user.userId,
            isOnline: false,
            reason,
          });
        } else {
          // Transport drop — mark as disconnected in admin but keep in onlineDrivers
          // until heartbeat timeout so brief reconnects don't flap the UI
          io.to("admin:monitor").emit("driver:status:change", {
            userId: user.userId,
            isOnline: true,
            reconnecting: true,
            lastHeartbeatAt: loc?.lastHeartbeatAt,
          });
        }
      }
    });
  });

  // ──────────────────────────────────────────────
  // Helpers exported for API routes to use
  // ──────────────────────────────────────────────
  // Store io and onlineDrivers on global so API routes can access them
  (global as Record<string, unknown>).__socketIO = io;
  (global as Record<string, unknown>).__onlineDrivers = onlineDrivers;
  (global as Record<string, unknown>).__userSockets = userSockets;

  // Start background cleanup/detection jobs (distributed-lock safe)
  startScheduler();

  httpServer.listen(port, () => {
    console.log(`> FAIRGO API + Socket.IO ready on http://localhost:${port}`);
  });
}

main().catch(console.error);
