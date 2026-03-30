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

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "4000");

const app = next({ dev });
const handle = app.getRequestHandler();

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
}

const onlineDrivers = new Map<string, DriverLocation>(); // userId -> location
const userSockets = new Map<string, string>(); // userId -> socketId

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        process.env.ADMIN_WEB_URL || "http://localhost:3000",
        process.env.CUSTOMER_APP_URL || "*",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

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
    console.log(`[Socket.IO] Connected: ${user.userId} (${user.role})`);

    // Track socket <-> userId
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

        const location: DriverLocation = {
          driverId: user.userId,
          userId: user.userId,
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
          speed: data.speed,
          vehicleType: data.vehicleType,
          updatedAt: Date.now(),
        };
        onlineDrivers.set(user.userId, location);

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
    socket.on("driver:online", (data: { vehicleType?: string }) => {
      if (user.role !== "DRIVER") return;
      io.to("admin:monitor").emit("driver:status:change", {
        userId: user.userId,
        isOnline: true,
        vehicleType: data?.vehicleType,
      });
    });

    socket.on("driver:offline", () => {
      if (user.role !== "DRIVER") return;
      onlineDrivers.delete(user.userId);
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
    // Disconnect
    // ──────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Disconnected: ${user.userId}`);
      userSockets.delete(user.userId);
      if (user.role === "DRIVER") {
        onlineDrivers.delete(user.userId);
        io.to("admin:monitor").emit("driver:status:change", {
          userId: user.userId,
          isOnline: false,
        });
      }
    });
  });

  // ──────────────────────────────────────────────
  // Helpers exported for API routes to use
  // ──────────────────────────────────────────────
  // Store io on global so API routes can emit
  (global as Record<string, unknown>).__socketIO = io;

  httpServer.listen(port, () => {
    console.log(`> FAIRGO API + Socket.IO ready on http://localhost:${port}`);
  });
}

main().catch(console.error);
