// ─── SektorRun Design Tokens ──────────────────────────────────────────────────
// Grey + neon dark theme
// Every color in the app comes from here — never hardcode hex values elsewhere

export const COLORS = {

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  BG_PRIMARY:  '#0A0A0A',   // Main screen background (near black)
  BG_CARD:     '#141414',   // Cards, bottom sheets
  BG_SURFACE:  '#1E1E1E',   // Elevated surfaces, modals
  BG_INPUT:    '#1A1A1A',   // Text input backgrounds

  // ── Neon Accents ─────────────────────────────────────────────────────────────
  NEON_GREEN:  '#00FF88',   // Your territory, success, primary CTA buttons
  NEON_RED:    '#FF2D55',   // Enemy territory, errors, danger
  NEON_BLUE:   '#00C8FF',   // Links, secondary actions, info
  NEON_ORANGE: '#FF7700',   // Vulnerable territory (after 12h), warnings
  NEON_GOLD:   '#FFD700',   // Premium users, leaderboard gold, highlights

  // ── Greys ────────────────────────────────────────────────────────────────────
  GREY_900:    '#F2F2F2',   // Highest contrast — main headings
  GREY_700:    '#B0B0B0',   // Secondary text
  GREY_500:    '#707070',   // Muted / placeholder text
  GREY_300:    '#3A3A3A',   // Borders, dividers
  GREY_200:    '#282828',   // Subtle borders
  GREY_100:    '#1C1C1C',   // Barely-visible separators

  // ── Text ─────────────────────────────────────────────────────────────────────
  TEXT_PRIMARY:   '#FFFFFF',
  TEXT_SECONDARY: '#B0B0B0',
  TEXT_MUTED:     '#707070',
  TEXT_INVERSE:   '#0A0A0A',   // Dark text on neon backgrounds

  // ── Borders ──────────────────────────────────────────────────────────────────
  BORDER:        '#2A2A2A',
  BORDER_BRIGHT: '#3D3D3D',

  // ── Map Territory States ─────────────────────────────────────────────────────
  // These are the fill colors painted on the OpenStreetMap canvas
  TERRITORY: {
    OWN:        '#00FF88',   // Green — your territory
    OWN_FILL:   '#00FF8830', // Green with 19% opacity for polygon fill
    ENEMY:      '#FF2D55',   // Red — another user's territory
    ENEMY_FILL: '#FF2D5530', // Red with 19% opacity for polygon fill
    VULNERABLE: '#FF7700',   // Orange — your territory after 12h lock expires
    VULNERABLE_FILL: '#FF770030',
    UNCLAIMED:  '#3A3A3A',   // Dark grey — no owner
    UNCLAIMED_FILL: '#3A3A3A20',
    RACING:     '#FFD700',   // Gold — being raced for right now
    RACING_FILL:'#FFD70030',
  },

  // ── Run Tracker ──────────────────────────────────────────────────────────────
  RUN_PATH:    '#00FF88',   // The line drawn as user runs
  RUN_START:   '#00C8FF',   // Start point dot
  RUN_END:     '#FF2D55',   // End point dot

  // ── Subscription Tiers ───────────────────────────────────────────────────────
  TIER_FREE:         '#707070',
  TIER_BASIC:        '#00C8FF',
  TIER_PREMIUM_PLUS: '#FFD700',
};

// ── Typography ────────────────────────────────────────────────────────────────
export const FONTS = {
  SIZES: {
    XS:  11,
    SM:  13,
    MD:  15,
    LG:  17,
    XL:  20,
    XXL: 26,
    HERO: 48,
  },
  WEIGHTS: {
    REGULAR: '400',
    MEDIUM:  '500',
    SEMIBOLD:'600',
    BOLD:    '700',
    BLACK:   '800',
  },
};

// ── Spacing ───────────────────────────────────────────────────────────────────
export const SPACING = {
  XS:  4,
  SM:  8,
  MD:  16,
  LG:  24,
  XL:  32,
  XXL: 48,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
export const RADIUS = {
  SM:  6,
  MD:  10,
  LG:  14,
  XL:  20,
  FULL: 999,
};
