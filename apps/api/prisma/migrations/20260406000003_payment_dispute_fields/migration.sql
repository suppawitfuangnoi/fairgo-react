-- Phase 6: Payment dispute fields + SupportTicket resolution field
-- Adds dispute tracking to payments and wires up SupportTicket.resolution

-- ── payments: dispute support columns ────────────────────────────────────────
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "disputeFlag"           BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "disputeReason"         TEXT,
  ADD COLUMN IF NOT EXISTS "disputeRaisedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputeRaisedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "disputeResolvedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputeResolvedBy"     TEXT,
  ADD COLUMN IF NOT EXISTS "disputeResolutionNote" TEXT;

-- Index on disputeFlag for admin "open disputes" queries
CREATE INDEX IF NOT EXISTS "payments_disputeFlag_idx" ON "payments" ("disputeFlag");

-- ── support_tickets: resolution note + tripId index ───────────────────────────
ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "resolution" TEXT;

CREATE INDEX IF NOT EXISTS "support_tickets_tripId_idx" ON "support_tickets" ("tripId");

-- ── NotificationType enum: add DISPUTE_RESOLVED ───────────────────────────────
-- Uses pg_type OID lookup instead of ::regtype cast to avoid case-sensitivity
-- issues with mixed-case Prisma-generated enum names on PostgreSQL.
DO $$
DECLARE
  v_typid oid;
BEGIN
  SELECT oid INTO v_typid FROM pg_type WHERE typname = 'NotificationType';
  IF v_typid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = v_typid
      AND enumlabel = 'DISPUTE_RESOLVED'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'DISPUTE_RESOLVED';
  END IF;
END
$$;
