import { PrismaClient, UserRole, VehicleType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding FAIRGO database...");

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.couponRedemption.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.tripLocation.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.rideOffer.deleteMany();
  await prisma.rideRequest.deleteMany();
  await prisma.driverDocument.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.user.deleteMany();

  // ==================== ADMIN USER ====================
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.create({
    data: {
      phone: "+66800000001",
      email: "admin@fairgo.th",
      name: "Anan S.",
      role: UserRole.ADMIN,
      adminProfile: {
        create: {
          department: "Operations",
          permissions: {
            passwordHash,
            users: true,
            drivers: true,
            trips: true,
            payments: true,
            reports: true,
            settings: true,
          },
        },
      },
    },
  });
  console.log("  Admin created:", admin.email);

  // ==================== CUSTOMERS ====================
  const customer1 = await prisma.user.create({
    data: {
      phone: "+66812345678",
      email: "sarah.j@email.com",
      name: "Sarah J.",
      role: UserRole.CUSTOMER,
      customerProfile: {
        create: {
          totalTrips: 45,
          averageRating: 4.9,
          savedPlaces: {
            home: { lat: 13.7461, lng: 100.5347, address: "Sukhumvit Soi 24, Bangkok" },
            work: { lat: 13.7469, lng: 100.5392, address: "Siam Paragon, Bangkok" },
          },
        },
      },
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      phone: "+66823456789",
      email: "mark.w@email.com",
      name: "Mark W.",
      role: UserRole.CUSTOMER,
      customerProfile: {
        create: {
          totalTrips: 12,
          averageRating: 4.8,
        },
      },
    },
  });

  const customer3 = await prisma.user.create({
    data: {
      phone: "+66834567890",
      email: "emma.d@email.com",
      name: "Emma D.",
      role: UserRole.CUSTOMER,
      customerProfile: {
        create: {
          totalTrips: 8,
          averageRating: 5.0,
        },
      },
    },
  });
  console.log("  Customers created:", 3);

  // ==================== DRIVERS ====================
  const driver1 = await prisma.user.create({
    data: {
      phone: "+66891234567",
      email: "somchai.r@email.com",
      name: "Somchai R.",
      role: UserRole.DRIVER,
      driverProfile: {
        create: {
          licenseNumber: "TH-DL-12345",
          isOnline: true,
          isVerified: true,
          verificationStatus: "APPROVED",
          currentLatitude: 13.7463,
          currentLongitude: 100.5347,
          lastLocationUpdate: new Date(),
          totalTrips: 1240,
          averageRating: 4.8,
          acceptanceRate: 0.92,
          commissionRate: 0.15,
        },
      },
    },
    include: { driverProfile: true },
  });

  const driver2 = await prisma.user.create({
    data: {
      phone: "+66892345678",
      email: "kittisak.m@email.com",
      name: "Kittisak M.",
      role: UserRole.DRIVER,
      driverProfile: {
        create: {
          licenseNumber: "TH-DL-23456",
          isOnline: true,
          isVerified: true,
          verificationStatus: "APPROVED",
          currentLatitude: 13.7563,
          currentLongitude: 100.5018,
          lastLocationUpdate: new Date(),
          totalTrips: 850,
          averageRating: 4.6,
          acceptanceRate: 0.88,
          commissionRate: 0.15,
        },
      },
    },
    include: { driverProfile: true },
  });

  const driver3 = await prisma.user.create({
    data: {
      phone: "+66893456789",
      email: "wichai.l@email.com",
      name: "Wichai L.",
      role: UserRole.DRIVER,
      driverProfile: {
        create: {
          licenseNumber: "TH-DL-34567",
          isOnline: false,
          isVerified: true,
          verificationStatus: "APPROVED",
          currentLatitude: 13.7300,
          currentLongitude: 100.5200,
          lastLocationUpdate: new Date(),
          totalTrips: 320,
          averageRating: 4.9,
          acceptanceRate: 0.95,
          commissionRate: 0.15,
        },
      },
    },
    include: { driverProfile: true },
  });

  // Unverified driver
  const driver4 = await prisma.user.create({
    data: {
      phone: "+66894567890",
      email: "jane.smith@email.com",
      name: "Jane Smith",
      role: UserRole.DRIVER,
      status: "PENDING_VERIFICATION",
      driverProfile: {
        create: {
          licenseNumber: "TH-DL-45678",
          isOnline: false,
          isVerified: false,
          verificationStatus: "PENDING",
        },
      },
    },
    include: { driverProfile: true },
  });
  console.log("  Drivers created:", 4);

  // ==================== VEHICLES ====================
  await prisma.vehicle.createMany({
    data: [
      {
        driverProfileId: driver1.driverProfile!.id,
        type: VehicleType.TAXI,
        make: "Toyota",
        model: "Altis",
        color: "White",
        year: 2022,
        plateNumber: "1AB-1234",
      },
      {
        driverProfileId: driver2.driverProfile!.id,
        type: VehicleType.TAXI,
        make: "Honda",
        model: "City",
        color: "Grey",
        year: 2021,
        plateNumber: "2CD-5678",
      },
      {
        driverProfileId: driver3.driverProfile!.id,
        type: VehicleType.MOTORCYCLE,
        make: "Honda",
        model: "PCX",
        color: "Black",
        year: 2023,
        plateNumber: "3EF-9012",
      },
      {
        driverProfileId: driver4.driverProfile!.id,
        type: VehicleType.TUKTUK,
        make: "Custom",
        model: "Tuk-Tuk",
        color: "Yellow",
        year: 2020,
        plateNumber: "4GH-3456",
      },
    ],
  });
  console.log("  Vehicles created:", 4);

  // ==================== PRICING RULES ====================
  await prisma.pricingRule.createMany({
    data: [
      {
        vehicleType: VehicleType.TAXI,
        baseFare: 35,
        perKmRate: 6.5,
        perMinuteRate: 2,
        minimumFare: 35,
      },
      {
        vehicleType: VehicleType.MOTORCYCLE,
        baseFare: 25,
        perKmRate: 5,
        perMinuteRate: 1.5,
        minimumFare: 25,
      },
      {
        vehicleType: VehicleType.TUKTUK,
        baseFare: 40,
        perKmRate: 8,
        perMinuteRate: 2.5,
        minimumFare: 40,
      },
    ],
  });
  console.log("  Pricing rules created:", 3);

  // ==================== SAMPLE RIDE REQUESTS ====================
  const cp1 = await prisma.customerProfile.findUnique({
    where: { userId: customer1.id },
  });
  const cp2 = await prisma.customerProfile.findUnique({
    where: { userId: customer2.id },
  });
  const cp3 = await prisma.customerProfile.findUnique({
    where: { userId: customer3.id },
  });

  // Active ride request
  const ride1 = await prisma.rideRequest.create({
    data: {
      customerProfileId: cp1!.id,
      vehicleType: VehicleType.TAXI,
      pickupLatitude: 13.7469,
      pickupLongitude: 100.5392,
      pickupAddress: "Siam Paragon, Gate 1",
      dropoffLatitude: 13.7262,
      dropoffLongitude: 100.5098,
      dropoffAddress: "ICONSIAM",
      fareMin: 100,
      fareMax: 200,
      fareOffer: 145,
      recommendedFare: 148,
      estimatedDistance: 8.5,
      estimatedDuration: 25,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // Completed ride with trip
  const ride2 = await prisma.rideRequest.create({
    data: {
      customerProfileId: cp1!.id,
      vehicleType: VehicleType.TAXI,
      pickupLatitude: 13.7469,
      pickupLongitude: 100.5392,
      pickupAddress: "Siam Paragon",
      dropoffLatitude: 13.7400,
      dropoffLongitude: 100.5600,
      dropoffAddress: "Silom Complex",
      fareMin: 60,
      fareMax: 120,
      fareOffer: 85,
      recommendedFare: 82,
      estimatedDistance: 4.2,
      estimatedDuration: 15,
      status: "MATCHED",
    },
  });

  const ride3 = await prisma.rideRequest.create({
    data: {
      customerProfileId: cp2!.id,
      vehicleType: VehicleType.MOTORCYCLE,
      pickupLatitude: 13.7563,
      pickupLongitude: 100.5018,
      pickupAddress: "Ari Station Exit 3",
      dropoffLatitude: 13.7600,
      dropoffLongitude: 100.5100,
      dropoffAddress: "La Villa Ari Market",
      fareMin: 30,
      fareMax: 60,
      fareOffer: 40,
      recommendedFare: 38,
      estimatedDistance: 1.8,
      estimatedDuration: 8,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // Cancelled ride
  await prisma.rideRequest.create({
    data: {
      customerProfileId: cp3!.id,
      vehicleType: VehicleType.TAXI,
      pickupLatitude: 13.6900,
      pickupLongitude: 100.7501,
      pickupAddress: "Suvarnabhumi Airport (BKK)",
      dropoffLatitude: 13.7234,
      dropoffLongitude: 100.5294,
      dropoffAddress: "Sheraton Grand Sukhumvit",
      fareMin: 300,
      fareMax: 550,
      fareOffer: 450,
      recommendedFare: 420,
      estimatedDistance: 30,
      estimatedDuration: 45,
      status: "CANCELLED",
      cancelledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      cancelReason: "Changed plans",
    },
  });
  console.log("  Ride requests created:", 4);

  // ==================== RIDE OFFERS ====================
  const vehicle1 = await prisma.vehicle.findFirst({
    where: { driverProfileId: driver1.driverProfile!.id },
  });

  await prisma.rideOffer.create({
    data: {
      rideRequestId: ride1.id,
      driverProfileId: driver1.driverProfile!.id,
      fareAmount: 120,
      estimatedPickupMinutes: 3,
      message: "I'm nearby, can pick you up quickly!",
      status: "PENDING",
    },
  });

  await prisma.rideOffer.create({
    data: {
      rideRequestId: ride1.id,
      driverProfileId: driver2.driverProfile!.id,
      fareAmount: 135,
      estimatedPickupMinutes: 5,
      status: "PENDING",
    },
  });

  // Accepted offer for completed ride
  const acceptedOffer = await prisma.rideOffer.create({
    data: {
      rideRequestId: ride2.id,
      driverProfileId: driver1.driverProfile!.id,
      fareAmount: 85,
      estimatedPickupMinutes: 4,
      status: "ACCEPTED",
      respondedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  });
  console.log("  Ride offers created:", 3);

  // ==================== COMPLETED TRIP ====================
  const trip1 = await prisma.trip.create({
    data: {
      rideRequestId: ride2.id,
      driverProfileId: driver1.driverProfile!.id,
      vehicleId: vehicle1!.id,
      lockedFare: 85,
      status: "COMPLETED",
      pickupLatitude: 13.7469,
      pickupLongitude: 100.5392,
      pickupAddress: "Siam Paragon",
      dropoffLatitude: 13.7400,
      dropoffLongitude: 100.5600,
      dropoffAddress: "Silom Complex",
      actualDistance: 4.5,
      actualDuration: 18,
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 2.7 * 60 * 60 * 1000),
    },
  });

  // Payment for completed trip
  await prisma.payment.create({
    data: {
      tripId: trip1.id,
      amount: 85,
      commission: 12.75,
      driverEarning: 72.25,
      method: "CASH",
      status: "COMPLETED",
      paidAt: new Date(Date.now() - 2.7 * 60 * 60 * 1000),
    },
  });

  // Rating for completed trip
  await prisma.rating.create({
    data: {
      tripId: trip1.id,
      fromUserId: customer1.id,
      toUserId: driver1.id,
      score: 5,
      tags: ["Fair price", "Friendly driver", "Clean car"],
      comment: "Great ride, very smooth!",
    },
  });
  console.log("  Trips, payments, ratings created");

  // ==================== WALLETS ====================
  const dp1 = driver1.driverProfile!;
  await prisma.wallet.create({
    data: {
      driverProfileId: dp1.id,
      balance: 845.50,
      currency: "THB",
    },
  });

  await prisma.wallet.create({
    data: {
      customerProfileId: cp1!.id,
      balance: 250,
      currency: "THB",
    },
  });
  console.log("  Wallets created:", 2);

  // ==================== COUPONS ====================
  await prisma.coupon.create({
    data: {
      code: "SAVE5",
      description: "Save 5% on your next ride",
      discountType: "PERCENTAGE",
      discountValue: 5,
      maxDiscount: 50,
      minFare: 50,
      maxRedemptions: 1000,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.coupon.create({
    data: {
      code: "FAIRGO20",
      description: "20 THB off your first ride",
      discountType: "FIXED",
      discountValue: 20,
      minFare: 40,
      maxRedemptions: 5000,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("  Coupons created:", 2);

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
