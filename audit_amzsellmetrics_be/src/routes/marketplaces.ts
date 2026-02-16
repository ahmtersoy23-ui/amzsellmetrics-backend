import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// ============================================
// STATIC ROUTES (must come before /:id)
// ============================================

// === Category Expense Rates ===

// Get category expense rates
router.get('/expenses/rates', async (req, res) => {
  try {
    const { category, platform, marketplace_code } = req.query;
    let sql = 'SELECT * FROM category_expenses WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (category) {
      sql += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (platform) {
      sql += ` AND platform = $${idx++}`;
      params.push(platform);
    }
    if (marketplace_code) {
      sql += ` AND marketplace_code = $${idx++}`;
      params.push(marketplace_code);
    }

    const rates = await query(sql, params);
    res.json({ success: true, data: rates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert category expense rate
router.post('/expenses/rates', async (req, res) => {
  try {
    const rate = req.body;
    const result = await queryOne(`
      INSERT INTO category_expenses (
        category, platform, marketplace_code,
        selling_fee_percent, fba_fee_percent, refund_loss_percent, vat_percent,
        ads_percent, fba_cost_percent, fbm_cost_percent,
        shipping_cost_percent, customs_duty_percent, warehouse_cost_percent,
        sample_size, period_start, period_end, data_source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (category, platform, marketplace_code) DO UPDATE SET
        selling_fee_percent = EXCLUDED.selling_fee_percent,
        fba_fee_percent = EXCLUDED.fba_fee_percent,
        refund_loss_percent = EXCLUDED.refund_loss_percent,
        vat_percent = EXCLUDED.vat_percent,
        ads_percent = EXCLUDED.ads_percent,
        fba_cost_percent = EXCLUDED.fba_cost_percent,
        fbm_cost_percent = EXCLUDED.fbm_cost_percent,
        shipping_cost_percent = EXCLUDED.shipping_cost_percent,
        customs_duty_percent = EXCLUDED.customs_duty_percent,
        warehouse_cost_percent = EXCLUDED.warehouse_cost_percent,
        sample_size = EXCLUDED.sample_size,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        data_source = EXCLUDED.data_source,
        updated_at = NOW()
      RETURNING *
    `, [
      rate.category, rate.platform, rate.marketplace_code,
      rate.selling_fee_percent, rate.fba_fee_percent, rate.refund_loss_percent, rate.vat_percent,
      rate.ads_percent, rate.fba_cost_percent, rate.fbm_cost_percent,
      rate.shipping_cost_percent, rate.customs_duty_percent, rate.warehouse_cost_percent,
      rate.sample_size, rate.period_start, rate.period_end, rate.data_source || 'manual'
    ]);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Marketplace Product Data ===

// Get product data for marketplace
router.get('/product-data', async (req, res) => {
  try {
    const { product_id, marketplace_id } = req.query;
    let sql = 'SELECT * FROM marketplace_product_data WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (product_id) {
      sql += ` AND product_id = $${idx++}`;
      params.push(product_id);
    }
    if (marketplace_id) {
      sql += ` AND marketplace_id = $${idx++}`;
      params.push(marketplace_id);
    }

    const data = await query(sql, params);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find product data
router.get('/product-data/find', async (req, res) => {
  try {
    const { productId, marketplaceId, countryCode } = req.query;
    const data = await queryOne(
      'SELECT * FROM marketplace_product_data WHERE product_id = $1 AND marketplace_id = $2 AND country_code = $3',
      [productId, marketplaceId, countryCode]
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert product data
router.post('/product-data', async (req, res) => {
  try {
    const { product_id, marketplace_id, country_code, column_values, fulfillment_type } = req.body;
    const result = await queryOne(`
      INSERT INTO marketplace_product_data (product_id, marketplace_id, country_code, column_values, fulfillment_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (product_id, marketplace_id, country_code) DO UPDATE SET
        column_values = EXCLUDED.column_values,
        fulfillment_type = EXCLUDED.fulfillment_type,
        updated_at = NOW()
      RETURNING *
    `, [product_id, marketplace_id, country_code, JSON.stringify(column_values), fulfillment_type]);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk save product data
router.post('/product-data/bulk', async (req, res) => {
  try {
    const { dataList } = req.body;
    let added = 0;
    let updated = 0;

    for (const data of dataList) {
      const result = await queryOne(`
        INSERT INTO marketplace_product_data (product_id, marketplace_id, country_code, column_values, fulfillment_type)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, marketplace_id, country_code) DO UPDATE SET
          column_values = EXCLUDED.column_values,
          fulfillment_type = EXCLUDED.fulfillment_type,
          updated_at = NOW()
        RETURNING (xmax = 0) as is_insert
      `, [data.product_id, data.marketplace_id, data.country_code, JSON.stringify(data.column_values), data.fulfillment_type]);

      if (result.is_insert) added++;
      else updated++;
    }

    res.json({ success: true, data: { added, updated } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Marketplace Profit Configs ===

// Get all profit configs
router.get('/profit-configs', async (req, res) => {
  try {
    const configs = await query('SELECT * FROM marketplace_profit_configs ORDER BY marketplace_code');
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get profit config by marketplace code
router.get('/profit-configs/:marketplaceCode', async (req, res) => {
  try {
    const config = await queryOne(
      'SELECT * FROM marketplace_profit_configs WHERE marketplace_code = $1',
      [req.params.marketplaceCode]
    );
    if (!config) {
      return res.status(404).json({ success: false, error: 'Profit config not found' });
    }
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert profit config
router.post('/profit-configs', async (req, res) => {
  try {
    const marketplace_code = req.body.marketplace_code || req.body.marketplaceCode;
    const marketplace_name = req.body.marketplace_name || req.body.marketplaceName;
    const currency = req.body.currency || 'USD';
    const fba_config = req.body.fba_config || req.body.fbaConfig || {};
    const fbm_config = req.body.fbm_config || req.body.fbmConfig || {};
    const gst_config = req.body.gst_config || req.body.gstConfig || null;
    const is_active = req.body.is_active ?? req.body.isActive ?? true;

    const result = await queryOne(`
      INSERT INTO marketplace_profit_configs (marketplace_code, marketplace_name, currency, fba_config, fbm_config, gst_config, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (marketplace_code) DO UPDATE SET
        marketplace_name = EXCLUDED.marketplace_name,
        currency = EXCLUDED.currency,
        fba_config = EXCLUDED.fba_config,
        fbm_config = EXCLUDED.fbm_config,
        gst_config = EXCLUDED.gst_config,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *
    `, [marketplace_code, marketplace_name, currency, JSON.stringify(fba_config), JSON.stringify(fbm_config), gst_config ? JSON.stringify(gst_config) : null, is_active]);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete profit config
router.delete('/profit-configs/:marketplaceCode', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM marketplace_profit_configs WHERE marketplace_code = $1 RETURNING id',
      [req.params.marketplaceCode]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Profit config not found' });
    }
    res.json({ success: true, message: 'Profit config deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Category Column Defaults ===

// Get all category defaults
router.get('/category-defaults/all', async (req, res) => {
  try {
    const defaults = await query('SELECT * FROM category_column_defaults ORDER BY category');
    res.json({ success: true, data: defaults });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find category defaults
router.get('/category-defaults/find', async (req, res) => {
  try {
    const { marketplaceId, countryCode, category, fulfillmentType } = req.query;
    let sql = 'SELECT * FROM category_column_defaults WHERE marketplace_id = $1 AND country_code = $2 AND category = $3';
    const params: any[] = [marketplaceId, countryCode, category];

    if (fulfillmentType) {
      sql += ' AND fulfillment_type = $4';
      params.push(fulfillmentType);
    }

    const data = await queryOne(sql, params);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get category defaults by marketplace
router.get('/category-defaults', async (req, res) => {
  try {
    const { marketplaceId, countryCode } = req.query;
    let sql = 'SELECT * FROM category_column_defaults WHERE marketplace_id = $1';
    const params: any[] = [marketplaceId];

    if (countryCode) {
      sql += ' AND country_code = $2';
      params.push(countryCode);
    }

    const defaults = await query(sql, params);
    res.json({ success: true, data: defaults });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert category defaults
router.post('/category-defaults', async (req, res) => {
  try {
    const d = req.body;
    const marketplace_id = d.marketplace_id || d.marketplaceId;
    const country_code = d.country_code || d.countryCode;
    const category = d.category;
    const fulfillment_type = d.fulfillment_type || d.fulfillmentType || 'FBA';
    const column_defaults = d.column_defaults || d.columnDefaults || {};
    const target_margin = d.target_margin ?? d.targetMargin ?? 30;

    const result = await queryOne(`
      INSERT INTO category_column_defaults (marketplace_id, country_code, category, fulfillment_type, column_defaults, target_margin)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (marketplace_id, country_code, category, fulfillment_type) DO UPDATE SET
        column_defaults = EXCLUDED.column_defaults,
        target_margin = EXCLUDED.target_margin,
        updated_at = NOW()
      RETURNING *
    `, [marketplace_id, country_code, category, fulfillment_type, JSON.stringify(column_defaults), target_margin]);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk upsert category defaults
router.post('/category-defaults/bulk', async (req, res) => {
  try {
    const { defaults } = req.body;
    if (!Array.isArray(defaults)) {
      return res.status(400).json({ success: false, error: 'defaults must be an array' });
    }

    let imported = 0;
    let updated = 0;

    for (const d of defaults) {
      const result = await queryOne(`
        INSERT INTO category_column_defaults (marketplace_id, country_code, category, fulfillment_type, column_defaults, target_margin)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (marketplace_id, country_code, category, fulfillment_type) DO UPDATE SET
          column_defaults = EXCLUDED.column_defaults,
          target_margin = EXCLUDED.target_margin,
          updated_at = NOW()
        RETURNING (xmax = 0) as is_insert
      `, [
        d.marketplace_id || d.marketplaceId,
        d.country_code || d.countryCode,
        d.category,
        d.fulfillment_type || d.fulfillmentType || 'FBA',
        JSON.stringify(d.column_defaults || d.columnDefaults || {}),
        d.target_margin ?? d.targetMargin ?? 30
      ]);

      if (result.is_insert) imported++;
      else updated++;
    }

    res.json({ success: true, data: { imported, updated } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete category defaults by country
router.delete('/category-defaults/by-country', async (req, res) => {
  try {
    const { marketplaceId, countryCode } = req.query;
    if (!marketplaceId || !countryCode) {
      return res.status(400).json({ success: false, error: 'marketplaceId and countryCode required' });
    }
    await query(
      'DELETE FROM category_column_defaults WHERE marketplace_id = $1 AND country_code = $2',
      [marketplaceId, countryCode]
    );
    res.json({ success: true, message: 'Category defaults deleted for country' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete category defaults
router.delete('/category-defaults/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM category_column_defaults WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Category defaults not found' });
    }
    res.json({ success: true, message: 'Category defaults deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// MARKETPLACE CRUD (dynamic :id routes last)
// ============================================

// Get all marketplaces
router.get('/', async (req, res) => {
  try {
    const marketplaces = await query(`
      SELECT * FROM marketplaces
      ORDER BY name
    `);
    res.json({ success: true, data: marketplaces });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create marketplace
router.post('/', async (req, res) => {
  try {
    // Support both camelCase and snake_case field names
    const name = req.body.name;
    const short_name = req.body.short_name || req.body.shortName;
    const icon = req.body.icon;
    const color = req.body.color;
    const countries = req.body.countries;
    const columns = req.body.columns;
    const fulfillment_options = req.body.fulfillment_options || req.body.fulfillmentOptions;
    const default_fulfillment = req.body.default_fulfillment || req.body.defaultFulfillment;
    const is_active = req.body.is_active ?? req.body.isActive ?? true;

    const marketplace = await queryOne(`
      INSERT INTO marketplaces (name, short_name, icon, color, countries, columns, fulfillment_options, default_fulfillment, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [name, short_name, icon, color, JSON.stringify(countries), JSON.stringify(columns), fulfillment_options, default_fulfillment, is_active]);
    res.status(201).json({ success: true, data: marketplace });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get marketplace by ID (must be after all static routes!)
router.get('/:id', async (req, res) => {
  try {
    const marketplace = await queryOne(
      'SELECT * FROM marketplaces WHERE id = $1',
      [req.params.id]
    );
    if (!marketplace) {
      return res.status(404).json({ success: false, error: 'Marketplace not found' });
    }
    res.json({ success: true, data: marketplace });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update marketplace
router.put('/:id', async (req, res) => {
  try {
    // Support both camelCase and snake_case field names
    const name = req.body.name;
    const short_name = req.body.short_name || req.body.shortName;
    const icon = req.body.icon;
    const color = req.body.color;
    const countries = req.body.countries;
    const columns = req.body.columns;
    const fulfillment_options = req.body.fulfillment_options || req.body.fulfillmentOptions;
    const default_fulfillment = req.body.default_fulfillment || req.body.defaultFulfillment;
    const is_active = req.body.is_active ?? req.body.isActive;

    const marketplace = await queryOne(`
      UPDATE marketplaces
      SET name = $1, short_name = $2, icon = $3, color = $4, countries = $5, columns = $6,
          fulfillment_options = $7, default_fulfillment = $8, is_active = $9, updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [name, short_name, icon, color, JSON.stringify(countries), JSON.stringify(columns), fulfillment_options, default_fulfillment, is_active, req.params.id]);
    if (!marketplace) {
      return res.status(404).json({ success: false, error: 'Marketplace not found' });
    }
    res.json({ success: true, data: marketplace });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete marketplace
router.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM marketplaces WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Marketplace not found' });
    }
    res.json({ success: true, message: 'Marketplace deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AMAZON EXPENSES (from AMZSellMetrics)
// ============================================

// Get all amazon expenses
router.get('/amazon-expenses/all', async (req, res) => {
  try {
    const expenses = await query(`
      SELECT * FROM amazon_expenses
      ORDER BY marketplace_code, fulfillment_type, period_start DESC
    `);
    res.json({ success: true, data: expenses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get amazon expenses by marketplace
router.get('/amazon-expenses/:marketplaceCode', async (req, res) => {
  try {
    const expenses = await query(
      'SELECT * FROM amazon_expenses WHERE marketplace_code = $1 ORDER BY fulfillment_type, period_start DESC',
      [req.params.marketplaceCode]
    );
    res.json({ success: true, data: expenses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest amazon expenses (most recent period for each marketplace/fulfillment)
router.get('/amazon-expenses-latest/all', async (req, res) => {
  try {
    const expenses = await query(`
      SELECT DISTINCT ON (marketplace_code, fulfillment_type) *
      FROM amazon_expenses
      ORDER BY marketplace_code, fulfillment_type, period_end DESC
    `);
    res.json({ success: true, data: expenses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import amazon expenses from JSON (bulk upsert)
router.post('/amazon-expenses/import', async (req, res) => {
  try {
    const { period, marketplaces, sourceFile } = req.body;

    if (!period || !marketplaces) {
      return res.status(400).json({ success: false, error: 'Missing period or marketplaces data' });
    }

    const periodStart = period.start;
    const periodEnd = period.end;
    let imported = 0;
    let updated = 0;

    for (const [marketplaceCode, fulfillmentData] of Object.entries(marketplaces as Record<string, any>)) {
      for (const [fulfillmentType, data] of Object.entries(fulfillmentData as Record<string, any>)) {
        if (!data) continue;

        const existing = await queryOne(
          'SELECT id FROM amazon_expenses WHERE marketplace_code = $1 AND fulfillment_type = $2 AND period_start = $3 AND period_end = $4',
          [marketplaceCode, fulfillmentType, periodStart, periodEnd]
        );

        if (existing) {
          // Update existing
          await queryOne(`
            UPDATE amazon_expenses SET
              selling_fees = $1,
              fba_fees = $2,
              other_transaction_fees = $3,
              vat = $4,
              advertising_cost = $5,
              refund_loss = $6,
              liquidations = $7,
              total_orders = $8,
              total_revenue = $9,
              total_quantity = $10,
              selling_fee_percent = $11,
              fba_fee_percent = $12,
              advertising_percent = $13,
              refund_loss_percent = $14,
              imported_at = NOW(),
              source_file = $15
            WHERE id = $16
          `, [
            data.sellingFees || 0,
            data.fbaFees || 0,
            data.otherTransactionFees || 0,
            data.vat || 0,
            data.advertisingCost || 0,
            data.refundLoss || 0,
            data.liquidations || 0,
            data.totalOrders || 0,
            data.totalRevenue || 0,
            data.totalQuantity || 0,
            data.sellingFeePercent || 0,
            data.fbaFeePercent || 0,
            data.advertisingPercent || 0,
            data.refundLossPercent || 0,
            sourceFile || null,
            existing.id
          ]);
          updated++;
        } else {
          // Insert new
          await queryOne(`
            INSERT INTO amazon_expenses (
              marketplace_code, fulfillment_type, period_start, period_end,
              selling_fees, fba_fees, other_transaction_fees, vat,
              advertising_cost, refund_loss, liquidations,
              total_orders, total_revenue, total_quantity,
              selling_fee_percent, fba_fee_percent, advertising_percent, refund_loss_percent,
              source_file
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          `, [
            marketplaceCode,
            fulfillmentType,
            periodStart,
            periodEnd,
            data.sellingFees || 0,
            data.fbaFees || 0,
            data.otherTransactionFees || 0,
            data.vat || 0,
            data.advertisingCost || 0,
            data.refundLoss || 0,
            data.liquidations || 0,
            data.totalOrders || 0,
            data.totalRevenue || 0,
            data.totalQuantity || 0,
            data.sellingFeePercent || 0,
            data.fbaFeePercent || 0,
            data.advertisingPercent || 0,
            data.refundLossPercent || 0,
            sourceFile || null
          ]);
          imported++;
        }
      }
    }

    res.json({
      success: true,
      data: { imported, updated },
      message: `Imported ${imported} new, updated ${updated} existing entries`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete amazon expenses for a specific period
router.delete('/amazon-expenses/:marketplaceCode/:fulfillmentType', async (req, res) => {
  try {
    const { marketplaceCode, fulfillmentType } = req.params;
    const { periodStart, periodEnd } = req.query;

    let deleteQuery = 'DELETE FROM amazon_expenses WHERE marketplace_code = $1 AND fulfillment_type = $2';
    const params: any[] = [marketplaceCode, fulfillmentType];

    if (periodStart && periodEnd) {
      deleteQuery += ' AND period_start = $3 AND period_end = $4';
      params.push(periodStart, periodEnd);
    }

    deleteQuery += ' RETURNING id';

    const result = await query(deleteQuery, params);
    res.json({
      success: true,
      message: `Deleted ${result.length} entries`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
