/**
 * scheduler.ts
 *
 * Central orchestrator for all background cleanup jobs.
 * Called once from server.ts after the Socket.IO instance is ready.
 *
 * Job intervals:
 *  - otp-cleanup              every 30 min  (10 s initial delay)
 *  - offer-cleanup            every  5 min  (30 s initial delay)
 *  - ride-request-cleanup     every 10 min  (30 s initial delay)
 *  - trip-stuck-detection     every 10 min  (30 s initial delay)
 *  - driver-presence-cleanup  every  5 min  (10 s initial delay)
 *
 * The short initial delays ensure the Socket.IO server is fully initialised
 * before any job tries to emit events, while avoiding a thundering-herd on
 * startup.
 *
 * The `schedulerStarted` guard means calling startScheduler() more than once
 * (e.g. due to hot-reload in development) is harmless.
 */

import { runOtpCleanup } from "./otp-cleanup";
import { runOfferCleanup } from "./offer-cleanup";
import { runRideRequestCleanup } from "./ride-request-cleanup";
import { runTripStuckDetection } from "./trip-stuck-detection";
import { runDriverPresenceCleanup } from "./driver-presence-cleanup";

const MINUTE = 60 * 1000;

let schedulerStarted = false;

export function startScheduler(): void {
  if (schedulerStarted) {
    console.log("[Scheduler] Already running — skipping re-init");
    return;
  }
  schedulerStarted = true;
  console.log("[Scheduler] Starting background jobs…");

  // ── OTP cleanup — every 30 min ────────────────────────────────────────────
  setTimeout(() => {
    runOtpCleanup().catch(console.error);
    setInterval(() => runOtpCleanup().catch(console.error), 30 * MINUTE);
  }, 10 * 1000);

  // ── Offer cleanup — every 5 min ───────────────────────────────────────────
  setTimeout(() => {
    runOfferCleanup().catch(console.error);
    setInterval(() => runOfferCleanup().catch(console.error), 5 * MINUTE);
  }, 30 * 1000);

  // ── Ride request cleanup — every 10 min ───────────────────────────────────
  setTimeout(() => {
    runRideRequestCleanup().catch(console.error);
    setInterval(() => runRideRequestCleanup().catch(console.error), 10 * MINUTE);
  }, 30 * 1000);

  // ── Trip stuck detection — every 10 min ───────────────────────────────────
  setTimeout(() => {
    runTripStuckDetection().catch(console.error);
    setInterval(() => runTripStuckDetection().catch(console.error), 10 * MINUTE);
  }, 30 * 1000);

  // ── Driver presence cleanup — every 5 min ─────────────────────────────────
  setTimeout(() => {
    runDriverPresenceCleanup().catch(console.error);
    setInterval(() => runDriverPresenceCleanup().catch(console.error), 5 * MINUTE);
  }, 10 * 1000);

  console.log("[Scheduler] All jobs scheduled");
}
