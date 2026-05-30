const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: create a signed JWT for a user
function createToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ─── POST /auth/google ───────────────────────────────────────────────────────
// App sends the Google ID token. We verify it and either log the user in
// or ask them to pick a username (new user flow).
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Check if this Google account already has a SektorRun account
    const existing = await db.query(
      'SELECT * FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    if (existing.rows.length > 0) {
      // Returning user — log them in immediately
      const user = existing.rows[0];
      const token = createToken(user.id);

      // Strip sensitive fields before sending
      const { password_hash, ...safeUser } = user;
      return res.json({ token, user: safeUser });
    }

    // New user — they need to pick a username first
    res.json({
      needsUsername: true,
      email,
      name,
      picture,
      googleId,
    });

  } catch (err) {
    console.error('[/auth/google]', err.message);
    res.status(400).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

// ─── POST /auth/google/complete ─────────────────────────────────────────────
// New Google user has chosen a username and nickname. Create their account.
router.post('/google/complete', async (req, res) => {
  try {
    const { username, nickname, email, googleId, profilePhoto } = req.body;

    // Validate username format
    if (!username || username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3–30 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }
    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    // Double-check username is still available (race condition protection)
    const taken = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'Username just got taken. Please choose another.' });
    }

    // Create the account
    const result = await db.query(
      `INSERT INTO users (username, nickname, email, google_id, profile_photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [username.toLowerCase(), nickname.trim(), email, googleId, profilePhoto]
    );

    const newUser = result.rows[0];
    const token = createToken(newUser.id);
    const { password_hash, ...safeUser } = newUser;

    res.status(201).json({ token, user: safeUser });

  } catch (err) {
    console.error('[/auth/google/complete]', err.message);
    res.status(500).json({ error: 'Account creation failed. Please try again.' });
  }
});

// ─── GET /auth/username/check/:username ─────────────────────────────────────
// Real-time username availability check as the user types
router.get('/username/check/:username', async (req, res) => {
  const { username } = req.params;

  if (username.length < 3) {
    return res.json({ available: false, reason: 'Too short (min 3 characters)' });
  }
  if (username.length > 30) {
    return res.json({ available: false, reason: 'Too long (max 30 characters)' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.json({ available: false, reason: 'Letters, numbers, and underscores only' });
  }

  const existing = await db.query(
    'SELECT id FROM users WHERE username = $1',
    [username.toLowerCase()]
  );

  res.json({ available: existing.rows.length === 0 });
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────
// Get current logged-in user's profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, nickname, email, profile_photo_url,
              subscription_type, subscription_expires_at,
              territory_color, territory_pattern,
              total_distance_km, total_territories_captured,
              created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── PATCH /auth/me ──────────────────────────────────────────────────────────
// Update nickname or profile photo (anyone can update these)
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { nickname, profilePhotoUrl } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (nickname) {
      updates.push(`nickname = $${idx++}`);
      values.push(nickname.trim().slice(0, 50));
    }
    if (profilePhotoUrl) {
      updates.push(`profile_photo_url = $${idx++}`);
      values.push(profilePhotoUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    values.push(req.userId);
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const { password_hash, ...safeUser } = result.rows[0];
    res.json({ user: safeUser });

  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;
