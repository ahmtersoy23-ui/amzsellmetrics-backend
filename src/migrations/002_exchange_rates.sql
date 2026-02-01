-- Exchange Rates Table
-- Stores currency exchange rates with USD as hub currency

CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  currency_code VARCHAR(3) NOT NULL UNIQUE,
  currency_name VARCHAR(50),
  rate_to_usd DECIMAL(18, 8) NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_exchange_rates_currency ON exchange_rates(currency_code);

-- Insert default exchange rates (these will be updated by API)
INSERT INTO exchange_rates (currency_code, currency_name, rate_to_usd) VALUES
  ('USD', 'US Dollar', 1.0),
  ('EUR', 'Euro', 1.08),
  ('GBP', 'British Pound', 1.27),
  ('TRY', 'Turkish Lira', 0.029)
ON CONFLICT (currency_code) DO UPDATE SET
  rate_to_usd = EXCLUDED.rate_to_usd,
  updated_at = NOW();

-- Add currency field to shipping_carriers if not exists
ALTER TABLE shipping_carriers ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

COMMIT;
