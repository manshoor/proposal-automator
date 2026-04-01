-- Add connect cost tracking and earnings to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS connect_cost INTEGER DEFAULT NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS earnings DECIMAL(10,2) DEFAULT NULL;
