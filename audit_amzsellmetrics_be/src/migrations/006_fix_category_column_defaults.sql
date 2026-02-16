-- Migration 006: Fix category_column_defaults table
-- Add missing columns that the code expects

-- Rename column_values to column_defaults (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_column_defaults' AND column_name = 'column_values'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_column_defaults' AND column_name = 'column_defaults'
  ) THEN
    ALTER TABLE category_column_defaults RENAME COLUMN column_values TO column_defaults;
  END IF;
END $$;

-- Add column_defaults if it doesn't exist (in case table was created without it)
ALTER TABLE category_column_defaults ADD COLUMN IF NOT EXISTS column_defaults JSONB DEFAULT '{}';

-- Add target_margin column
ALTER TABLE category_column_defaults ADD COLUMN IF NOT EXISTS target_margin NUMERIC(5,2) DEFAULT 30;

-- Add comments
COMMENT ON COLUMN category_column_defaults.column_defaults IS 'Default values for dynamic columns (e.g., referral_fee, fba_fee)';
COMMENT ON COLUMN category_column_defaults.target_margin IS 'Target profit margin percentage for this category';
