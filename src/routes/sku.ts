/**
 * SKU Management Routes
 * Handles marketplace product data (SKU mappings) and import templates
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// ============================================
// SKU MAPPINGS (marketplace_product_data)
// ============================================

/**
 * GET /api/sku/product/:productId
 * Get all SKU mappings for a specific product
 */
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    const result = await pool.query(`
      SELECT
        mpd.*,
        m.name as marketplace_name,
        m.short_name as marketplace_short_name,
        m.icon as marketplace_icon
      FROM marketplace_product_data mpd
      LEFT JOIN marketplaces m ON m.id = mpd.marketplace_id
      WHERE mpd.product_id = $1
      ORDER BY m.name, mpd.country_code
    `, [productId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching SKU mappings:', error);
    res.status(500).json({ error: 'Failed to fetch SKU mappings' });
  }
});

/**
 * GET /api/sku/marketplace/:marketplaceId
 * Get all SKU mappings for a specific marketplace
 */
router.get('/marketplace/:marketplaceId', async (req: Request, res: Response) => {
  try {
    const { marketplaceId } = req.params;
    const { country_code } = req.query;

    let query = `
      SELECT
        mpd.*,
        p.name as product_name,
        p.category as product_category,
        p.base_cost as product_base_cost
      FROM marketplace_product_data mpd
      LEFT JOIN products p ON p.id = mpd.product_id
      WHERE mpd.marketplace_id = $1
    `;
    const params: any[] = [marketplaceId];

    if (country_code) {
      query += ` AND mpd.country_code = $2`;
      params.push(country_code);
    }

    query += ` ORDER BY p.name, mpd.country_code`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching marketplace SKUs:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace SKUs' });
  }
});

