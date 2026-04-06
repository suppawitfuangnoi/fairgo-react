import { z } from "zod";

// ==================== Auth Schemas ====================

// Accept +66XXXXXXXXX, 0XXXXXXXXX, or 9-digit bare (all normalised server-side)
const thaiPhoneSchema = z
  .string()
  .min(9)
  .max(15)
  .refine(
    (v) => /^(\+66\d{9}|0\d{9}|\d{9})$/.test(v.replace(/[\s\-]/g, "")),
    "Invalid Thai phone number (use 0812345678 or +66812345678)"
  );

export const requestOtpSchema = z.object({
  phone: thaiPhoneSchema,
  role:  z.enum(["CUSTOMER", "DRIVER"]).optional().default("CUSTOMER"),
});

export const verifyOtpSchema = z.object({
  phone:  thaiPhoneSchema,
  otpRef: z.string().min(8).max(16),
  code:   z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must be numeric"),
  role:   z.enum(["CUSTOMER", "DRIVER"]).optional().default("CUSTOMER"),
  name:   z.string().min(1).max(100).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ==================== User Schemas ====================

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  locale: z.enum(["th", "en"]).optional(),
});

// ==================== Ride Request Schemas ====================

export const createRideRequestSchema = z.object({
  vehicleType: z.enum(["TAXI", "MOTORCYCLE", "TUKTUK"]),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  pickupAddress: z.string().min(1).max(500),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
  dropoffAddress: z.string().min(1).max(500),
  fareOffer: z.number().positive("Fare must be positive"),
  fareMin: z.number().positive("Minimum fare must be positive"),
  fareMax: z.number().positive("Maximum fare must be positive"),
  paymentMethod: z.enum(["CASH", "CARD", "WALLET"]).optional().default("CASH"),
});

export const fareEstimateSchema = z.object({
  vehicleType: z.enum(["TAXI", "MOTORCYCLE", "TUKTUK"]),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
});

// ==================== Ride Offer Schemas ====================

export const createRideOfferSchema = z.object({
  rideRequestId: z.string().min(1),
  fareAmount: z.number().positive("Fare amount must be positive"),
  estimatedPickupMinutes: z.number().int().positive().optional(),
  message: z.string().max(200).optional(),
  parentOfferId: z.string().optional(), // For driver counter-offer
});

export const respondToOfferSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "COUNTER"]),
  counterFareAmount: z.number().positive().optional(), // Required when action=COUNTER
  message: z.string().max(200).optional(),
});

// ==================== Trip Schemas ====================

export const updateTripStatusSchema = z.object({
  status: z.enum([
    "DRIVER_EN_ROUTE",
    "DRIVER_ARRIVED",
    "PICKUP_CONFIRMED",
    "IN_PROGRESS",
    "ARRIVED_DESTINATION",
    "AWAITING_CASH_CONFIRMATION",
    "COMPLETED",
    "CANCELLED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "NO_SHOW_PASSENGER",
    "NO_SHOW_DRIVER",
  ]),
  cancelReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

export const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
});

// ==================== Rating Schemas ====================

export const createRatingSchema = z.object({
  tripId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional().default([]),
  comment: z.string().max(500).optional(),
});

// ==================== Admin Schemas ====================

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const verifyDriverSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().optional(),
});

// ==================== Driver Profile Schemas ====================

export const updateDriverProfileSchema = z.object({
  licenseNumber: z.string().optional(),
  isOnline: z.boolean().optional(),
});

export const registerVehicleSchema = z.object({
  type: z.enum(["TAXI", "MOTORCYCLE", "TUKTUK"]),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  color: z.string().min(1).max(50),
  year: z.number().int().min(1990).max(2030).optional(),
  plateNumber: z.string().min(1).max(20),
});

// ==================== Pagination ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
