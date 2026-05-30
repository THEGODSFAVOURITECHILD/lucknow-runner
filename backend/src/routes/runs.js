const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Maximum realistic sustained human running speed
const MAX_SPEED_KMH = 30;

// ─── POST /runs ───────────────────────────────────────────────────────────────
// Called once when a user ends their run
router.post('/', requireAuth, async (req, res) => {
  const {
    startedAt, endedAt, distanceKm, durationSeconds,
    paceMinPerKm, calories, avgSpeedKmh, maxSpeedKmh, pathCoords,
  } = req.body;

  // ── Anti-cheat checks ───────────────────────────────────────────────────────

  // 1. Speed check — no human runs faster than 30 km/h sustained
  if (avgSpeedKmh > MAX_SPEED_KMH || maxSpeedKmh > 45) {
    console.warn(`[ANTICHEAT] User ${req.userId} submitted suspicious run: avg ${avgSpeedKmh} km/h`);
    return res.status(400).json({ error: 'Run data failed validation.' });
  }

  // 2. Distance vs time consistency check
  const expectedMaxDist = (durationSeconds / 3600) * MAX_SPEED_KMH;
  if (distanceKm > expectedMaxDist) {
    return res.status(400).json({ error: 'Run data failed validation.' });
  }

  // 3. Minimum distance to save (100m)
  if (distanceKm < 0.1) {
    return res.status(400).json({ error: 'Run too short to save (min 100m).' });
  }

  // 4. Server sets the timestamp — phone time is ignored
  const serverEndedAt = new Date();

  try {
    const result = await db.query(
      `INSERT INTO runs
         (user_id, started_at, ended_at, distance_km, duration_seconds,
          pace_min_per_km, calories, avg_speed_kmh, max_speed_kmh, path_coords)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, distance_km, duration_seconds, pace_min_per_km`,
      [
        req.userId, startedAt, serverEndedAt, distanceKm, durationSeconds,
        paceMinPerKm, calories || 0, avgSpeedKmh, maxSpeedKmh || 0,
        JSON.stringify(pathCoords || []),
      ]
    );

    // Update user's lifetime distance
    await db.query(
      'UPDATE users SET total_distance_km = total_distance_km + $1 WHERE id = $2',
      [distanceKm, req.userId]
    );

    res.status(201).json({ success: true, run: result.rows[0] });

  } catch (err) {
    console.error('[POST /runs]', err.message);
    res.status(500).json({ error: 'Failed to save run.' });
  }
});

// ─── GET /runs/history ────────────────────────────────────────────────────────
// Last 20 runs for the logged-in user (for profile screen)
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, started_at, ended_at, distance_km, duration_seconds,
              pace_min_per_km, calories, territory_captured_id
       FROM runs
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [req.userId]
    );

    res.json({ runs: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch run history.' });
  }
});

// ─── GET /runs/stats ──────────────────────────────────────────────────────────
// Aggregated stats for the user's profile card
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)                          AS total_runs,
         COALESCE(SUM(distance_km), 0)    AS total_km,
         COALESCE(MIN(pace_min_per_km), 0) AS best_pace,
         COALESCE(MAX(distance_km), 0)    AS longest_run_km
       FROM runs
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json({ stats: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;
