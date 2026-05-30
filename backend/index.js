require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security headers
app.use(helmet());

// Allow requests from your React Native app
app.use(cors());

// Parse JSON request bodies
app.use(express.json({ limit: '2mb' }));

// Rate limiting - max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down' },
});
app.use('/api/', limiter);

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/auth', require('./src/routes/auth'));
app.use('/territories', require('./src/routes/territories'));
app.use('/runs', require('./src/routes/runs'));
app.use('/leaderboard', require('./src/routes/leaderboard'));
app.use('/businesses', require('./src/routes/businesses'));

// Health check — Railway uses this to confirm the server is alive
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SektorRun',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ SektorRun backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});
