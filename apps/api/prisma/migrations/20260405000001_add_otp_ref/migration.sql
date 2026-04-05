-- Migration: add otpRef column to otp_codes table
-- Generated: 2026-04-05

ALTER TABLE "otp_codes" ADD COLUMN "otpRef" TEXT NOT NULL DEFAULT '';
