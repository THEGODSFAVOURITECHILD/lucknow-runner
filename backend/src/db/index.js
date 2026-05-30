const { Pool } = require('pg');

// Railway automatically sets DATABASE_URL in production
// In development, it comes from your .env file
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL is required in Railway production, not needed locally
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Test the connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Check your DATABASE_URL in .env');
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;
