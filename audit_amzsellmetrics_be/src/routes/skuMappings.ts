import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// Get all SKU mappings
router.get('/', async (req, res) => {
  try {
    const { product_id, platform, marketplace_code } = req.query;
    let sql = 'SELECT * FROM sku_mappings WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (product_id) {
      sql += ` AND product_id = $${idx++}`;
      params.push(product_id);
    }
    if (platform) {
      sql += ` AND platform = $${idx++}`;
      params.push(platform);
    }
    if (marketplace_code) {
      sql += ` AND marketplace_code = $${idx++}`;
      params.push(marketplace_code);
    }

    sql += ' ORDER BY created_at DESC';
    const mappings = await query(sql, params);
    res.json({ success: true, data: mappings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SKU mapping by ID
router.get('/:id', async (req, res) => {
  try {
    const mapping = await queryOne(
      'SELECT * FROM sku_mappings WHERE id = $1',
      [req.params.id]
    );
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'SKU mapping not found' });
    }
    res.json({ success: true, data: mapping });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create SKU mapping
router.post('/', async (req, res) => {
  try {
    const { product_id, platform, marketplace_code, sku, asin, listing_price, fulfillment_type } = req.body;
    const mapping = await queryOne(`
      INSERT INTO sku_mappings (product_id, platform, marketplace_code, sku, asin, listing_price, fulfillment_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [product_id, platform, marketplace_code, sku, asin, listing_price, fulfillment_type]);
    res.status(201).json({ success: true, data: mapping });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update SKU mapping
router.put('/:id', async (req, res) => {
  try {
    const { sku, asin, listing_price, fulfillment_type } = req.body;
    const mapping = await queryOne(`
      UPDATE sku_mappings
      SET sku = $1, asin = $2, listing_price = $3, fulfillment_type = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [sku, asin, listing_price, fulfillment_type, req.params.id]);
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'SKU mapping not found' });
    }
    res.json({ success: true, data: mapping });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete SKU mapping
router.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM sku_mappings WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'SKU mapping not found' });
    }
    res.json({ success: true, message: 'SKU mapping deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SKU stats
router.get('/stats/by-platform', async (req, res) => {
  try {
    const stats = await query(`
      SELECT platform, COUNT(*) as count
      FROM sku_mappings
      GROUP BY platform
      ORDER BY count DESC
    `);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
