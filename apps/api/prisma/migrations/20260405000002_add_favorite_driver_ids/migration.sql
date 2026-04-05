-- Migration: add favoriteDriverIds column to customer_profiles table
-- Generated: 2026-04-05

ALTER TABLE "customer_profiles" ADD COLUMN "favoriteDriverIds" TEXT[] NOT NULL DEFAULT '{}';
