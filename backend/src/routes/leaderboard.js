const express = require('express');
const router = express.Router();
const db = require('../db');

// Shared query builder — same logic, just different time windows
async function getLeaderboard(interval) {
  const query = `
    SELECT
      u.username,
      u.nickname,
      u.profile_photo_url,
      u.subscription_type,
      u.territory_color,
      COUNT(t.id)                        AS territories_count,
      COALESCE(SUM(t.area_sqm), 0)       AS total_area_sqm,
      COALESCE(SUM(r.distance_km), 0)    AS total_km_run
    FROM users u
    LEFT JOIN territories t
      ON t.owner_id = u.id
      AND t.captured_at >= NOW() - INTERVAL '${interval}'
    LEFT JOIN runs r
      ON r.user_id = u.id
      AND r.started_at >= NOW() - INTERVAL '${interval}'
    GROUP BY
      u.id, u.username, u.nickname,
      u.profile_photo_url, u.subscription_type, u.territory_color
    HAVING COUNT(t.id) > 0 OR SUM(r.distance_km) > 0
    ORDER BY territories_count DESC, total_area_sqm DESC
    LIMIT 50
  `;

  const result = await db.query(query);
  return result.rows;
}

// ─── GET /leaderboard/daily ──────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const rows = await getLeaderboard('24 hours');
    res.json({ leaderboard: rows, period: 'daily' });
  } catch (err) {
    console.error('[leaderboard/daily]', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// ─── GET /leaderboard/weekly ─────────────────────────────────────────────────
router.get('/weekly', async (req, res) => {
  try {
    const rows = await getLeaderboard('7 days');
    res.json({ leaderboard: rows, period: 'weekly' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// ─── GET /leaderboard/monthly ────────────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const rows = await getLeaderboard('30 days');
    res.json({ leaderboard: rows, period: 'monthly' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// ─── GET /leaderboard/alltime ────────────────────────────────────────────────
// All-time: based on total_territories_captured column (cumulative, never resets)
router.get('/alltime', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        u.username,
        u.nickname,
        u.profile_photo_url,
        u.subscription_type,
        u.territory_color,
        u.total_territories_captured,
        u.total_distance_km,
        COUNT(t.id)                   AS current_territories,
        COALESCE(SUM(t.area_sqm), 0)  AS current_area_sqm
      FROM users u
      LEFT JOIN territories t ON t.owner_id = u.id
      GROUP BY u.id, u.username, u.nickname, u.profile_photo_url,
               u.subscription_type, u.territory_color,
               u.total_territories_captured, u.total_distance_km
      ORDER BY u.total_territories_captured DESC
      LIMIT 50
    `);

    res.json({ leaderboard: result.rows, period: 'alltime' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

module.exports = router;
