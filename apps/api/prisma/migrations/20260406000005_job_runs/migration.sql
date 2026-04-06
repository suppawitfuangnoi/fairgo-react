-- Phase 8: background job distributed-lock registry
-- One row per named cleanup job; used for atomic lock acquisition across replicas.

CREATE TABLE IF NOT EXISTS "job_runs" (
  "jobName"    TEXT         NOT NULL,
  "lockedAt"   TIMESTAMPTZ,
  "lockedBy"   TEXT,
  "lastRunAt"  TIMESTAMPTZ,
  "lastResult" JSONB,

  CONSTRAINT "job_runs_pkey" PRIMARY KEY ("jobName")
);

-- Seed the known job names so ON CONFLICT updates work correctly on first run.
INSERT INTO "job_runs" ("jobName") VALUES
  ('otp-cleanup'),
  ('offer-cleanup'),
  ('ride-request-cleanup'),
  ('trip-stuck-detection'),
  ('driver-presence-cleanup')
ON CONFLICT DO NOTHING;
