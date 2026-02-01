-- PriceLab Database Schema
-- Version 1.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(100),
  base_cost DECIMAL(12, 4),
  size DECIMAL(10, 4),
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(name);

-- ============================================
-- SKU MAPPINGS
-- ============================================
CREATE TABLE IF NOT EXISTS sku_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  marketplace_code VARCHAR(10) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  asin VARCHAR(20),
  listing_price DECIMAL(12, 4),
  fulfillment_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, platform, marketplace_code, sku)
);

CREATE INDEX idx_sku_mappings_product ON sku_mappings(product_id);
CREATE INDEX idx_sku_mappings_platform ON sku_mappings(platform);
CREATE INDEX idx_sku_mappings_sku ON sku_mappings(sku);

-- ============================================
-- CATEGORY EXPENSES
-- ============================================
CREATE TABLE IF NOT EXISTS category_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(100) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  marketplace_code VARCHAR(10) NOT NULL,
  selling_fee_percent DECIMAL(6, 4) DEFAULT 0,
  fba_fee_percent DECIMAL(6, 4) DEFAULT 0,
  refund_loss_percent DECIMAL(6, 4) DEFAULT 0,
  vat_percent DECIMAL(6, 4) DEFAULT 0,
  ads_percent DECIMAL(6, 4) DEFAULT 0,
  fba_cost_percent DECIMAL(6, 4) DEFAULT 0,
  fbm_cost_percent DECIMAL(6, 4) DEFAULT 0,
  shipping_cost_percent DECIMAL(6, 4),
  customs_duty_percent DECIMAL(6, 4),
  warehouse_cost_percent DECIMAL(6, 4),
  sample_size INTEGER DEFAULT 0,
  period_start DATE,
  period_end DATE,
  data_source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(category, platform, marketplace_code)
);

-- ============================================
-- MARKETPLACES
-- ============================================
CREATE TABLE IF NOT EXISTS marketplaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(10) NOT NULL UNIQUE,
  icon VARCHAR(10),
  color VARCHAR(20),
  countries JSONB DEFAULT '[]',
  columns JSONB DEFAULT '[]',
  fulfillment_options TEXT[] DEFAULT ARRAY['FBA', 'FBM'],
  default_fulfillment VARCHAR(20) DEFAULT 'FBA',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MARKETPLACE PRODUCT DATA
-- ============================================
CREATE TABLE IF NOT EXISTS marketplace_product_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  marketplace_id UUID REFERENCES marketplaces(id) ON DELETE CASCADE,
  country_code VARCHAR(10) NOT NULL,
  column_values JSONB DEFAULT '{}',
  fulfillment_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, marketplace_id, country_code)
);

-- ============================================
-- CATEGORY COLUMN DEFAULTS
-- ============================================
CREATE TABLE IF NOT EXISTS category_column_defaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace_id UUID REFERENCES marketplaces(id) ON DELETE CASCADE,
  country_code VARCHAR(10) NOT NULL,
  category VARCHAR(100) NOT NULL,
  fulfillment_type VARCHAR(20) NOT NULL,
  column_values JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(marketplace_id, country_code, category, fulfillment_type)
);

-- ============================================
-- SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- IMPORT HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_type VARCHAR(50) NOT NULL,
  platform VARCHAR(50),
  timestamp TIMESTAMP DEFAULT NOW(),
  products_added INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  source_url TEXT,
  file_name VARCHAR(255)
);

CREATE INDEX idx_import_history_timestamp ON import_history(timestamp DESC);

-- ============================================
-- SHIPPING CARRIERS
-- ============================================
CREATE TABLE IF NOT EXISTS shipping_carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(20) NOT NULL UNIQUE,
  logo VARCHAR(255),
  website VARCHAR(255),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SHIPPING ROUTES
-- ============================================
CREATE TABLE IF NOT EXISTS shipping_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  from_country VARCHAR(10) NOT NULL,
  to_country VARCHAR(10) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(from_country, to_country)
);

-- ============================================
-- CARRIER ROUTE RATES
-- ============================================
CREATE TABLE IF NOT EXISTS carrier_route_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_id UUID REFERENCES shipping_carriers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES shipping_routes(id) ON DELETE CASCADE,
  weight_brackets JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(carrier_id, route_id)
);

-- ============================================
-- ROUTE SHIPPING CONFIG
-- ============================================
CREATE TABLE IF NOT EXISTS route_shipping_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES shipping_routes(id) ON DELETE CASCADE UNIQUE,
  default_carrier_id UUID REFERENCES shipping_carriers(id),
  preferred_carriers UUID[],
  customs_config JSONB DEFAULT '{}',
  packaging_config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- RAW MATERIALS (Costing)
-- ============================================
CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(20) NOT NULL,
  unit_cost DECIMAL(12, 4) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  supplier VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- LABOR TYPES (Costing)
-- ============================================
CREATE TABLE IF NOT EXISTS labor_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  hourly_rate DECIMAL(10, 4) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- LABOR SETTINGS (Costing)
-- ============================================
CREATE TABLE IF NOT EXISTS labor_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  default_hourly_rate DECIMAL(10, 4) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  overhead_percent DECIMAL(6, 4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- COST PROFILES (Costing)
-- ============================================
CREATE TABLE IF NOT EXISTS cost_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  materials JSONB DEFAULT '[]',
  labor_items JSONB DEFAULT '[]',
  overhead_percent DECIMAL(6, 4) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cost_profiles_product ON cost_profiles(product_id);

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default shipping routes
INSERT INTO shipping_routes (name, from_country, to_country, description, is_custom) VALUES
  ('TR → US', 'TR', 'US', 'Turkey to United States', false),
  ('TR → UK', 'TR', 'UK', 'Turkey to United Kingdom', false),
  ('TR → DE', 'TR', 'DE', 'Turkey to Germany', false),
  ('TR → EU', 'TR', 'EU', 'Turkey to European Union', false),
  ('CN → US', 'CN', 'US', 'China to United States', false),
  ('CN → UK', 'CN', 'UK', 'China to United Kingdom', false),
  ('US → US', 'US', 'US', 'Domestic US', false)
ON CONFLICT (from_country, to_country) DO NOTHING;

-- Insert default Amazon marketplace
INSERT INTO marketplaces (name, short_name, icon, color, countries, columns, fulfillment_options, default_fulfillment) VALUES
  ('Amazon', 'AMZ', '📦', '#FF9900',
   '[{"code":"US","name":"United States","currency":"USD","currencySymbol":"$","taxRate":0,"taxName":"Sales Tax","flag":"🇺🇸","isActive":true},
     {"code":"UK","name":"United Kingdom","currency":"GBP","currencySymbol":"£","taxRate":20,"taxName":"VAT","flag":"🇬🇧","isActive":true},
     {"code":"DE","name":"Germany","currency":"EUR","currencySymbol":"€","taxRate":19,"taxName":"VAT","flag":"🇩🇪","isActive":true}]',
   '[]',
   ARRAY['FBA', 'FBM'],
   'FBA')
ON CONFLICT (short_name) DO NOTHING;

COMMIT;
