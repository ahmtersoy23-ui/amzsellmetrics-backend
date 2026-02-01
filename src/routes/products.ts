import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// ============================================
// STATIC ROUTES (must come before /:id)
// ============================================

// Get all products with cost profile info and effective values
router.get('/', async (req, res) => {
  try {
    const products = await query(`
      SELECT p.*,
        cp.name as cost_profile_name,
        -- Effective values: profile first, then product
        COALESCE(cp.base_cost, p.base_cost) as effective_base_cost,
        COALESCE(cp.weight, p.weight) as effective_weight,
        COALESCE(cp.width, p.width) as effective_width,
        COALESCE(cp.height, p.height) as effective_height,
        COALESCE(cp.length, p.length) as effective_length,
        -- Source indicator: where did the value come from?
        CASE WHEN cp.base_cost IS NOT NULL THEN 'profile' WHEN p.base_cost IS NOT NULL THEN 'product' ELSE NULL END as cost_source
      FROM products p
      LEFT JOIN cost_profiles cp ON p.cost_profile_id = cp.id
      ORDER BY p.updated_at DESC
    `);
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get database stats
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total_products,
        COUNT(DISTINCT category) as categories_count,
        MAX(updated_at) as last_updated
      FROM products
    `);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk import products - optimized batch insert
router.post('/bulk', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'Products must be an array' });
    }

    if (products.length === 0) {
      return res.json({ success: true, data: { added: 0, updated: 0 } });
    }

    // Deduplicate products by name (keep last occurrence)
    const productMap = new Map<string, any>();
    for (const p of products) {
      const key = (p.name || '').toLowerCase().trim();
      if (key) {
        productMap.set(key, p);
      }
    }
    const uniqueProducts = Array.from(productMap.values());

    // Process in batches of 500 for optimal performance
    const BATCH_SIZE = 500;
    let totalAdded = 0;
    let totalUpdated = 0;

    for (let i = 0; i < uniqueProducts.length; i += BATCH_SIZE) {
      const batch = uniqueProducts.slice(i, i + BATCH_SIZE);

      // Build batch insert query with UNNEST for efficiency
      const names = batch.map(p => p.name);
      const categories = batch.map(p => p.category);
      const baseCosts = batch.map(p => p.base_cost ?? null);
      const sizes = batch.map(p => p.size ?? null);
      const weights = batch.map(p => p.weight ?? null);
      const widths = batch.map(p => p.width ?? null);
      const heights = batch.map(p => p.height ?? null);
      const lengths = batch.map(p => p.length ?? null);
      const sources = batch.map(p => p.source || 'csv');
      const productSkus = batch.map(p => p.product_sku ?? null);
      const parents = batch.map(p => p.parent ?? null);

      const result = await query(`
        INSERT INTO products (name, category, base_cost, size, weight, width, height, length, source, product_sku, parent)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[], $9::text[], $10::text[], $11::text[])
        ON CONFLICT (name) DO UPDATE SET
          category = EXCLUDED.category,
          base_cost = COALESCE(EXCLUDED.base_cost, products.base_cost),
          size = COALESCE(EXCLUDED.size, products.size),
          weight = COALESCE(EXCLUDED.weight, products.weight),
          width = COALESCE(EXCLUDED.width, products.width),
          height = COALESCE(EXCLUDED.height, products.height),
          length = COALESCE(EXCLUDED.length, products.length),
          product_sku = COALESCE(EXCLUDED.product_sku, products.product_sku),
          parent = COALESCE(EXCLUDED.parent, products.parent),
          updated_at = NOW()
        RETURNING (xmax = 0) as is_insert
      `, [names, categories, baseCosts, sizes, weights, widths, heights, lengths, sources, productSkus, parents]);

      // Count inserts vs updates
      const inserted = result.filter((r: any) => r.is_insert).length;
      totalAdded += inserted;
      totalUpdated += result.length - inserted;
    }

    res.status(201).json({
      success: true,
      data: { added: totalAdded, updated: totalUpdated }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get distinct product categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT category 
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);
    res.json({ success: true, data: result.map((r: any) => r.category) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Category Expenses ===

// Get all category expenses or filter by platform
router.get('/category-expenses', async (req, res) => {
  try {
    const { platform, marketplaceCode } = req.query;
    let sql = 'SELECT * FROM category_expenses WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (platform) {
      sql += ` AND platform = $${idx++}`;
      params.push(platform);
    }
    if (marketplaceCode) {
      sql += ` AND marketplace_code = $${idx++}`;
      params.push(marketplaceCode);
    }

    const expenses = await query(sql, params);
    res.json({ success: true, data: expenses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find specific category expense
router.get('/category-expenses/find', async (req, res) => {
  try {
    const { category, platform, marketplaceCode } = req.query;
    const expense = await queryOne(
      'SELECT * FROM category_expenses WHERE category = $1 AND platform = $2 AND marketplace_code = $3',
      [category, platform, marketplaceCode]
    );
    res.json({ success: true, data: expense });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert category expense
router.post('/category-expenses', async (req, res) => {
  try {
    const expense = req.body;
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
      expense.category, expense.platform, expense.marketplace_code,
      expense.selling_fee_percent, expense.fba_fee_percent, expense.refund_loss_percent, expense.vat_percent,
      expense.ads_percent, expense.fba_cost_percent, expense.fbm_cost_percent,
      expense.shipping_cost_percent, expense.customs_duty_percent, expense.warehouse_cost_percent,
      expense.sample_size, expense.period_start, expense.period_end, expense.data_source || 'manual'
    ]);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DYNAMIC ROUTES (/:id must be last)
// ============================================

// Get product by ID with cost profile and effective values
router.get('/:id', async (req, res) => {
  try {
    const product = await queryOne(`
      SELECT p.*,
        cp.name as cost_profile_name,
        -- Effective values: profile first, then product
        COALESCE(cp.base_cost, p.base_cost) as effective_base_cost,
        COALESCE(cp.weight, p.weight) as effective_weight,
        COALESCE(cp.width, p.width) as effective_width,
        COALESCE(cp.height, p.height) as effective_height,
        COALESCE(cp.length, p.length) as effective_length,
        -- Source indicator
        CASE WHEN cp.base_cost IS NOT NULL THEN 'profile' WHEN p.base_cost IS NOT NULL THEN 'product' ELSE NULL END as cost_source
      FROM products p
      LEFT JOIN cost_profiles cp ON p.cost_profile_id = cp.id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create product
router.post('/', async (req, res) => {
  try {
    const { name, category, base_cost, size, weight, width, height, length, cost_profile_id, source, product_sku } = req.body;
    const product = await queryOne(`
      INSERT INTO products (name, category, base_cost, size, weight, width, height, length, cost_profile_id, source, product_sku)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [name, category, base_cost, size, weight, width, height, length, cost_profile_id, source || 'manual', product_sku]);
    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { name, category, base_cost, size, weight, width, height, length, cost_profile_id, product_sku } = req.body;
    const product = await queryOne(`
      UPDATE products
      SET name = $1, category = $2, base_cost = $3, size = $4,
          weight = $5, width = $6, height = $7, length = $8, cost_profile_id = $9, product_sku = $10,
          updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [name, category, base_cost, size, weight, width, height, length, cost_profile_id, product_sku, req.params.id]);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AMAZON ANALYZER MAPPING ENDPOINT
// ============================================

/**
 * GET /mapping/amazon-analyzer
 * Returns all SKU mappings from sku_master table
 * Simplified query using the new clean structure
 */
router.get("/mapping/amazon-analyzer", async (req, res) => {
  try {
    console.log("[mapping/amazon-analyzer] Fetching from sku_master...");

    // Direct query from sku_master - no joins needed
    const mappings = await query(`
      SELECT
        sku,
        asin,
        country_code as marketplace,
        name,
        parent,
        category,
        cost,
        size,
        custom_shipping,
        fbm_source,
        fulfillment
      FROM sku_master
      WHERE marketplace = 'amazon'
      ORDER BY country_code, sku
    `);

    // Transform data
    const data = mappings.map((m: any) => ({
      sku: m.sku,
      asin: m.asin || "",
      name: m.name || "",
      parent: m.parent || m.name || "",
      category: m.category || "",
      cost: m.cost,
      size: m.size,
      marketplace: m.marketplace || "",
      customShipping: m.custom_shipping ?? null,
      fbmSource: m.fbm_source || null,
      fulfillment: m.fulfillment || null,
    }));

    const withCost = data.filter((d: any) => d.cost !== null).length;
    const withSize = data.filter((d: any) => d.size !== null).length;

    console.log(`[mapping/amazon-analyzer] Returning ${data.length} mappings (${withCost} with cost, ${withSize} with size)`);

    res.json({
      success: true,
      data,
      meta: {
        total: data.length,
        withCost,
        withSize,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[mapping/amazon-analyzer] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * POST /mapping/amazon-analyzer/missing
 * Receive list of missing SKUs from Amazon Analyzer
 * Now inserts directly into sku_master table
 */
router.post("/mapping/amazon-analyzer/missing", async (req, res) => {
  try {
    const { skus } = req.body;
    if (!Array.isArray(skus)) {
      return res.status(400).json({ success: false, error: "skus must be an array" });
    }

    console.log(`[mapping/amazon-analyzer/missing] Received ${skus.length} missing SKUs`);

    let added = 0;
    let skipped = 0;

    for (const skuInfo of skus) {
      const { sku, asin, name, marketplace, category, fulfillment } = skuInfo;
      if (!sku || !marketplace) {
        skipped++;
        continue;
      }

      // Insert directly into sku_master (upsert)
      const result = await query(`
        INSERT INTO sku_master (sku, marketplace, country_code, asin, name, category, fulfillment)
        VALUES ($1, 'amazon', $2, $3, $4, $5, $6)
        ON CONFLICT (sku, marketplace, country_code) DO NOTHING
        RETURNING id
      `, [sku, marketplace, asin || null, name || sku, category || 'Unknown', fulfillment || null]);

      if (result.length > 0) {
        added++;
      } else {
        skipped++;
      }
    }

    console.log(`[mapping/amazon-analyzer/missing] Added ${added}, skipped ${skipped}`);

    res.json({
      success: true,
      data: { added, skipped, total: skus.length },
    });
  } catch (error: any) {
    console.error("[mapping/amazon-analyzer/missing] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /mapping/amazon-analyzer/sync
 * Manually sync sku_master table with latest product data from marketplace_product_data + products
 * Called from PriceLab UI after product updates
 */
router.post("/mapping/amazon-analyzer/sync", async (req, res) => {
  try {
    console.log("[mapping/amazon-analyzer/sync] Starting SKU Master sync...");

    // Update existing records with latest product data
    // parent = p.parent (ana varyasyon ürünü, product_sku/iwasku değil)
    const updateResult = await query(`
      UPDATE sku_master sm SET
        name = p.name,
        parent = COALESCE(p.parent, p.product_sku),
        category = p.category,
        cost = p.base_cost,
        size = p.size,
        custom_shipping = p.default_custom_shipping,
        fbm_source = p.default_fbm_source,
        updated_at = NOW()
      FROM marketplace_product_data mpd
      JOIN products p ON mpd.product_id = p.id
      WHERE sm.sku = mpd.sku
        AND sm.country_code = mpd.country_code
        AND sm.marketplace = 'amazon'
    `);

    // Insert new records that don't exist yet
    // parent = p.parent (ana varyasyon ürünü), fallback to product_sku if parent is null
    const insertResult = await query(`
      INSERT INTO sku_master (sku, marketplace, country_code, asin, iwasku, name, parent, category, cost, size, custom_shipping, fbm_source)
      SELECT
        mpd.sku,
        'amazon',
        mpd.country_code,
        mpd.asin,
        p.product_sku,
        p.name,
        COALESCE(p.parent, p.product_sku),
        p.category,
        p.base_cost,
        p.size,
        p.default_custom_shipping,
        p.default_fbm_source
      FROM marketplace_product_data mpd
      JOIN products p ON mpd.product_id = p.id
      WHERE mpd.sku IS NOT NULL AND mpd.sku != ''
      ON CONFLICT (sku, marketplace, country_code) DO NOTHING
      RETURNING id
    `);

    // Get stats
    const stats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(cost) as with_cost,
        COUNT(size) as with_size
      FROM sku_master
      WHERE marketplace = 'amazon'
    `);

    const result = {
      updated: (updateResult as any).rowCount || updateResult.length || 0,
      inserted: insertResult.length || 0,
      total: parseInt(stats[0]?.total || '0'),
      withCost: parseInt(stats[0]?.with_cost || '0'),
      withSize: parseInt(stats[0]?.with_size || '0'),
    };

    console.log(`[mapping/amazon-analyzer/sync] Sync complete:`, result);

    res.json({
      success: true,
      data: result,
      message: `Synced ${result.updated} updated, ${result.inserted} new. Total: ${result.total} (${result.withCost} with cost)`,
    });
  } catch (error: any) {
    console.error("[mapping/amazon-analyzer/sync] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
