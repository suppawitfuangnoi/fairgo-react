-- Phase 7: Admin moderation fields for User and DriverProfile

-- ── User: suspension reason + flag fields ─────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspendedAt"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "isFlagged"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "flagReason"      TEXT,
  ADD COLUMN IF NOT EXISTS "flaggedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "flaggedBy"       TEXT;

CREATE INDEX IF NOT EXISTS "users_isFlagged_idx" ON "users" ("isFlagged");

-- ── DriverProfile: flag + rejection reason fields ─────────────────
ALTER TABLE "driver_profiles"
  ADD COLUMN IF NOT EXISTS "isFlagged"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "flagReason"      TEXT,
  ADD COLUMN IF NOT EXISTS "flaggedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "flaggedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

CREATE INDEX IF NOT EXISTS "driver_profiles_isFlagged_idx" ON "driver_profiles" ("isFlagged");
