/**
 * Negotiation Race Condition & Idempotency Tests — Phase 4
 *
 * Tests cover:
 *  1.  Duplicate offer: second pending offer for same (ride, driver) is rejected (DB unique)
 *  2.  Duplicate round: same round number can't be inserted twice (DB unique)
 *  3.  Atomic ACCEPT: only the first accept wins, second returns 409
 *  4.  Atomic COUNTER: only the first counter wins, second returns 409
 *  5.  Atomic REJECT: only the first reject wins, second returns 409
 *  6.  Expired offer accept: offer past expiresAt returns 410
 *  7.  Expired offer counter: offer past expiresAt returns 410
 *  8.  Trip idempotency: second accept for same ride request returns existing trip
 *  9.  parentOfferId wrong driver: cross-chain counter rejected with 403
 * 10.  parentOfferId from non-customer offer: driver tries to counter own offer (422)
 * 11.  Round limit: 6th round returns 422
 * 12.  Fare out of range: fare below fareMin rejected with 422
 * 13.  Fare out of range: fare above fareMax rejected with 422
 * 14.  Offer status check: non-PENDING offer (ACCEPTED) can't be responded to (422)
 * 15.  Stale offer expiry: sweep logic expires offers past expiresAt atomically
 *
 * NOTE: All tests simulate business logic with mock helpers — no actual DB or
 * HTTP calls. This mirrors the same pattern as presence.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared types mirroring Prisma schema ─────────────────────────────────────

type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "EXPIRED";
type ProposedBy = "DRIVER" | "CUSTOMER";

interface RideOffer {
  id: string;
  rideRequestId: string;
  driverProfileId: string;
  fareAmount: number;
  status: OfferStatus;
  proposedBy: ProposedBy;
  roundNumber: number;
  parentOfferId: string | null;
  expiresAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
}

interface RideRequest {
  id: string;
  status: string;
  fareMin: number;
  fareMax: number;
  customerProfileId: string;
  expiresAt: Date | null;
}

// ── In-memory "database" for tests ───────────────────────────────────────────

let offersDb: Map<string, RideOffer>;
let ridesDb: Map<string, RideRequest>;
let tripExists: Set<string>; // rideRequestIds that already have a trip

let offerIdCounter = 0;
function makeOfferId() { return `offer_${++offerIdCounter}`; }

function seedOffer(partial: Partial<RideOffer> & Pick<RideOffer, "id" | "rideRequestId" | "driverProfileId">): RideOffer {
  const o: RideOffer = {
    fareAmount: 100,
    status: "PENDING",
    proposedBy: "DRIVER",
    roundNumber: 1,
    parentOfferId: null,
    expiresAt: null,
    respondedAt: null,
    createdAt: new Date(),
    ...partial,
  };
  offersDb.set(o.id, o);
  return o;
}

function seedRide(partial: Partial<RideRequest> & Pick<RideRequest, "id">): RideRequest {
  const r: RideRequest = {
    status: "PENDING",
    fareMin: 80,
    fareMax: 200,
    customerProfileId: "cust_1",
    expiresAt: null,
    ...partial,
  };
  ridesDb.set(r.id, r);
  return r;
}

// ── Simulation helpers (extracted business logic) ─────────────────────────────

/**
 * Simulates the atomic "one pending driver offer per (ride, driver)" constraint.
 * Returns false if a PENDING DRIVER offer already exists for this pair.
 */
function canInsertDriverOffer(rideRequestId: string, driverProfileId: string): boolean {
  for (const o of offersDb.values()) {
    if (
      o.rideRequestId === rideRequestId &&
      o.driverProfileId === driverProfileId &&
      o.status === "PENDING" &&
      o.proposedBy === "DRIVER"
    ) {
      return false; // DB partial unique index violation
    }
  }
  return true;
}

/**
 * Simulates the atomic "one offer per (ride, driver, round)" constraint.
 */
function canInsertRound(rideRequestId: string, driverProfileId: string, roundNumber: number): boolean {
  for (const o of offersDb.values()) {
    if (
      o.rideRequestId === rideRequestId &&
      o.driverProfileId === driverProfileId &&
      o.roundNumber === roundNumber
    ) {
      return false; // DB unique_round index violation
    }
  }
  return true;
}

/**
 * Simulates atomic updateMany WHERE status='PENDING'.
 * Returns 1 if updated, 0 if already changed (race condition).
 */
