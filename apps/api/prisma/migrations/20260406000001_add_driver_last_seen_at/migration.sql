-- AlterTable: add lastSeenAt to driver_profiles for heartbeat-based stale detection
ALTER TABLE "driver_profiles" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
