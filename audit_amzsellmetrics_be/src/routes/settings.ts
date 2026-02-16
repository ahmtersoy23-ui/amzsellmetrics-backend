import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// ============================================
// EXCHANGE RATES (must be before /:key)
// ============================================

// Get all exchange rates
router.get('/exchange-rates', async (req, res) => {
  try {
    const rates = await query('SELECT * FROM exchange_rates ORDER BY currency_code');
    res.json({ success: true, data: rates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific exchange rate
router.get('/exchange-rates/:currency', async (req, res) => {
  try {
    const rate = await queryOne(
      'SELECT * FROM exchange_rates WHERE currency_code = $1',
      [req.params.currency.toUpperCase()]
    );
    if (!rate) {
      return res.status(404).json({ success: false, error: 'Currency not found' });
    }
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert exchange rate
router.post('/exchange-rates', async (req, res) => {
  try {
    const { currency_code, currency_name, rate_to_usd, source } = req.body;
    const rate = await queryOne(`
      INSERT INTO exchange_rates (currency_code, currency_name, rate_to_usd, source, fetched_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (currency_code) DO UPDATE SET
        currency_name = COALESCE(EXCLUDED.currency_name, exchange_rates.currency_name),
        rate_to_usd = EXCLUDED.rate_to_usd,
        source = EXCLUDED.source,
        fetched_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `, [currency_code.toUpperCase(), currency_name, rate_to_usd, source || 'manual']);
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk update exchange rates (from API)
router.post('/exchange-rates/bulk', async (req, res) => {
  try {
    const { rates, source } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ success: false, error: 'Rates must be an array' });
    }

    const results = [];
    for (const r of rates) {
      const rate = await queryOne(`
        INSERT INTO exchange_rates (currency_code, currency_name, rate_to_usd, source, fetched_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (currency_code) DO UPDATE SET
          currency_name = COALESCE(EXCLUDED.currency_name, exchange_rates.currency_name),
          rate_to_usd = EXCLUDED.rate_to_usd,
          source = EXCLUDED.source,
          fetched_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `, [r.currency_code.toUpperCase(), r.currency_name, r.rate_to_usd, source || 'api']);
      results.push(rate);
    }

    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete exchange rate
router.delete('/exchange-rates/:currency', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM exchange_rates WHERE currency_code = $1 RETURNING currency_code',
      [req.params.currency.toUpperCase()]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Currency not found' });
    }
    res.json({ success: true, message: 'Exchange rate deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await query('SELECT * FROM settings');
    // Convert to key-value object
    const settingsObj: Record<string, any> = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }
    res.json({ success: true, data: settingsObj });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get setting by key
router.get('/:key', async (req, res) => {
  try {
    const setting = await queryOne(
      'SELECT * FROM settings WHERE key = $1',
      [req.params.key]
    );
    if (!setting) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }
    res.json({ success: true, data: setting.value });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert setting
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await queryOne(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
      RETURNING *
    `, [req.params.key, JSON.stringify(value)]);
    res.json({ success: true, data: setting });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete setting
router.delete('/:key', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM settings WHERE key = $1 RETURNING key',
      [req.params.key]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }
    res.json({ success: true, message: 'Setting deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Import History ===

// Get import history
router.get('/import/history', async (req, res) => {
  try {
    const history = await query(`
      SELECT * FROM import_history
      ORDER BY timestamp DESC
      LIMIT 50
    `);
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add import history entry
router.post('/import/history', async (req, res) => {
  try {
    const { import_type, platform, products_added, products_updated, skipped_count, source_url, file_name } = req.body;
    const entry = await queryOne(`
      INSERT INTO import_history (import_type, platform, products_added, products_updated, skipped_count, source_url, file_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [import_type, platform, products_added, products_updated, skipped_count, source_url, file_name]);
    res.status(201).json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Database Reset ===

// Clear all products
router.delete('/database/products', async (req, res) => {
  try {
    await query('DELETE FROM products');
    res.json({ success: true, message: 'All products deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all data (full reset)
router.delete('/database/all', async (req, res) => {
  try {
    // Delete in order to respect foreign key constraints
    await query('DELETE FROM sku_mappings');
    await query('DELETE FROM category_expenses');
    await query('DELETE FROM marketplace_product_data');
    await query('DELETE FROM category_column_defaults');
    await query('DELETE FROM carrier_route_rates');
    await query('DELETE FROM route_shipping_config');
    await query('DELETE FROM cost_profile_materials');
    await query('DELETE FROM cost_profile_labors');
    await query('DELETE FROM cost_profiles');
    await query('DELETE FROM products');
    await query('DELETE FROM marketplaces');
    await query('DELETE FROM shipping_carriers');
    await query('DELETE FROM shipping_routes');
    await query('DELETE FROM raw_materials');
    await query('DELETE FROM labor_types');
    await query('DELETE FROM labor_settings');
    await query('DELETE FROM import_history');
    await query('DELETE FROM settings');

    res.json({ success: true, message: 'Database reset complete' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
