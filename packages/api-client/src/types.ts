export type UserRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type VehicleType = 'TAXI' | 'MOTORCYCLE' | 'TUKTUK';
export type DriverVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RideRequestStatus = 'PENDING' | 'MATCHING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
export type RideOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
export type TripStatus = 'DRIVER_ASSIGNED' | 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'PICKUP_CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'WALLET';

export interface User {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  locale: string;
  createdAt: string;
  customerProfile?: CustomerProfile;
  driverProfile?: DriverProfile;
}

export interface CustomerProfile {
  id: string;
  userId: string;
  totalTrips: number;
  averageRating: number;
  defaultPaymentMethod: PaymentMethod;
}

export interface DriverProfile {
  id: string;
  userId: string;
  licenseNumber?: string;
  isOnline: boolean;
  isVerified: boolean;
  verificationStatus: DriverVerificationStatus;
  currentLatitude?: number;
  currentLongitude?: number;
  totalTrips: number;
  averageRating: number;
  commissionRate: number;
  vehicles?: Vehicle[];
  user?: User;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  year?: number;
  photoUrl?: string;
  isActive: boolean;
}

export interface RideRequest {
  id: string;
  vehicleType: VehicleType;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  dropoffAddress: string;
  fareMin: number;
  fareMax: number;
  fareOffer: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  status: RideRequestStatus;
  createdAt: string;
  customerProfile?: CustomerProfile & { user?: User };
  offers?: RideOffer[];
}

export interface RideOffer {
  id: string;
  rideRequestId: string;
  fareAmount: number;
  estimatedPickupMinutes?: number;
  message?: string;
  status: RideOfferStatus;
  createdAt: string;
  driverProfile?: DriverProfile;
}

export interface Trip {
  id: string;
  rideRequestId: string;
  lockedFare: number;
  status: TripStatus;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
  actualDistance?: number;
  actualDuration?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  driverProfile?: DriverProfile;
  payment?: Payment;
  ratings?: Rating[];
}

export interface Payment {
  id: string;
  tripId: string;
  amount: number;
  commission: number;
  driverEarning: number;
  method: PaymentMethod;
  status: string;
  paidAt?: string;
}

export interface Rating {
  id: string;
  score: number;
  tags: string[];
  comment?: string;
  fromUserId: string;
  toUserId: string;
}

export interface Wallet {
  id: string;
  balance: number;
  currency: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface PricingRule {
  id: string;
  vehicleType: VehicleType;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  isActive: boolean;
}

export interface ApiError {
  error: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
