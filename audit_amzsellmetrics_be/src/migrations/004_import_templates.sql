-- Migration: Import Templates for SKU bulk import
-- Date: 2025-12-27
-- Description: Creates import_templates table for storing CSV/Excel column mappings

-- Import Templates table
CREATE TABLE IF NOT EXISTS import_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Template identification
  name VARCHAR(100) NOT NULL,
  marketplace_id UUID REFERENCES marketplaces(id) ON DELETE CASCADE,
  country_code VARCHAR(10),  -- Optional: template specific to a country

  -- Column mappings (JSONB array)
  -- Each element: { "header": "CSV Column Name", "maps_to": "field_name", "required": true/false }
  -- Possible maps_to values: sku, asin, listing_price, fulfillment_type, status, match_sku (IWA SKU), match_name (Product Name)
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Template settings
  has_header_row BOOLEAN DEFAULT true,
  delimiter VARCHAR(5) DEFAULT ',',

  -- System flags
  is_system BOOLEAN DEFAULT false,  -- System templates can't be deleted
  is_default BOOLEAN DEFAULT false, -- Default template for this marketplace

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint: one default per marketplace+country
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_templates_default
ON import_templates(marketplace_id, country_code)
WHERE is_default = true;

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE import_templates TO pricelab;

-- Insert default Amazon template
INSERT INTO import_templates (name, marketplace_id, columns, is_system, is_default)
SELECT
  'Amazon Seller Central Export',
  m.id,
  '[
    {"header": "seller-sku", "maps_to": "sku", "required": true},
    {"header": "asin1", "maps_to": "asin", "required": false},
    {"header": "price", "maps_to": "listing_price", "required": false},
    {"header": "fulfillment-channel", "maps_to": "fulfillment_type", "required": false},
    {"header": "status", "maps_to": "status", "required": false},
    {"header": "item-name", "maps_to": "match_name", "required": false}
  ]'::jsonb,
  true,
  true
FROM marketplaces m
WHERE m.short_name = 'AMZ'
ON CONFLICT DO NOTHING;

-- Insert Amazon FBA Inventory Report template
INSERT INTO import_templates (name, marketplace_id, columns, is_system)
SELECT
  'Amazon FBA Inventory Report',
  m.id,
  '[
    {"header": "sku", "maps_to": "sku", "required": true},
    {"header": "asin", "maps_to": "asin", "required": false},
    {"header": "your-price", "maps_to": "listing_price", "required": false},
    {"header": "product-name", "maps_to": "match_name", "required": false}
  ]'::jsonb,
  true
FROM marketplaces m
WHERE m.short_name = 'AMZ'
ON CONFLICT DO NOTHING;

-- Insert Trendyol template
INSERT INTO import_templates (name, marketplace_id, country_code, columns, is_system, is_default)
SELECT
  'Trendyol Ürün Listesi',
  m.id,
  'TR',
  '[
    {"header": "Barkod", "maps_to": "sku", "required": true},
    {"header": "Model Kodu", "maps_to": "match_sku", "required": false},
    {"header": "Ürün Adı", "maps_to": "match_name", "required": false},
    {"header": "Satış Fiyatı", "maps_to": "listing_price", "required": false},
    {"header": "Stok Adedi", "maps_to": "quantity", "required": false}
  ]'::jsonb,
  true,
  true
FROM marketplaces m
WHERE m.short_name = 'TY'
ON CONFLICT DO NOTHING;

-- Insert Etsy template
INSERT INTO import_templates (name, marketplace_id, columns, is_system, is_default)
SELECT
  'Etsy Listings Export',
  m.id,
  '[
    {"header": "SKU", "maps_to": "sku", "required": true},
    {"header": "Listing ID", "maps_to": "external_id", "required": false},
    {"header": "Title", "maps_to": "match_name", "required": false},
    {"header": "Price", "maps_to": "listing_price", "required": false}
  ]'::jsonb,
  true,
  true
FROM marketplaces m
WHERE m.short_name = 'ETSY'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE import_templates IS 'Stores CSV/Excel import templates for bulk SKU import';
COMMENT ON COLUMN import_templates.columns IS 'JSONB array of column mappings: header (CSV column name), maps_to (field name), required (boolean)';
