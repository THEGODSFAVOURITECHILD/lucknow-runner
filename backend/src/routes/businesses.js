const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const VALID_CATEGORIES = ['cafe', 'juice_shop', 'restaurant', 'gym', 'pharmacy', 'sports_store', 'other'];

// Lucknow bounding box
const LUCKNOW = { minLat: 26.7, maxLat: 27.0, minLng: 80.8, maxLng: 81.2 };

// ─── GET /businesses ──────────────────────────────────────────────────────────
// All businesses for map display — highlighted ones appear more prominently
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, category, lat, lng, description,
             is_highlighted, highlighted_until
      FROM businesses
      WHERE lat BETWEEN $1 AND $2
        AND lng BETWEEN $3 AND $4
      ORDER BY is_highlighted DESC, created_at DESC
    `, [LUCKNOW.minLat, LUCKNOW.maxLat, LUCKNOW.minLng, LUCKNOW.maxLng]);

    // Auto-expire highlight if date has passed
    const businesses = result.rows.map(b => ({
      ...b,
      is_highlighted: b.is_highlighted && new Date(b.highlighted_until) > new Date(),
    }));

    res.json({ businesses });
  } catch (err) {
    console.error('[GET /businesses]', err.message);
    res.status(500).json({ error: 'Failed to load businesses.' });
  }
});

// ─── POST /businesses ─────────────────────────────────────────────────────────
// Any logged-in user can add their store — free basic listing
router.post('/', requireAuth, async (req, res) => {
  const { name, category, lat, lng, description } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Business name is required.' });
  }
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Location is required.' });
  }

  // Must be inside Lucknow
  if (lat < LUCKNOW.minLat || lat > LUCKNOW.maxLat ||
      lng < LUCKNOW.minLng || lng > LUCKNOW.maxLng) {
    return res.status(400).json({ error: 'Business must be located within Lucknow.' });
  }

  const cat = VALID_CATEGORIES.includes(category) ? category : 'other';

  try {
    const result = await db.query(
      `INSERT INTO businesses (owner_user_id, name, category, lat, lng, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, category, lat, lng, is_highlighted`,
      [req.userId, name.trim().slice(0, 100), cat, lat, lng, (description || '').slice(0, 300)]
    );

    res.status(201).json({
      success: true,
      business: result.rows[0],
      message: 'Your store has been added to the map.',
    });
  } catch (err) {
    console.error('[POST /businesses]', err.message);
    res.status(500).json({ error: 'Failed to add business.' });
  }
});

// ─── GET /businesses/mine ─────────────────────────────────────────────────────
// Logged-in user's own business listings
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM businesses WHERE owner_user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json({ businesses: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your businesses.' });
  }
});

// ─── DELETE /businesses/:id ───────────────────────────────────────────────────
// Owner can remove their own listing
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM businesses WHERE id = $1 AND owner_user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found or not yours.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete business.' });
  }
});

// ─── NOTE: Business highlighting (₹800/month) ────────────────────────────────
// Razorpay payment integration added in Week 4
// Placeholder route for later:
//
// router.post('/:id/highlight', requireAuth, async (req, res) => {
//   // 1. Create Razorpay order
//   // 2. On payment success, set is_highlighted = true and highlighted_until = +30 days
// });

module.exports = router;
