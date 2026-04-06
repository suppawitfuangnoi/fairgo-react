-- Phase 4: Negotiation Concurrency Safety Constraints
-- These partial indexes enforce negotiation invariants at the database level,
-- making race conditions fail fast rather than silently corrupt data.

-- 1. One PENDING driver-proposed offer per (ride, driver) at a time.
--    A driver cannot submit two concurrent initial offers for the same ride.
--    Once the offer moves to COUNTERED/ACCEPTED/REJECTED/EXPIRED the slot opens.
CREATE UNIQUE INDEX ride_offers_one_pending_driver
  ON ride_offers("rideRequestId", "driverProfileId")
  WHERE status = 'PENDING' AND "proposedBy" = 'DRIVER';

-- 2. One offer per (ride, driver, round) — prevents duplicate counter submissions
--    for the same round even across parallel retries.
CREATE UNIQUE INDEX ride_offers_unique_round
  ON ride_offers("rideRequestId", "driverProfileId", "roundNumber");

-- 3. One PENDING customer-counter per (ride, driver) at a time.
--    Prevents a customer from sending two counters to the same driver simultaneously.
CREATE UNIQUE INDEX ride_offers_one_pending_customer
  ON ride_offers("rideRequestId", "driverProfileId")
  WHERE status = 'PENDING' AND "proposedBy" = 'CUSTOMER';
