// ─── SektorRun App Config ──────────────────────────────────────────────────────
// All magic numbers and external IDs live here
// Change API_URL once when you deploy to Railway — nowhere else

export const CONFIG = {

  // ── Backend URL ─────────────────────────────────────────────────────────────
  // During development: find your PC's local IP by running `ipconfig` on Windows
  //   → look for "IPv4 Address" under your WiFi adapter → e.g. 192.168.1.5
  //   → set to 'http://192.168.1.5:3000'   (phone and PC must be on same WiFi)
  // After Railway deploy: replace with your Railway URL
  API_URL: __DEV__
    ? 'http://192.168.1.X:3000'
    : 'https://YOUR_APP_NAME.up.railway.app',

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  // From Firebase Console → Project Settings → Your Apps → Web App → Client ID
  GOOGLE_WEB_CLIENT_ID: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',

  // ── Map ─────────────────────────────────────────────────────────────────────
  MAP_STYLE_URL: 'https://demotiles.maplibre.org/style.json',
  // Alternative free OSM style — uncomment if the above is slow:
  // MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',

  DEFAULT_ZOOM: 14,
  MIN_ZOOM: 10,
  MAX_ZOOM: 19,

  // Lucknow city center — map opens here by default
  LUCKNOW_CENTER: {
    latitude:  26.8467,
    longitude: 80.9462,
  },

  // Lucknow bounding box — territories outside this are rejected
  LUCKNOW_BOUNDS: {
    minLat: 26.7, maxLat: 27.0,
    minLng: 80.8, maxLng: 81.2,
  },

  // ── Territory Rules ──────────────────────────────────────────────────────────
  MIN_TERRITORY_AREA_SQM:     250,       // Smallest valid territory
  MIN_RUN_DISTANCE_KM:        1,         // Run must be at least 1km to count
  TERRITORY_LOCK_HOURS:       12,        // Hours a territory is protected after capture
  CONNECTION_GAP_METRES:      5,         // Max gap between existing and new territory
  MAX_DAILY_AREA_SQM:         5_000_000, // 5 km² per day limit
  REINFORCE_BONUS_HOURS:      2,         // Hours added when reinforcing a territory

  // ── GPS Tracking ─────────────────────────────────────────────────────────────
  GPS_UPDATE_INTERVAL_MS:     2000,      // How often GPS updates during a run (2 seconds)
  GPS_MIN_DISTANCE_METRES:    5,         // Only record a new point if moved 5+ metres
  GPS_ACCURACY_THRESHOLD_M:   20,        // Ignore GPS points with accuracy worse than 20m
  LOOP_CLOSE_THRESHOLD_M:     15,        // Path closing detection radius

  // ── Anti-Cheat ───────────────────────────────────────────────────────────────
  MAX_HUMAN_SPEED_KMH:        30,        // Above this = flagged as cheat

  // ── Razorpay (added Week 4) ──────────────────────────────────────────────────
  // RAZORPAY_KEY_ID: 'rzp_test_xxxx',
  // PLANS: {
  //   BASIC:        { price: 9900,  label: '₹99/month'  },
  //   PREMIUM_PLUS: { price: 15000, label: '₹150/month' },
  //   BUSINESS:     { price: 80000, label: '₹800/month' },
  // },
};
