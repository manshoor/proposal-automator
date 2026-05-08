-- Phase 4: extra proposal metadata
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS loom_url TEXT;