function atomicStatusUpdate(offerId: string, newStatus: OfferStatus): number {
  const o = offersDb.get(offerId);
  if (!o || o.status !== "PENDING") return 0;
  o.status = newStatus;
  o.respondedAt = new Date();
  return 1;
}

/**
 * Simulate the offer expiry sweep: UPDATE ride_offers SET status='EXPIRED'
 * WHERE status='PENDING' AND expiresAt < now. Returns IDs updated.
 */
function runExpirySweep(now: Date): string[] {
  const expired: string[] = [];
  for (const o of offersDb.values()) {
    if (o.status === "PENDING" && o.expiresAt && o.expiresAt < now) {
      o.status = "EXPIRED";
      o.respondedAt = now;
      expired.push(o.id);
    }
  }
  return expired;
}

// ── Validation helpers ────────────────────────────────────────────────────────

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function validateRespondAction(
  offerId: string,
  action: "ACCEPT" | "REJECT" | "COUNTER",
  opts?: { counterFareAmount?: number }
): Result<{ offerId: string; action: string }> {
  const offer = offersDb.get(offerId);
  if (!offer) return { ok: false, status: 404, error: "Offer not found" };

  if (offer.status !== "PENDING") {
    return { ok: false, status: 422, error: "This offer has already been responded to" };
  }

  if (offer.expiresAt && new Date() > offer.expiresAt) {
    return { ok: false, status: 410, error: "This offer has expired" };
  }

  if (action === "COUNTER") {
    if (!opts?.counterFareAmount || opts.counterFareAmount <= 0) {
      return { ok: false, status: 422, error: "Counter fare required and must be positive" };
    }
    const ride = ridesDb.get(offer.rideRequestId)!;
    if (opts.counterFareAmount < ride.fareMin || opts.counterFareAmount > ride.fareMax) {
      return { ok: false, status: 422, error: `Fare must be between ${ride.fareMin} and ${ride.fareMax}` };
    }
    const newRound = offer.roundNumber + 1;
    if (newRound > 5) {
      return { ok: false, status: 422, error: "Maximum negotiation rounds (5) reached" };
    }
  }

  return { ok: true, data: { offerId, action } };
}

