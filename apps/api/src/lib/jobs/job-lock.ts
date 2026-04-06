/**
 * job-lock.ts — Distributed job lock via PostgreSQL
 *
 * Uses an atomic ON CONFLICT DO UPDATE WHERE pattern to ensure only one
 * replica runs a given named job within the TTL window.  Requires the
 * `job_runs` table (see migration 20260406000005_job_runs).
 *
 * Lock acquisition is intentionally a "try once" — no retry/spin loop —
 * so a busy-wait scenario across replicas cannot occur.
 */

import { prisma } from "../prisma";
import { hostname } from "os";

/** Stable identity for this process across log lines and lock records. */
export const INSTANCE_ID = `${hostname()}-${process.pid}`;

export interface JobResult {
  [key: string]: unknown;
  durationMs: number;
}

/**
 * Attempt to acquire the distributed lock for `jobName`.
 *
 * Returns `true` if the lock was granted (this instance should run the job),
 * `false` if another instance holds it or the acquisition itself failed.
 *
 * The lock expires automatically once `ttlSeconds` have elapsed since
 * `lockedAt`, so a crashed replica will not block the job permanently.
 */
export async function acquireLock(
  jobName: string,
  ttlSeconds: number
): Promise<boolean> {
  try {
    // Atomic upsert: grab the lock only when it is idle OR expired.
    // The WHERE clause on DO UPDATE prevents overwriting a live lock.
    const result = await prisma.$queryRaw<{ jobName: string }[]>`
      INSERT INTO job_runs ("jobName", "lockedAt", "lockedBy")
      VALUES (${jobName}, NOW(), ${INSTANCE_ID})
      ON CONFLICT ("jobName") DO UPDATE
        SET "lockedAt" = NOW(),
            "lockedBy" = ${INSTANCE_ID}
        WHERE job_runs."lockedAt" IS NULL
           OR job_runs."lockedAt" < NOW() - make_interval(secs => ${ttlSeconds})
      RETURNING "jobName"
    `;
    return result.length > 0;
  } catch (err) {
    console.error(`[JobLock] acquireLock(${jobName}) failed:`, err);
    return false;
  }
}

/**
 * Release the lock and persist the run result for observability.
 * Only releases if this instance currently holds the lock.
 */
export async function releaseLock(
  jobName: string,
  result: JobResult
): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE job_runs
      SET "lockedAt"   = NULL,
          "lockedBy"   = NULL,
          "lastRunAt"  = NOW(),
          "lastResult" = ${JSON.stringify(result)}::jsonb
      WHERE "jobName"  = ${jobName}
        AND "lockedBy" = ${INSTANCE_ID}
    `;
  } catch (err) {
    console.error(`[JobLock] releaseLock(${jobName}) failed:`, err);
  }
}

/**
 * Fetch the last stored result for every job.
 * Used by the monitoring endpoint to surface cleanup stats.
 */
export async function getJobStats(): Promise<
  Array<{
    jobName: string;
    lockedAt: Date | null;
    lockedBy: string | null;
    lastRunAt: Date | null;
    lastResult: unknown;
  }>
> {
  try {
    return await prisma.jobRun.findMany({
      select: {
        jobName: true,
        lockedAt: true,
        lockedBy: true,
        lastRunAt: true,
        lastResult: true,
      },
      orderBy: { jobName: "asc" },
    });
  } catch {
    return [];
  }
}
