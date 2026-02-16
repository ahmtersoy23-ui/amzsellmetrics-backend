import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// === Raw Materials ===

// Get all materials
router.get('/raw-materials', async (req, res) => {
  try {
    const materials = await query(`
      SELECT * FROM raw_materials
      ORDER BY name
    `);
    res.json({ success: true, data: materials });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create material
router.post('/raw-materials', async (req, res) => {
  try {
    const { name, category, unit, unit_cost, currency, supplier, notes } = req.body;
    const material = await queryOne(`
      INSERT INTO raw_materials (name, category, unit, unit_cost, currency, supplier, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, category, unit, unit_cost, currency || 'USD', supplier, notes]);
    res.status(201).json({ success: true, data: material });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update material
router.put('/raw-materials/:id', async (req, res) => {
  try {
    const { name, category, unit, unit_cost, currency, supplier, notes } = req.body;
    const material = await queryOne(`
      UPDATE raw_materials
      SET name = $1, category = $2, unit = $3, unit_cost = $4, currency = $5, supplier = $6, notes = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [name, category, unit, unit_cost, currency, supplier, notes, req.params.id]);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    res.json({ success: true, data: material });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete material
router.delete('/raw-materials/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM raw_materials WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    res.json({ success: true, message: 'Material deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Labor Types ===

// Get all labor types
router.get('/labor-types', async (req, res) => {
  try {
    const types = await query('SELECT * FROM labor_types ORDER BY name');
    res.json({ success: true, data: types });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create labor type
router.post('/labor-types', async (req, res) => {
  try {
    const { name, hourly_rate, currency, description } = req.body;
    const type = await queryOne(`
      INSERT INTO labor_types (name, hourly_rate, currency, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, hourly_rate, currency || 'USD', description]);
    res.status(201).json({ success: true, data: type });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update labor type
router.put('/labor-types/:id', async (req, res) => {
  try {
    const { name, hourly_rate, currency, description } = req.body;
    const type = await queryOne(`
      UPDATE labor_types
      SET name = $1, hourly_rate = $2, currency = $3, description = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [name, hourly_rate, currency, description, req.params.id]);
    if (!type) {
      return res.status(404).json({ success: false, error: 'Labor type not found' });
    }
    res.json({ success: true, data: type });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete labor type
router.delete('/labor-types/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM labor_types WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Labor type not found' });
    }
    res.json({ success: true, message: 'Labor type deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Labor Settings ===

// Get labor settings
router.get('/labor-settings', async (req, res) => {
  try {
    const settings = await queryOne('SELECT * FROM labor_settings LIMIT 1');
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert labor settings
router.post('/labor-settings', async (req, res) => {
  try {
    const { default_hourly_rate, currency, overhead_percent } = req.body;
    // Delete existing and insert new (simple approach for single-row settings)
    await query('DELETE FROM labor_settings');
    const settings = await queryOne(`
      INSERT INTO labor_settings (default_hourly_rate, currency, overhead_percent)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [default_hourly_rate, currency || 'USD', overhead_percent || 0]);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Cost Profiles ===

// Get all profiles with product count
router.get('/cost-profiles', async (req, res) => {
  try {
    const profiles = await query(`
      SELECT cp.*,
        (SELECT COUNT(*) FROM products p WHERE p.cost_profile_id = cp.id) as product_count
      FROM cost_profiles cp
      ORDER BY cp.name
    `);
    res.json({ success: true, data: profiles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get profile by ID
router.get('/cost-profiles/:id', async (req, res) => {
  try {
    const profile = await queryOne(
      'SELECT * FROM cost_profiles WHERE id = $1',
      [req.params.id]
    );
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create profile
router.post('/cost-profiles', async (req, res) => {
  try {
    const { name, base_cost, weight, width, height, length, materials, labor_items, overhead_percent, notes } = req.body;
    const profile = await queryOne(`
      INSERT INTO cost_profiles (name, base_cost, weight, width, height, length, materials, labor_items, overhead_percent, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [name, base_cost, weight, width, height, length, JSON.stringify(materials || []), JSON.stringify(labor_items || []), overhead_percent, notes]);
    res.status(201).json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update profile
router.put('/cost-profiles/:id', async (req, res) => {
  try {
    const { name, base_cost, weight, width, height, length, materials, labor_items, overhead_percent, notes } = req.body;
    const profile = await queryOne(`
      UPDATE cost_profiles
      SET name = $1, base_cost = $2, weight = $3, width = $4, height = $5, length = $6,
          materials = $7, labor_items = $8, overhead_percent = $9, notes = $10, updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [name, base_cost, weight, width, height, length, JSON.stringify(materials || []), JSON.stringify(labor_items || []), overhead_percent, notes, req.params.id]);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete profile
router.delete('/cost-profiles/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM cost_profiles WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, message: 'Profile deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get products for a profile
router.get('/cost-profiles/:id/products', async (req, res) => {
  try {
    const products = await query(
      'SELECT id, name, category, base_cost, weight, width, height, length FROM products WHERE cost_profile_id = $1 ORDER BY name',
      [req.params.id]
    );
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign products to a profile
router.post('/cost-profiles/:id/products', async (req, res) => {
  try {
    const { product_ids } = req.body;
    if (!Array.isArray(product_ids)) {
      return res.status(400).json({ success: false, error: 'product_ids must be an array' });
    }

    // Update all specified products to use this profile
    const result = await query(`
      UPDATE products
      SET cost_profile_id = $1, updated_at = NOW()
      WHERE id = ANY($2::uuid[])
      RETURNING id, name
    `, [req.params.id, product_ids]);

    res.json({ success: true, data: result, message: `${result.length} products assigned to profile` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove product from profile
router.delete('/cost-profiles/:id/products/:productId', async (req, res) => {
  try {
    const result = await queryOne(`
      UPDATE products
      SET cost_profile_id = NULL, updated_at = NOW()
      WHERE id = $1 AND cost_profile_id = $2
      RETURNING id
    `, [req.params.productId, req.params.id]);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Product not found in this profile' });
    }
    res.json({ success: true, message: 'Product removed from profile' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
