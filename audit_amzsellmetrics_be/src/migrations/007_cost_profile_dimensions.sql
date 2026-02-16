-- Migration 007: Extend cost_profiles for shared product dimensions
-- This allows multiple products to share common base_cost and package dimensions

-- Add dimension fields to cost_profiles
ALTER TABLE cost_profiles ADD COLUMN IF NOT EXISTS base_cost NUMERIC(12,4);
ALTER TABLE cost_profiles ADD COLUMN IF NOT EXISTS weight NUMERIC(10,3);
ALTER TABLE cost_profiles ADD COLUMN IF NOT EXISTS width NUMERIC(10,2);
ALTER TABLE cost_profiles ADD COLUMN IF NOT EXISTS height NUMERIC(10,2);
ALTER TABLE cost_profiles ADD COLUMN IF NOT EXISTS length NUMERIC(10,2);

-- Add cost_profile_id to products table (many products can share one profile)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_profile_id UUID REFERENCES cost_profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_cost_profile ON products(cost_profile_id);

-- Add comments
COMMENT ON COLUMN cost_profiles.base_cost IS 'Default base cost for products using this profile';
COMMENT ON COLUMN cost_profiles.weight IS 'Default package weight in kg';
COMMENT ON COLUMN cost_profiles.width IS 'Default package width in cm';
COMMENT ON COLUMN cost_profiles.height IS 'Default package height in cm';
COMMENT ON COLUMN cost_profiles.length IS 'Default package length in cm';
COMMENT ON COLUMN products.cost_profile_id IS 'Reference to cost profile for shared dimensions/cost';
