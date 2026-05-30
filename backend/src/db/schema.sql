-- SektorRun Database Schema
-- Run this file once on your Railway PostgreSQL database
-- Command: psql $DATABASE_URL -f schema.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username                VARCHAR(30) UNIQUE NOT NULL,   -- permanent, no spaces
  nickname                VARCHAR(50) NOT NULL,           -- display name, editable
  email                   VARCHAR(255) UNIQUE NOT NULL,
  password_hash           VARCHAR(255),                   -- null for Google-only accounts
  google_id               VARCHAR(255) UNIQUE,
  profile_photo_url       TEXT,                           -- shown on territory on map
  subscription_type       VARCHAR(20) DEFAULT 'free',     -- 'free' | 'basic' | 'premium_plus'
  subscription_expires_at TIMESTAMP,
  territory_color         VARCHAR(7) DEFAULT '#00FF88',   -- hex color, premium only to change
  territory_pattern       VARCHAR(30) DEFAULT 'solid',    -- cosmetic pattern, premium only
  total_distance_km       DECIMAL(10,2) DEFAULT 0,
  total_territories_captured INTEGER DEFAULT 0,
  daily_area_captured_sqm DECIMAL(15,2) DEFAULT 0,       -- resets daily
  daily_area_reset_at     TIMESTAMP DEFAULT NOW(),
  last_relocation_at      TIMESTAMP,                      -- for 7-day relocation cooldown
  created_at              TIMESTAMP DEFAULT NOW()
);

-- ─── TERRITORIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS territories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  polygon_coords    JSONB NOT NULL,         -- array of {lat, lng} points
  area_sqm          DECIMAL(15,2) NOT NULL,
  captured_at       TIMESTAMP DEFAULT NOW(),
  protected_until   TIMESTAMP,             -- 12 hours after capture
  is_vulnerable     BOOLEAN DEFAULT FALSE, -- true after 12 hours
  center_lat        DECIMAL(10,7) NOT NULL,
  center_lng        DECIMAL(10,7) NOT NULL,
  reinforcement_count INTEGER DEFAULT 0
);

-- ─── RUNS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at           TIMESTAMP NOT NULL,
  ended_at             TIMESTAMP,
  distance_km          DECIMAL(8,3) DEFAULT 0,
  duration_seconds     INTEGER DEFAULT 0,
  pace_min_per_km      DECIMAL(5,2),
  calories             INTEGER DEFAULT 0,
  avg_speed_kmh        DECIMAL(5,2),
  max_speed_kmh        DECIMAL(5,2),
  path_coords          JSONB,              -- array of {lat, lng, timestamp}
  territory_captured_id UUID REFERENCES territories(id),
  created_at           TIMESTAMP DEFAULT NOW()
);

-- ─── CAPTURE ATTEMPTS ───────────────────────────────────────────────────────
-- Tracks when two users are racing for the same territory
CREATE TABLE IF NOT EXISTS capture_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  region_center_lat DECIMAL(10,7),
  region_center_lng DECIMAL(10,7),
  started_at        TIMESTAMP DEFAULT NOW(),
  completed_at      TIMESTAMP,
  status            VARCHAR(20) DEFAULT 'active'  -- 'active' | 'won' | 'lost' | 'cancelled'
);

-- ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_type           VARCHAR(20) NOT NULL,   -- 'basic' | 'premium_plus'
  started_at          TIMESTAMP DEFAULT NOW(),
  expires_at          TIMESTAMP,
  razorpay_payment_id VARCHAR(100),           -- filled in Week 4
  razorpay_order_id   VARCHAR(100),           -- filled in Week 4
  status              VARCHAR(20) DEFAULT 'active'  -- 'active' | 'expired' | 'cancelled'
);

-- ─── BUSINESSES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID REFERENCES users(id),
  name                VARCHAR(100) NOT NULL,
  category            VARCHAR(50),    -- 'cafe' | 'juice' | 'restaurant' | 'gym' | 'other'
  lat                 DECIMAL(10,7) NOT NULL,
  lng                 DECIMAL(10,7) NOT NULL,
  description         TEXT,
  is_highlighted      BOOLEAN DEFAULT FALSE,   -- paid feature, ₹800/month
  highlighted_until   TIMESTAMP,
  razorpay_payment_id VARCHAR(100),            -- filled in Week 4
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── INDEXES (for fast queries) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_territories_owner     ON territories(owner_id);
CREATE INDEX IF NOT EXISTS idx_territories_center    ON territories(center_lat, center_lng);
CREATE INDEX IF NOT EXISTS idx_territories_protected ON territories(protected_until);
CREATE INDEX IF NOT EXISTS idx_runs_user             ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_started          ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_username        ON users(username);
CREATE INDEX IF NOT EXISTS idx_businesses_location   ON businesses(lat, lng);