/**
 * POST /api/sku
 * Create a new SKU mapping
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      product_id,
      marketplace_id,
      country_code,
      sku,
      asin,
      listing_price,
      fulfillment_type,
      status = 'active'
    } = req.body;

    // Validate required fields
    if (!product_id || !marketplace_id || !country_code || !sku) {
      return res.status(400).json({
        error: 'Missing required fields: product_id, marketplace_id, country_code, sku'
      });
    }

    const result = await pool.query(`
      INSERT INTO marketplace_product_data
        (product_id, marketplace_id, country_code, sku, asin, listing_price, fulfillment_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (product_id, marketplace_id, country_code, sku)
      DO UPDATE SET
        asin = EXCLUDED.asin,
        listing_price = EXCLUDED.listing_price,
        fulfillment_type = EXCLUDED.fulfillment_type,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `, [product_id, marketplace_id, country_code, sku, asin, listing_price, fulfillment_type, status]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating SKU mapping:', error);
    res.status(500).json({ error: 'Failed to create SKU mapping' });
  }
});

/**
 * PUT /api/sku/:id
 * Update a SKU mapping
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sku, asin, listing_price, fulfillment_type, status } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_product_data
      SET
        sku = COALESCE($2, sku),
        asin = COALESCE($3, asin),
        listing_price = COALESCE($4, listing_price),
        fulfillment_type = COALESCE($5, fulfillment_type),
        status = COALESCE($6, status),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, sku, asin, listing_price, fulfillment_type, status]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SKU mapping not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating SKU mapping:', error);
    res.status(500).json({ error: 'Failed to update SKU mapping' });
  }
});

/**
 * DELETE /api/sku/:id
 * Delete a SKU mapping
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM marketplace_product_data WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SKU mapping not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting SKU mapping:', error);
    res.status(500).json({ error: 'Failed to delete SKU mapping' });
  }
});

/**
 * POST /api/sku/bulk
 * Bulk create/update SKU mappings
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: 'mappings array is required' });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[]
    };

    for (const mapping of mappings) {
      try {
        const {
          product_id,
          marketplace_id,
          country_code,
          sku,
          asin,
          listing_price,
          fulfillment_type,
          status = 'active'
        } = mapping;

        if (!product_id || !marketplace_id || !country_code || !sku) {
          results.errors.push(`Missing required fields for SKU: ${sku}`);
          continue;
        }

        const result = await pool.query(`
          INSERT INTO marketplace_product_data
            (product_id, marketplace_id, country_code, sku, asin, listing_price, fulfillment_type, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (product_id, marketplace_id, country_code, sku)
          DO UPDATE SET
            asin = EXCLUDED.asin,
            listing_price = EXCLUDED.listing_price,
            fulfillment_type = EXCLUDED.fulfillment_type,
            status = EXCLUDED.status,
            updated_at = NOW()
          RETURNING (xmax = 0) as is_insert
        `, [product_id, marketplace_id, country_code, sku, asin, listing_price, fulfillment_type, status]);

        if (result.rows[0].is_insert) {
          results.created++;
        } else {
          results.updated++;
        }
      } catch (err: any) {
        results.errors.push(`Error for SKU ${mapping.sku}: ${err.message}`);
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error bulk creating SKU mappings:', error);
    res.status(500).json({ error: 'Failed to bulk create SKU mappings' });
  }
});

/**
 * GET /api/sku/stats
 * Get SKU statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_skus,
        COUNT(DISTINCT product_id) as products_with_skus,
        COUNT(DISTINCT marketplace_id) as marketplaces_used,
        jsonb_object_agg(
          COALESCE(m.short_name, 'Unknown'),
          sku_count
        ) as by_marketplace
      FROM (
        SELECT
          marketplace_id,
          COUNT(*) as sku_count
        FROM marketplace_product_data
        GROUP BY marketplace_id
      ) counts
      LEFT JOIN marketplaces m ON m.id = counts.marketplace_id
    `);

    res.json(result.rows[0] || {
      total_skus: 0,
      products_with_skus: 0,
      marketplaces_used: 0,
      by_marketplace: {}
    });
  } catch (error) {
    console.error('Error fetching SKU stats:', error);
    res.status(500).json({ error: 'Failed to fetch SKU stats' });
  }
});

// ============================================
// IMPORT TEMPLATES
// ============================================

/**
 * GET /api/sku/templates
 * Get all import templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { marketplace_id } = req.query;

    let query = `
      SELECT
        t.*,
        m.name as marketplace_name,
        m.short_name as marketplace_short_name
      FROM import_templates t
      LEFT JOIN marketplaces m ON m.id = t.marketplace_id
    `;
    const params: any[] = [];

    if (marketplace_id) {
      query += ` WHERE t.marketplace_id = $1`;
      params.push(marketplace_id);
    }

    query += ` ORDER BY t.is_default DESC, t.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/sku/templates
 * Create a new import template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const {
      name,
      marketplace_id,
      country_code,
      columns,
      has_header_row = true,
      delimiter = ','
    } = req.body;

    if (!name || !columns) {
      return res.status(400).json({ error: 'name and columns are required' });
    }

    const result = await pool.query(`
      INSERT INTO import_templates (name, marketplace_id, country_code, columns, has_header_row, delimiter)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, marketplace_id, country_code, JSON.stringify(columns), has_header_row, delimiter]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * DELETE /api/sku/templates/:id
 * Delete an import template
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if it's a system template
    const check = await pool.query(
      'SELECT is_system FROM import_templates WHERE id = $1',
      [id]
    );

    if (check.rows[0]?.is_system) {
      return res.status(403).json({ error: 'Cannot delete system templates' });
    }

    const result = await pool.query(
      'DELETE FROM import_templates WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// PRODUCT MATCHING
// ============================================

/**
 * GET /api/sku/match
 * Find products matching a search term (for SKU linking)
 */
router.get('/match', async (req: Request, res: Response) => {
  try {
    const { q, sku } = req.query;

    if (!q && !sku) {
      return res.status(400).json({ error: 'q (search) or sku parameter required' });
    }

    let query: string;
    let params: any[];

    if (sku) {
      // Try to find exact match by SKU in products table (if it has a sku field)
      // or partial match in name
      query = `
        SELECT id, name, category, base_cost, size
        FROM products
        WHERE LOWER(name) LIKE LOWER($1)
        ORDER BY
          CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
          name
        LIMIT 10
      `;
      params = [`%${sku}%`, sku];
    } else {
      // Search by name
      query = `
        SELECT id, name, category, base_cost, size
        FROM products
        WHERE LOWER(name) LIKE LOWER($1)
        ORDER BY name
        LIMIT 20
      `;
      params = [`%${q}%`];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error matching products:', error);
    res.status(500).json({ error: 'Failed to match products' });
  }
});

/**
 * GET /api/sku/unmatched
 * Get SKUs that don't have a product_id linked
 */
router.get('/unmatched', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        mpd.*,
        m.name as marketplace_name
      FROM marketplace_product_data mpd
      LEFT JOIN marketplaces m ON m.id = mpd.marketplace_id
      WHERE mpd.product_id IS NULL
      ORDER BY mpd.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching unmatched SKUs:', error);
    res.status(500).json({ error: 'Failed to fetch unmatched SKUs' });
  }
});

export default router;
