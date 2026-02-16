import { Router } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// === Shipping Carriers ===

// Get all carriers
router.get('/carriers', async (req, res) => {
  try {
    const carriers = await query(`
      SELECT * FROM shipping_carriers
      ORDER BY name
    `);
    res.json({ success: true, data: carriers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get carrier by ID
router.get('/carriers/:id', async (req, res) => {
  try {
    const carrier = await queryOne(
      'SELECT * FROM shipping_carriers WHERE id = $1',
      [req.params.id]
    );
    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }
    res.json({ success: true, data: carrier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create carrier
router.post('/carriers', async (req, res) => {
  try {
    // Support both camelCase and snake_case
    const name = req.body.name;
    const short_name = req.body.short_name || req.body.shortName || name?.substring(0, 3).toUpperCase();
    const logo = req.body.logo;
    const website = req.body.website;
    const currency = req.body.currency || 'USD';
    const is_default = req.body.is_default ?? req.body.isDefault ?? false;
    const is_active = req.body.is_active ?? req.body.isActive ?? true;

    const carrier = await queryOne(`
      INSERT INTO shipping_carriers (name, short_name, logo, website, currency, is_default, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, short_name, logo, website, currency, is_default, is_active]);
    res.status(201).json({ success: true, data: carrier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update carrier
router.put('/carriers/:id', async (req, res) => {
  try {
    // Support both camelCase and snake_case
    const name = req.body.name;
    const short_name = req.body.short_name || req.body.shortName;
    const logo = req.body.logo;
    const website = req.body.website;
    const currency = req.body.currency;
    const is_default = req.body.is_default ?? req.body.isDefault;
    const is_active = req.body.is_active ?? req.body.isActive;

    const carrier = await queryOne(`
      UPDATE shipping_carriers
      SET name = $1, short_name = $2, logo = $3, website = $4, currency = COALESCE($5, currency), is_default = $6, is_active = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [name, short_name, logo, website, currency, is_default, is_active, req.params.id]);
    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }
    res.json({ success: true, data: carrier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete carrier
router.delete('/carriers/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM shipping_carriers WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }
    res.json({ success: true, message: 'Carrier deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Carrier Route Rates ===

// Get all carrier rates
router.get('/carrier-rates', async (req, res) => {
  try {
    const rates = await query(`
      SELECT
        crr.*,
        sr.from_country || '_' || sr.to_country as route_key
      FROM carrier_route_rates crr
      JOIN shipping_routes sr ON crr.route_id = sr.id
    `);
    res.json({ success: true, data: rates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find carrier rates
router.get('/carrier-rates/find', async (req, res) => {
  try {
    const { carrierId, routeId } = req.query;
    const rate = await queryOne(
      'SELECT * FROM carrier_route_rates WHERE carrier_id = $1 AND route_id = $2',
      [carrierId, routeId]
    );
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert carrier rates
router.post('/carrier-rates', async (req, res) => {
  try {
    const carrier_id = req.body.carrier_id || req.body.carrierId;
    let route_id = req.body.route_id || req.body.routeId;
    // Support both 'rates' (from frontend) and 'weight_brackets' (legacy)
    const weight_brackets = req.body.rates || req.body.weight_brackets || req.body.weightBrackets;
    const currency = req.body.currency || 'USD';

    // If route_id is not a UUID, look it up by from_country_to_country pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(route_id)) {
      // route_id is like "TR_US" or "US_US" - parse and find the route
      const parts = route_id.split('_');
      if (parts.length === 2) {
        const fromCountry = parts[0];
        const toCountry = parts[1];
        const routeRecord = await queryOne(
          'SELECT id FROM shipping_routes WHERE from_country = $1 AND to_country = $2',
          [fromCountry, toCountry]
        );
        if (routeRecord) {
          route_id = routeRecord.id;
        } else {
          return res.status(400).json({ success: false, error: `Route not found for ${fromCountry} -> ${toCountry}` });
        }
      } else {
        return res.status(400).json({ success: false, error: `Invalid route ID format: ${route_id}` });
      }
    }

    const rate = await queryOne(`
      INSERT INTO carrier_route_rates (carrier_id, route_id, weight_brackets, currency)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (carrier_id, route_id) DO UPDATE SET
        weight_brackets = EXCLUDED.weight_brackets,
        currency = EXCLUDED.currency,
        updated_at = NOW()
      RETURNING *
    `, [carrier_id, route_id, JSON.stringify(weight_brackets), currency]);
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete carrier rates
router.delete('/carrier-rates/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM carrier_route_rates WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Carrier rate not found' });
    }
    res.json({ success: true, message: 'Carrier rate deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rates for carrier
router.get('/carriers/:carrierId/rates', async (req, res) => {
  try {
    const rates = await query(
      'SELECT * FROM carrier_route_rates WHERE carrier_id = $1',
      [req.params.carrierId]
    );
    res.json({ success: true, data: rates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert rate
router.post('/carriers/:carrierId/rates', async (req, res) => {
  try {
    const { route_id, weight_brackets } = req.body;
    const rate = await queryOne(`
      INSERT INTO carrier_route_rates (carrier_id, route_id, weight_brackets)
      VALUES ($1, $2, $3)
      ON CONFLICT (carrier_id, route_id) DO UPDATE SET
        weight_brackets = EXCLUDED.weight_brackets,
        updated_at = NOW()
      RETURNING *
    `, [req.params.carrierId, route_id, JSON.stringify(weight_brackets)]);
    res.json({ success: true, data: rate });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Routes ===

// Get all routes
router.get('/routes', async (req, res) => {
  try {
    const routes = await query('SELECT * FROM shipping_routes ORDER BY name');
    res.json({ success: true, data: routes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create custom route
router.post('/routes', async (req, res) => {
  try {
    const { name, from_country, to_country, description, is_active } = req.body;
    const route = await queryOne(`
      INSERT INTO shipping_routes (name, from_country, to_country, description, is_active, is_custom)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [name, from_country, to_country, description, is_active ?? true]);
    res.status(201).json({ success: true, data: route });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Route Shipping Config ===

// Get all route configs
router.get('/route-config', async (req, res) => {
  try {
    const configs = await query('SELECT * FROM route_shipping_config');
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get config by route ID
router.get('/route-config/:routeId', async (req, res) => {
  try {
    const config = await queryOne(
      'SELECT * FROM route_shipping_config WHERE route_id = $1',
      [req.params.routeId]
    );
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert route config
router.post('/route-config', async (req, res) => {
  try {
    const route_id = req.body.route_id || req.body.routeId;
    const default_carrier_id = req.body.default_carrier_id || req.body.defaultCarrierId;
    const preferred_carriers = req.body.preferred_carriers || req.body.preferredCarriers;
    const customs_config = req.body.customs_config || req.body.customsConfig;
    const packaging_config = req.body.packaging_config || req.body.packagingConfig;

    const config = await queryOne(`
      INSERT INTO route_shipping_config (route_id, default_carrier_id, preferred_carriers, customs_config, packaging_config)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (route_id) DO UPDATE SET
        default_carrier_id = EXCLUDED.default_carrier_id,
        preferred_carriers = EXCLUDED.preferred_carriers,
        customs_config = EXCLUDED.customs_config,
        packaging_config = EXCLUDED.packaging_config,
        updated_at = NOW()
      RETURNING *
    `, [route_id, default_carrier_id, preferred_carriers, JSON.stringify(customs_config), JSON.stringify(packaging_config)]);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get config for route (legacy)
router.get('/routes/:routeId/config', async (req, res) => {
  try {
    const config = await queryOne(
      'SELECT * FROM route_shipping_config WHERE route_id = $1',
      [req.params.routeId]
    );
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upsert route config
router.post('/routes/:routeId/config', async (req, res) => {
  try {
    const { default_carrier_id, preferred_carriers, customs_config, packaging_config } = req.body;
    const config = await queryOne(`
      INSERT INTO route_shipping_config (route_id, default_carrier_id, preferred_carriers, customs_config, packaging_config)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (route_id) DO UPDATE SET
        default_carrier_id = EXCLUDED.default_carrier_id,
        preferred_carriers = EXCLUDED.preferred_carriers,
        customs_config = EXCLUDED.customs_config,
        packaging_config = EXCLUDED.packaging_config,
        updated_at = NOW()
      RETURNING *
    `, [req.params.routeId, default_carrier_id, preferred_carriers, JSON.stringify(customs_config), JSON.stringify(packaging_config)]);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
