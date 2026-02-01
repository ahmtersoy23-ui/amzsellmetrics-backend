-- Migration: Add SKU and ASIN columns to marketplace_product_data
-- Date: 2025-12-27
-- Description: Adds dedicated sku and asin columns for marketplace product mappings
--              This enables Amazon Profit-style tracking where each product has
--              marketplace+country+sku combination

-- Add SKU column (required for product identification in marketplaces)
ALTER TABLE marketplace_product_data
ADD COLUMN IF NOT EXISTS sku VARCHAR(100);

-- Add ASIN column (Amazon-specific identifier)
ALTER TABLE marketplace_product_data
ADD COLUMN IF NOT EXISTS asin VARCHAR(20);

-- Add listing_price column for the selling price on that marketplace
ALTER TABLE marketplace_product_data
ADD COLUMN IF NOT EXISTS listing_price DECIMAL(10, 2);

-- Add status column for tracking product listing status
ALTER TABLE marketplace_product_data
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Drop the old unique constraint (product_id, marketplace_id, country_code)
ALTER TABLE marketplace_product_data
DROP CONSTRAINT IF EXISTS marketplace_product_data_product_id_marketplace_id_country__key;

-- Create new unique constraint including SKU
-- This allows the same product to have multiple SKUs in the same marketplace/country
ALTER TABLE marketplace_product_data
ADD CONSTRAINT marketplace_product_data_unique_mapping
UNIQUE (product_id, marketplace_id, country_code, sku);

-- Create index on SKU for fast lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_product_data_sku
ON marketplace_product_data(sku);

-- Create index on ASIN for Amazon-specific lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_product_data_asin
ON marketplace_product_data(asin);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_marketplace_product_data_marketplace_country
ON marketplace_product_data(marketplace_id, country_code);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE marketplace_product_data TO pricelab;

-- Comment for documentation
COMMENT ON COLUMN marketplace_product_data.sku IS 'Marketplace-specific SKU (Stock Keeping Unit)';
COMMENT ON COLUMN marketplace_product_data.asin IS 'Amazon Standard Identification Number (Amazon only)';
COMMENT ON COLUMN marketplace_product_data.listing_price IS 'Current listing/selling price on the marketplace';
COMMENT ON COLUMN marketplace_product_data.status IS 'Listing status: active, inactive, out_of_stock, suppressed';
