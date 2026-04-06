/**
 * otp-cleanup.ts
 *
 * Runs every 30 minutes.  Two duties:
 *  1. PRUNE  — delete OTP records whose `expiresAt` is older than 24 h.
 *              Keeps the table lean while retaining a 24 h audit window.
 *  2. UNLOCK — reset OTP rows whose `lockedUntil` has already passed back to
 *              PENDING status so users can retry without admin involvement.
 *              (lockedUntil is the DB brute-force lockout field, distinct from
 *               the job-lock system.)
 */

import { prisma } from "../prisma";
import { acquireLock, releaseLock } from "./job-lock";

const JOB_NAME = "otp-cleanup";
/** Allow re-acquisition after 20 min (job interval is 30 min). */
const LOCK_TTL_SECONDS = 20 * 60;
/** Keep OTPs for 24 h for debugging/auditing, then prune. */
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function runOtpCleanup(): Promise<void> {
  const locked = await acquireLock(JOB_NAME, LOCK_TTL_SECONDS);
  if (!locked) {
    console.log("[Job:otp-cleanup] Skipped — lock held by another instance");
    return;
  }

  const start = Date.now();
  try {
    const pruneBeforeDate = new Date(Date.now() - PRUNE_AFTER_MS);

    // 1. Delete expired OTPs older than the prune window
    const pruned = await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: pruneBeforeDate } },
    });

    // 2. Auto-unlock rows whose brute-force lockout period has expired
    const unlocked = await prisma.otpCode.updateMany({
      where: {
        status: "LOCKED",
        lockedUntil: { not: null, lt: new Date() },
      },
      data: {
        status: "PENDING",
        lockedUntil: null,
        attemptCount: 0,
      },
    });

    const result = {
      prunedExpiredOtps: pruned.count,
      autoUnlockedOtps: unlocked.count,
      durationMs: Date.now() - start,
    };
    console.log("[Job:otp-cleanup]", result);
    await releaseLock(JOB_NAME, result);
  } catch (err) {
    console.error("[Job:otp-cleanup] Error:", err);
    await releaseLock(JOB_NAME, {
      error: String(err),
      durationMs: Date.now() - start,
    });
  }
}
