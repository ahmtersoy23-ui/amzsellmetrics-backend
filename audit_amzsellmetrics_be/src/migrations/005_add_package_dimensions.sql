-- Migration 005: Add package dimensions to products table
-- These are default package dimensions used when shipping profile doesn't have specific values

-- Add weight column (kg)
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight NUMERIC(10,3);

-- Add package dimensions (cm)
ALTER TABLE products ADD COLUMN IF NOT EXISTS width NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS length NUMERIC(10,2);

-- Add comments
COMMENT ON COLUMN products.weight IS 'Package weight in kg';
COMMENT ON COLUMN products.width IS 'Package width in cm';
COMMENT ON COLUMN products.height IS 'Package height in cm';
COMMENT ON COLUMN products.length IS 'Package length in cm';
COMMENT ON COLUMN products.size IS 'Volumetric weight (desi) - can be calculated from dimensions or entered directly';
