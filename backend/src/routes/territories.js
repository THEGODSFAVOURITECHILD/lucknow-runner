const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Lucknow bounding box — rejects any territory outside this area
const LUCKNOW = { minLat: 26.7, maxLat: 27.0, minLng: 80.8, maxLng: 81.2 };
const MIN_AREA_SQM = 250;
const MAX_DAILY_AREA_SQM = 5_000_000; // 5 km²
const LOCK_HOURS = 12;
const CONNECTION_GAP_METRES = 5; // as specified

// ─── GET /territories ────────────────────────────────────────────────────────
// Returns all territories for map display — called when map loads
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        t.id, t.polygon_coords, t.area_sqm,
        t.captured_at, t.protected_until, t.center_lat, t.center_lng,
        t.reinforcement_count,
        u.id        AS owner_id,
        u.username  AS owner_username,
        u.nickname  AS owner_nickname,
        u.profile_photo_url,
        u.subscription_type,
        u.territory_color,
        u.territory_pattern,
        -- mark as vulnerable if the 12-hour lock has expired
        (t.protected_until IS NULL OR t.protected_until < NOW()) AS is_vulnerable
      FROM territories t
      LEFT JOIN users u ON t.owner_id = u.id
      ORDER BY t.captured_at DESC
    `);

    res.json({ territories: result.rows });
  } catch (err) {
    console.error('[GET /territories]', err.message);
    res.status(500).json({ error: 'Failed to load territories' });
  }
});

// ─── POST /territories/capture ───────────────────────────────────────────────
// Called once when a user closes their GPS loop
router.post('/capture', requireAuth, async (req, res) => {
  const { polygonCoords, areaSqm, centerLat, centerLng } = req.body;

  // ── Validations ────────────────────────────────────────────────────────────

  // 1. Minimum area check (anti-spam)
  if (!areaSqm || areaSqm < MIN_AREA_SQM) {
    return res.status(400).json({
      error: `Territory too small. Minimum is ${MIN_AREA_SQM} sqm.`,
    });
  }

  // 2. Must be inside Lucknow
  if (
    centerLat < LUCKNOW.minLat || centerLat > LUCKNOW.maxLat ||
    centerLng < LUCKNOW.minLng || centerLng > LUCKNOW.maxLng
  ) {
    return res.status(400).json({ error: 'Territory must be inside Lucknow.' });
  }

  // 3. Check daily capture limit
  const user = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const u = user.rows[0];

  // Reset daily counter if it's a new day
  const lastReset = new Date(u.daily_area_reset_at);
  const now = new Date();
  const isNewDay = now.toDateString() !== lastReset.toDateString();

  if (isNewDay) {
    await db.query(
      'UPDATE users SET daily_area_captured_sqm = 0, daily_area_reset_at = NOW() WHERE id = $1',
      [req.userId]
    );
    u.daily_area_captured_sqm = 0;
  }

  if (Number(u.daily_area_captured_sqm) + areaSqm > MAX_DAILY_AREA_SQM) {
    return res.status(400).json({
      error: 'Daily territory limit reached (5 km²). Come back tomorrow!',
    });
  }

  // 4. Check connection to existing territory (if user already has territory)
  const existing = await db.query(
    'SELECT center_lat, center_lng FROM territories WHERE owner_id = $1 LIMIT 1',
    [req.userId]
  );

  if (existing.rows.length > 0) {
    const prev = existing.rows[0];
    const gapMetres = haversineMetres(
      prev.center_lat, prev.center_lng, centerLat, centerLng
    );
    if (gapMetres > CONNECTION_GAP_METRES) {
      return res.status(400).json({
        error: `New territory must connect to your existing territory (gap: ${Math.round(gapMetres)}m, max: ${CONNECTION_GAP_METRES}m).`,
        gapMetres: Math.round(gapMetres),
      });
    }
  }

  // ── Atomic capture (prevents race condition) ───────────────────────────────
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const protectedUntil = new Date(Date.now() + LOCK_HOURS * 60 * 60 * 1000);

    const territory = await client.query(
      `INSERT INTO territories
         (owner_id, polygon_coords, area_sqm, protected_until, center_lat, center_lng)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, JSON.stringify(polygonCoords), areaSqm, protectedUntil, centerLat, centerLng]
    );

    // Update user stats
    await client.query(
      `UPDATE users
       SET total_territories_captured = total_territories_captured + 1,
           daily_area_captured_sqm    = daily_area_captured_sqm + $1
       WHERE id = $2`,
      [areaSqm, req.userId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      territory: territory.rows[0],
      protectedUntil,
      message: `Territory captured! Protected for ${LOCK_HOURS} hours.`,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[capture transaction]', err.message);
    res.status(500).json({ error: 'Capture failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ─── POST /territories/:id/reinforce ─────────────────────────────────────────
// User loops their existing territory again to extend the timer
router.post('/:id/reinforce', requireAuth, async (req, res) => {
  try {
    const territory = await db.query(
      'SELECT * FROM territories WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.userId]
    );

    if (territory.rows.length === 0) {
      return res.status(404).json({ error: 'Territory not found or not yours' });
    }

    const t = territory.rows[0];
    const currentExpiry = new Date(t.protected_until) > new Date()
      ? new Date(t.protected_until)
      : new Date();

    // Add 2 hours to current expiry
    const newExpiry = new Date(currentExpiry.getTime() + 2 * 60 * 60 * 1000);

    await db.query(
      `UPDATE territories
       SET protected_until    = $1,
           reinforcement_count = reinforcement_count + 1
       WHERE id = $2`,
      [newExpiry, req.params.id]
    );

    res.json({
      success: true,
      newExpiry,
      message: '+2 hours added to your territory protection.',
    });

  } catch (err) {
    res.status(500).json({ error: 'Reinforce failed' });
  }
});

// ─── GET /territories/nearby ─────────────────────────────────────────────────
// Check if anyone else is currently capturing in the same area (racing)
router.get('/nearby', requireAuth, async (req, res) => {
  const { lat, lng } = req.query;

  try {
    // Find active capture attempts within ~500m
    const competitors = await db.query(
      `SELECT ca.user_id, u.username, ca.started_at
       FROM capture_attempts ca
       JOIN users u ON ca.user_id = u.id
       WHERE ca.status = 'active'
         AND ca.user_id != $1
         AND ABS(ca.region_center_lat - $2) < 0.005
         AND ABS(ca.region_center_lng - $3) < 0.005`,
      [req.userId, lat, lng]
    );

    res.json({ competitors: competitors.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not check nearby activity' });
  }
});

// ─── POST /territories/attempt ───────────────────────────────────────────────
// Called when user starts running to capture — registers them in racing system
router.post('/attempt', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;

  try {
    // Cancel any old active attempts from this user
    await db.query(
      `UPDATE capture_attempts SET status = 'cancelled'
       WHERE user_id = $1 AND status = 'active'`,
      [req.userId]
    );

    // Register new attempt
    await db.query(
      `INSERT INTO capture_attempts (user_id, region_center_lat, region_center_lng)
       VALUES ($1, $2, $3)`,
      [req.userId, lat, lng]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not register attempt' });
  }
});

// ─── DELETE /territories/attempt ────────────────────────────────────────────
// Called when user cancels their run
router.delete('/attempt', requireAuth, async (req, res) => {
  await db.query(
    `UPDATE capture_attempts SET status = 'cancelled'
     WHERE user_id = $1 AND status = 'active'`,
    [req.userId]
  );
  res.json({ success: true });
});

// ─── Utility: distance between two GPS coords in metres ─────────────────────
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = router;
