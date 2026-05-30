const jwt = require('jsonwebtoken');

// Attach this to any route that needs a logged-in user
// Usage: router.get('/profile', requireAuth, (req, res) => { ... })
// After this runs, req.userId is available in your route handler

const requireAuth = (req, res, next) => {
  // Token comes in header: "Authorization: Bearer eyJhb..."
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = { requireAuth };
