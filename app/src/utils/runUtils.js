// ─── SektorRun Run Utilities ──────────────────────────────────────────────────
// Pure functions — no React, no native imports, safe everywhere including Expo Go

import * as turf from '@turf/turf';
import { CONFIG } from '../constants/config';

// ─── Speed thresholds ────────────────────────────────────────────────────────
export const SPEED = {
  NORMAL_MAX_KMH: 40,   // Above this → penalty accumulates
  DISCARD_KMH:    80,   // Above this → discard the GPS point (GPS jump, not the run)
};

// ─── Distance ────────────────────────────────────────────────────────────────
export const haversineKm = (lat1, lon1, lat2, lon2) => {
  try {
    const from = turf.point([lon1, lat1]);
    const to   = turf.point([lon2, lat2]);
    return turf.distance(from, to, { units: 'kilometers' });
  } catch {
    return 0;
  }
};

export const calcSegmentSpeedKmh = (prevCoord, prevTs, newCoord, newTs) => {
  const distKm     = haversineKm(prevCoord.latitude, prevCoord.longitude, newCoord.latitude, newCoord.longitude);
  const elapsedHrs = (newTs - prevTs) / 3_600_000;
  return elapsedHrs > 0 ? distKm / elapsedHrs : 0;
};

// ─── Formatting ──────────────────────────────────────────────────────────────
export const formatDuration = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

export const formatPace = (paceMinPerKm) => {
  if (!paceMinPerKm || !isFinite(paceMinPerKm) || paceMinPerKm > 60) return '--:--';
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2,'0')}`;
};

export const formatSpeed = (kmh) => {
  if (!kmh || !isFinite(kmh) || kmh < 0) return '0.0';
  return Math.min(kmh, 999).toFixed(1);
};

export const estimateCalories = (distanceKm) => Math.round(distanceKm * 65);

// ─── Speed penalty ────────────────────────────────────────────────────────────
// Returns 0-50 (percent). 0 = no penalty, 50 = maximum penalty.
export const calcPenalty = (overspeedSeconds, totalSeconds) => {
  if (!totalSeconds || overspeedSeconds <= 0) return 0;
  const ratio = overspeedSeconds / totalSeconds;
  if (ratio < 0.05) return 0;                           // under 5% = forgiven
  if (ratio < 0.20) return Math.round(ratio * 100);     // linear up to 20%
  return Math.min(50, Math.round(ratio * 150));          // hard cap at 50%
};

// ─── Loop detection ───────────────────────────────────────────────────────────

// Returns true when the runner has returned close to their start point
export const checkLoopClosure = (pathCoords, currentCoord, thresholdM = 15) => {
  if (pathCoords.length < 10) return false;
  const start  = pathCoords[0];
  const distM  = haversineKm(start.latitude, start.longitude, currentCoord.latitude, currentCoord.longitude) * 1000;
  return distM <= thresholdM;
};

// Returns an intersection coord if the new segment crosses any earlier segment, else null
export const checkSelfIntersection = (pathCoords, newPoint) => {
  if (pathCoords.length < 8) return null;

  const lastPt   = pathCoords[pathCoords.length - 1];
  const segLenM  = haversineKm(lastPt.latitude, lastPt.longitude, newPoint.latitude, newPoint.longitude) * 1000;

  // Ignore micro-movements (GPS noise < 5 m) to prevent false positives
  if (segLenM < 5) return null;

  try {
    const newSeg = turf.lineString([
      [lastPt.longitude,    lastPt.latitude],
      [newPoint.longitude,  newPoint.latitude],
    ]);

    // Check all segments except the most recent 3 (they share endpoints — always intersect)
    const checkUpTo = pathCoords.length - 3;
    for (let i = 0; i < checkUpTo - 1; i++) {
      const seg  = turf.lineString([
        [pathCoords[i].longitude,     pathCoords[i].latitude],
        [pathCoords[i+1].longitude,   pathCoords[i+1].latitude],
      ]);
      const hits = turf.lineIntersects(newSeg, seg);
      if (hits.features.length > 0) {
        const [lng, lat] = hits.features[0].geometry.coordinates;
        return { latitude: lat, longitude: lng };
      }
    }
  } catch {
    // Turf throws on degenerate geometries — safe to swallow
  }
  return null;
};

// ─── Polygon area ─────────────────────────────────────────────────────────────
export const calcPolygonArea = (coords) => {
  if (coords.length < 3) return 0;
  try {
    const ring = [...coords, coords[0]]; // close the ring
    const poly = turf.polygon([ring.map(c => [c.longitude, c.latitude])]);
    return turf.area(poly); // returns sqm
  } catch {
    return 0;
  }
};

// ─── Territory candidate builder ──────────────────────────────────────────────
// Call this the MOMENT a loop is detected.
// It snapshots the path coords so even if the user continues running,
// the candidate polygon is frozen at the exact moment of detection.
export const buildTerritoryCandidate = (pathCoords, distanceKm, loopType, speedData = {}) => {
  const areaSqm    = calcPolygonArea(pathCoords);

  // Centroid = average of all vertices (fast approximation for small polygons)
  const centerLat  = pathCoords.reduce((s, p) => s + p.latitude,  0) / pathCoords.length;
  const centerLng  = pathCoords.reduce((s, p) => s + p.longitude, 0) / pathCoords.length;

  const meetsDistance = distanceKm >= (CONFIG.MIN_RUN_DISTANCE_KM ?? 1.0);
  const meetsArea     = areaSqm    >= (CONFIG.MIN_TERRITORY_AREA_SQM ?? 250);
  const isValid       = meetsDistance && meetsArea;

  const totalSecs     = speedData.totalSeconds   || 1;
  const overspeedSecs = speedData.overspeedSeconds || 0;
  const overspeedDist = speedData.overspeedDistanceKm || 0;
  const penaltyPct    = calcPenalty(overspeedSecs, totalSecs);

  return {
    // ── FROZEN SNAPSHOT — never mutate after creation ──────────────────────
    polygonCoords:      [...pathCoords],
    areaSqm,
    effectiveAreaSqm:   areaSqm * (1 - penaltyPct / 100),
    loopDistanceKm:     distanceKm,
    detectedAt:         new Date(),
    loopType,           // 'origin_return' | 'self_crossing'

    // ── Validity ──────────────────────────────────────────────────────────
    isValid,
    captureReady:       isValid && penaltyPct < 100,
    meetsDistance,
    meetsArea,

    // ── Location ──────────────────────────────────────────────────────────
    centerLat,
    centerLng,

    // ── Speed penalty details ──────────────────────────────────────────────
    speedPenalty: {
      penaltyPercent:      penaltyPct,
      overspeedSeconds:    overspeedSecs,
      overspeedDistanceKm: overspeedDist,
    },
  };
};