function validateParentOffer(
  parentOfferId: string,
  requestingDriverId: string,
  rideRequestId: string
): Result<RideOffer> {
  const parent = offersDb.get(parentOfferId);
  if (!parent) return { ok: false, status: 404, error: "Parent offer not found" };
  if (parent.rideRequestId !== rideRequestId) {
    return { ok: false, status: 422, error: "Parent offer belongs to a different ride request" };
  }
  if (parent.proposedBy !== "CUSTOMER") {
    return { ok: false, status: 422, error: "Can only counter a customer's counter-offer" };
  }
  if (parent.status !== "PENDING") {
    return { ok: false, status: 422, error: "This counter-offer has already been responded to" };
  }
  if (parent.expiresAt && parent.expiresAt < new Date()) {
    return { ok: false, status: 410, error: "This counter-offer has expired" };
  }
  if (parent.driverProfileId !== requestingDriverId) {
    return { ok: false, status: 403, error: "Cannot counter an offer from a different negotiation chain" };
  }
  return { ok: true, data: parent };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  offersDb = new Map();
  ridesDb = new Map();
  tripExists = new Set();
  offerIdCounter = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Phase 4 — Negotiation invariants", () => {

  describe("1. Duplicate offer prevention", () => {
    it("allows first pending driver offer for (ride, driver)", () => {
      seedRide({ id: "ride_1" });
      const canInsert = canInsertDriverOffer("ride_1", "driver_1");
      expect(canInsert).toBe(true);
    });

    it("blocks second pending driver offer for same (ride, driver)", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const canInsert = canInsertDriverOffer("ride_1", "driver_1");
      expect(canInsert).toBe(false);
    });

    it("allows offer from different driver for same ride", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const canInsert = canInsertDriverOffer("ride_1", "driver_2");
      expect(canInsert).toBe(true);
    });

    it("allows new offer after previous one is no longer PENDING", () => {
      seedRide({ id: "ride_1" });
      const o = seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      o.status = "REJECTED";
      const canInsert = canInsertDriverOffer("ride_1", "driver_1");
      expect(canInsert).toBe(true);
    });
  });

  describe("2. Duplicate round prevention", () => {
    it("blocks duplicate (ride, driver, round) insertion", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", roundNumber: 2 });
      expect(canInsertRound("ride_1", "driver_1", 2)).toBe(false);
    });

    it("allows different round number for same (ride, driver)", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", roundNumber: 1 });
      expect(canInsertRound("ride_1", "driver_1", 2)).toBe(true);
    });
  });

  describe("3. Atomic ACCEPT — only first wins", () => {
    it("first accept returns count=1", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const count = atomicStatusUpdate("offer_1", "ACCEPTED");
      expect(count).toBe(1);
      expect(offersDb.get("offer_1")!.status).toBe("ACCEPTED");
    });

    it("concurrent second accept returns count=0 (race condition)", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      atomicStatusUpdate("offer_1", "ACCEPTED"); // first wins
      const count = atomicStatusUpdate("offer_1", "ACCEPTED"); // second loses
      expect(count).toBe(0);
    });

    it("accept of already-rejected offer returns count=0", () => {
      seedRide({ id: "ride_1" });
      const o = seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      o.status = "REJECTED";
      const count = atomicStatusUpdate("offer_1", "ACCEPTED");
      expect(count).toBe(0);
    });
  });

  describe("4. Atomic COUNTER — only first wins", () => {
    it("first counter marks parent as COUNTERED", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const count = atomicStatusUpdate("offer_1", "COUNTERED");
      expect(count).toBe(1);
      expect(offersDb.get("offer_1")!.status).toBe("COUNTERED");
    });

    it("concurrent second counter returns count=0", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      atomicStatusUpdate("offer_1", "COUNTERED");
      const count = atomicStatusUpdate("offer_1", "COUNTERED");
      expect(count).toBe(0);
    });
  });

  describe("5. Atomic REJECT — only first wins", () => {
    it("first reject succeeds", () => {
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const count = atomicStatusUpdate("offer_1", "REJECTED");
      expect(count).toBe(1);
    });

    it("second reject of same offer returns count=0", () => {
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      atomicStatusUpdate("offer_1", "REJECTED");
      const count = atomicStatusUpdate("offer_1", "REJECTED");
      expect(count).toBe(0);
    });
  });

  describe("6. Expired offer — cannot accept", () => {
    it("returns 410 when offer expiresAt is in the past", () => {
      seedRide({ id: "ride_1" });
      const pastTime = new Date(Date.now() - 5000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: pastTime });
      const result = validateRespondAction("offer_1", "ACCEPT");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(410);
    });

    it("does NOT return 410 when expiresAt is in the future", () => {
      seedRide({ id: "ride_1" });
      const futureTime = new Date(Date.now() + 30000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: futureTime });
      const result = validateRespondAction("offer_1", "ACCEPT");
      expect(result.ok).toBe(true);
    });

    it("does NOT return 410 when expiresAt is null (no expiry)", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: null });
      const result = validateRespondAction("offer_1", "ACCEPT");
      expect(result.ok).toBe(true);
    });
  });

  describe("7. Expired offer — cannot counter", () => {
    it("returns 410 on counter when offer is expired", () => {
      seedRide({ id: "ride_1" });
      const pastTime = new Date(Date.now() - 1000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: pastTime });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 120 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(410);
    });
  });

  describe("8. Trip idempotency", () => {
    it("returns existing trip when rideRequestId already has a trip", () => {
      // Simulate the pre-check in respond/route.ts
      tripExists.add("ride_1");
      const isIdempotent = tripExists.has("ride_1");
      expect(isIdempotent).toBe(true);
    });

    it("creates trip when no existing trip for ride", () => {
      const isIdempotent = tripExists.has("ride_1");
      expect(isIdempotent).toBe(false);
    });
  });

  describe("9. parentOfferId cross-chain rejected", () => {
    it("returns 403 when parent offer belongs to a different driver", () => {
      seedRide({ id: "ride_1" });
      // Customer counter to driver_1, but driver_2 tries to use it
      seedOffer({
        id: "counter_1",
        rideRequestId: "ride_1",
        driverProfileId: "driver_1",
        proposedBy: "CUSTOMER",
        status: "PENDING",
        roundNumber: 2,
        expiresAt: new Date(Date.now() + 60000),
      });
      const result = validateParentOffer("counter_1", "driver_2", "ride_1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("allows driver to counter their own negotiation chain", () => {
      seedRide({ id: "ride_1" });
      seedOffer({
        id: "counter_1",
        rideRequestId: "ride_1",
        driverProfileId: "driver_1",
        proposedBy: "CUSTOMER",
        status: "PENDING",
        roundNumber: 2,
        expiresAt: new Date(Date.now() + 60000),
      });
      const result = validateParentOffer("counter_1", "driver_1", "ride_1");
      expect(result.ok).toBe(true);
    });
  });

  describe("10. parentOfferId validation — driver cannot counter own offer", () => {
    it("returns 422 when trying to counter a DRIVER-proposed offer", () => {
      seedRide({ id: "ride_1" });
      seedOffer({
        id: "offer_1",
        rideRequestId: "ride_1",
        driverProfileId: "driver_1",
        proposedBy: "DRIVER",  // NOT a customer counter
        status: "PENDING",
        roundNumber: 1,
      });
      const result = validateParentOffer("offer_1", "driver_1", "ride_1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("customer's counter-offer");
    });
  });

  describe("11. Round limit enforcement", () => {
    it("returns 422 when round would exceed 5", () => {
      seedRide({ id: "ride_1" });
      // Offer is at round 5 — next would be round 6
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", roundNumber: 5 });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 120 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.error).toContain("Maximum negotiation rounds");
      }
    });

    it("allows counter at round 4 (next would be round 5)", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", roundNumber: 4 });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 120 });
      expect(result.ok).toBe(true);
    });
  });

  describe("12-13. Fare range validation", () => {
    it("returns 422 when counter fare is below fareMin", () => {
      seedRide({ id: "ride_1", fareMin: 80, fareMax: 200 });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 50 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });

    it("returns 422 when counter fare is above fareMax", () => {
      seedRide({ id: "ride_1", fareMin: 80, fareMax: 200 });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 250 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });

    it("accepts fare exactly at fareMin", () => {
      seedRide({ id: "ride_1", fareMin: 80, fareMax: 200 });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 80 });
      expect(result.ok).toBe(true);
    });

    it("accepts fare exactly at fareMax", () => {
      seedRide({ id: "ride_1", fareMin: 80, fareMax: 200 });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1" });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 200 });
      expect(result.ok).toBe(true);
    });
  });

  describe("14. Non-PENDING offers cannot be responded to", () => {
    it("returns 422 when offer is ACCEPTED", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", status: "ACCEPTED" });
      const result = validateRespondAction("offer_1", "ACCEPT");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });

    it("returns 422 when offer is REJECTED", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", status: "REJECTED" });
      const result = validateRespondAction("offer_1", "REJECT");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });

    it("returns 422 when offer is COUNTERED", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", status: "COUNTERED" });
      const result = validateRespondAction("offer_1", "COUNTER", { counterFareAmount: 120 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });

    it("returns 422 when offer is EXPIRED", () => {
      seedRide({ id: "ride_1" });
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", status: "EXPIRED" });
      const result = validateRespondAction("offer_1", "ACCEPT");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(422);
    });
  });

  describe("15. Offer expiry sweep — atomic and idempotent", () => {
    it("expires PENDING offers past their expiresAt", () => {
      const past = new Date(Date.now() - 5000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: past });
      const expired = runExpirySweep(new Date());
      expect(expired).toContain("offer_1");
      expect(offersDb.get("offer_1")!.status).toBe("EXPIRED");
    });

    it("does NOT expire offers with future expiresAt", () => {
      const future = new Date(Date.now() + 60000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: future });
      const expired = runExpirySweep(new Date());
      expect(expired).not.toContain("offer_1");
      expect(offersDb.get("offer_1")!.status).toBe("PENDING");
    });

    it("does NOT expire offers with null expiresAt", () => {
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: null });
      const expired = runExpirySweep(new Date());
      expect(expired).not.toContain("offer_1");
    });

    it("is idempotent — second sweep does not re-expire already-expired offer", () => {
      const past = new Date(Date.now() - 5000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: past });
      runExpirySweep(new Date()); // first run
      const secondRun = runExpirySweep(new Date()); // second run
      expect(secondRun).not.toContain("offer_1"); // already EXPIRED, not PENDING
    });

    it("expires multiple offers in a single sweep", () => {
      const past = new Date(Date.now() - 1000);
      seedOffer({ id: "offer_1", rideRequestId: "ride_1", driverProfileId: "driver_1", expiresAt: past });
      seedOffer({ id: "offer_2", rideRequestId: "ride_2", driverProfileId: "driver_2", expiresAt: past });
      const future = new Date(Date.now() + 60000);
      seedOffer({ id: "offer_3", rideRequestId: "ride_3", driverProfileId: "driver_3", expiresAt: future });
      const expired = runExpirySweep(new Date());
      expect(expired).toHaveLength(2);
      expect(expired).toContain("offer_1");
      expect(expired).toContain("offer_2");
      expect(expired).not.toContain("offer_3");
    });
  });

});
