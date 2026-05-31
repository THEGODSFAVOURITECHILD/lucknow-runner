import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Alert, ScrollView, Linking,
} from 'react-native';
import MapView, { Polyline, Polygon, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { COLORS, FONTS, SPACING, RADIUS } from '../constants/colors';
import { CONFIG } from '../constants/config';
import {
  haversineKm, calcSegmentSpeedKmh,
  formatDuration, formatPace, formatSpeed, estimateCalories,
  checkLoopClosure, checkSelfIntersection,
  buildTerritoryCandidate, SPEED,
} from '../utils/runUtils';
import useAuthStore from '../store/authStore';

// ─── Tiny reusable sub-components ────────────────────────────────────────────

const StatBlock = ({ label, value, large, warn }) => (
  <View style={styles.statBlock}>
    <Text style={[
      styles.statValue,
      large && styles.statValueLg,
      warn  && styles.statValueWarn,
    ]}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const SummaryRow = ({ label, value, highlight, warn }) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[
      styles.summaryValue,
      highlight && { color: COLORS.NEON_GREEN },
      warn      && { color: COLORS.NEON_RED   },
    ]}>
      {value}
    </Text>
  </View>
);

// ─── Lucknow default region ───────────────────────────────────────────────────
const LUCKNOW_REGION = {
  latitude:      CONFIG.LUCKNOW_CENTER.latitude,
  longitude:     CONFIG.LUCKNOW_CENTER.longitude,
  latitudeDelta:  0.04,
  longitudeDelta: 0.04,
};

// ─────────────────────────────────────────────────────────────────────────────
export default function RunScreen() {
  const insets   = useSafeAreaInsets();
  const { user } = useAuthStore();
  const mapRef   = useRef(null);

  // ── Run state machine ───────────────────────────────────────────────────────
  // IDLE → RUNNING → PAUSED → RUNNING → FINISHED
  const [runState, setRunState] = useState('IDLE');
  const runStateRef = useRef('IDLE');
  useEffect(() => { runStateRef.current = runState; }, [runState]);

  // ── Location permission ─────────────────────────────────────────────────────
  const [permission, setPermission] = useState(null);

  // ── Live stats (rendered in UI) ─────────────────────────────────────────────
  const [pathCoords,          setPathCoords]          = useState([]);
  const [currentPosition,     setCurrentPosition]     = useState(null);
  const [distanceKm,          setDistanceKm]          = useState(0);
  const [durationSecs,        setDurationSecs]        = useState(0);
  const [currentSpeedKmh,     setCurrentSpeedKmh]     = useState(0);
  const [maxSpeedKmh,         setMaxSpeedKmh]         = useState(0);
  const [overspeedSeconds,    setOverspeedSeconds]    = useState(0);
  const [overspeedDistanceKm, setOverspeedDistanceKm] = useState(0);
  const [pace,                setPace]                = useState(0);
  const [hasSpeedWarning,     setHasSpeedWarning]     = useState(false);

  // ── Territory candidate ─────────────────────────────────────────────────────
  // State drives the UI. Ref drives the GPS callback logic.
  // They are always kept in sync — the ref is the single source of truth.
  const [territoryCandidate, setTerritoryCandidate] = useState(null);
  const territoryCandidateRef = useRef(null); // persists across re-renders and closures

  // ── Banner animation ────────────────────────────────────────────────────────
  const bannerAnim        = useRef(new Animated.Value(0));
  const bannerTranslateY  = useRef(
    bannerAnim.current.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] })
  );

  // ── Stable refs (readable inside GPS callback without stale closures) ────────
  const pathCoordsRef       = useRef([]);      // source of truth for path
  const totalDistanceRef    = useRef(0);
  const loopCooldownRef     = useRef(false);   // prevents re-detection within 60s
  const lastPointRef        = useRef(null);
  const lastPointTimeRef    = useRef(null);
  const runStartTimeRef     = useRef(null);
  const maxSpeedRef         = useRef(0);
  const overspeedSecsRef    = useRef(0);
  const overspeedDistRef    = useRef(0);
  const watcherRef          = useRef(null);
  const timerRef            = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Check permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermission(status);
    })();
    return () => {
      watcherRef.current?.remove();
      clearInterval(timerRef.current);
    };
  }, []);

  // Timer — only ticks when actively running
  useEffect(() => {
    if (runState === 'RUNNING') {
      timerRef.current = setInterval(() => setDurationSecs(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [runState]);

  // Pace — recalculate whenever distance or time changes
  useEffect(() => {
    if (distanceKm > 0.05 && durationSecs > 0) {
      setPace((durationSecs / 60) / distanceKm);
    }
  }, [durationSecs, distanceKm]);

  // ─────────────────────────────────────────────────────────────────────────────
  // GPS callback — stable (no deps), reads all live values via refs
  // ─────────────────────────────────────────────────────────────────────────────
  const onNewLocation = useCallback((pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const timestamp = pos.timestamp || Date.now();
    const newCoord  = { latitude, longitude };

    // Always update the visible position marker
    setCurrentPosition(newCoord);

    // Only accumulate data while actively running
    if (runStateRef.current !== 'RUNNING') return;

    // Discard GPS fixes with poor accuracy
    if (accuracy && accuracy > 35) return;

    // ── Speed and distance ────────────────────────────────────────────────────
    let segmentKm      = 0;
    let segmentSpeedKmh = 0;

    if (lastPointRef.current && lastPointTimeRef.current) {
      segmentKm       = haversineKm(lastPointRef.current.latitude, lastPointRef.current.longitude, latitude, longitude);
      segmentSpeedKmh = calcSegmentSpeedKmh(lastPointRef.current, lastPointTimeRef.current, newCoord, timestamp);

      setCurrentSpeedKmh(segmentSpeedKmh);

      if (segmentSpeedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = segmentSpeedKmh;
        setMaxSpeedKmh(segmentSpeedKmh);
      }

      // Penalty accumulation: record time and distance above the threshold
      if (segmentSpeedKmh > SPEED.NORMAL_MAX_KMH) {
        const elapsedSecs          = (timestamp - lastPointTimeRef.current) / 1000;
        overspeedSecsRef.current  += elapsedSecs;
        overspeedDistRef.current  += segmentKm;
        setOverspeedSeconds(overspeedSecsRef.current);
        setOverspeedDistanceKm(overspeedDistRef.current);
        setHasSpeedWarning(true);
      }

      // Discard GPS teleport — point is dropped, run continues
      if (segmentSpeedKmh > SPEED.DISCARD_KMH) {
        lastPointRef.current     = newCoord;
        lastPointTimeRef.current = timestamp;
        return;
      }
    }

    // ── Append to path ────────────────────────────────────────────────────────
    const updatedPath        = [...pathCoordsRef.current, newCoord];
    pathCoordsRef.current    = updatedPath;
    setPathCoords([...updatedPath]);

    // ── Accumulate distance ───────────────────────────────────────────────────
    totalDistanceRef.current += segmentKm;
    setDistanceKm(totalDistanceRef.current);

    // ── Loop detection ────────────────────────────────────────────────────────
    // Only fires after the minimum run distance and not within 60s of last detection
    if (
      !loopCooldownRef.current &&
      totalDistanceRef.current >= (CONFIG.MIN_RUN_DISTANCE_KM ?? 1.0) &&
      updatedPath.length >= 12
    ) {
      const loopClosed    = checkLoopClosure(updatedPath, newCoord, 15);
      const intersection  = !loopClosed ? checkSelfIntersection(updatedPath, newCoord) : null;

      if (loopClosed || intersection !== null) {
        const speedData = {
          overspeedSeconds:    overspeedSecsRef.current,
          overspeedDistanceKm: overspeedDistRef.current,
          totalSeconds:        Math.floor((Date.now() - (runStartTimeRef.current || Date.now())) / 1000),
        };

        const candidate = buildTerritoryCandidate(
          updatedPath,
          totalDistanceRef.current,
          loopClosed ? 'origin_return' : 'self_crossing',
          speedData
        );

        // ── THE FIX ───────────────────────────────────────────────────────────
        // Never erase a valid candidate with a smaller or invalid one.
        // The candidate polygon is SNAPSHOTTED inside buildTerritoryCandidate,
        // so continuing to run after this point CANNOT corrupt the saved polygon.
        const existing = territoryCandidateRef.current;
        const isBetter = !existing ||
          (candidate.isValid && candidate.areaSqm > (existing.areaSqm || 0));

        if (isBetter) {
          territoryCandidateRef.current = candidate;
          setTerritoryCandidate({ ...candidate }); // spread to guarantee new object reference
        }

        // 60-second cooldown — prevents banner spam on overlapping loops
        loopCooldownRef.current = true;
        setTimeout(() => { loopCooldownRef.current = false; }, 60_000);

        // Animate the banner
        bannerAnim.current.setValue(0);
        Animated.sequence([
          Animated.timing(bannerAnim.current, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(3500),
          Animated.timing(bannerAnim.current, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      }
    }

    // ── Follow runner ─────────────────────────────────────────────────────────
    mapRef.current?.animateCamera({ center: newCoord }, { duration: 600 });

    lastPointRef.current     = newCoord;
    lastPointTimeRef.current = timestamp;
  }, []); // empty deps — all live values accessed through refs

  // ─────────────────────────────────────────────────────────────────────────────
  // Action handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const startRun = async () => {
    let perm = permission;
    if (perm !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status);
      perm = status;
    }
    if (perm !== 'granted') return;

    // Full reset of all refs and state
    pathCoordsRef.current         = [];
    totalDistanceRef.current      = 0;
    territoryCandidateRef.current = null;
    loopCooldownRef.current       = false;
    lastPointRef.current          = null;
    lastPointTimeRef.current      = null;
    maxSpeedRef.current           = 0;
    overspeedSecsRef.current      = 0;
    overspeedDistRef.current      = 0;
    runStartTimeRef.current       = Date.now();

    setPathCoords([]);
    setDistanceKm(0);
    setDurationSecs(0);
    setCurrentSpeedKmh(0);
    setMaxSpeedKmh(0);
    setOverspeedSeconds(0);
    setOverspeedDistanceKm(0);
    setPace(0);
    setTerritoryCandidate(null);
    setHasSpeedWarning(false);

    try {
      const watcher = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     2000,
          distanceInterval: 3,
        },
        onNewLocation
      );
      watcherRef.current = watcher;
      setRunState('RUNNING');
    } catch {
      Alert.alert('GPS Error', 'Could not start location tracking. Check your permissions and try again.');
    }
  };

  const pauseRun  = () => setRunState('PAUSED');
  const resumeRun = () => setRunState('RUNNING');

  const stopRun = () => {
    watcherRef.current?.remove();
    watcherRef.current = null;

    // Sync ref → state one final time before showing the summary
    if (territoryCandidateRef.current) {
      setTerritoryCandidate({ ...territoryCandidateRef.current });
    }

    setRunState('FINISHED');

    // Zoom map to show the full run path
    setTimeout(() => {
      if (pathCoordsRef.current.length > 1) {
        mapRef.current?.fitToCoordinates(pathCoordsRef.current, {
          edgePadding: { top: 80, right: 40, bottom: 380, left: 40 },
          animated:    true,
        });
      }
    }, 350);
  };

  const resetRun = () => {
    pathCoordsRef.current         = [];
    territoryCandidateRef.current = null;

    setRunState('IDLE');
    setPathCoords([]);
    setDistanceKm(0);
    setDurationSecs(0);
    setCurrentSpeedKmh(0);
    setMaxSpeedKmh(0);
    setOverspeedSeconds(0);
    setOverspeedDistanceKm(0);
    setPace(0);
    setTerritoryCandidate(null);
    setHasSpeedWarning(false);
    setCurrentPosition(null);

    // Re-center map on last known position
    if (lastPointRef.current) {
      mapRef.current?.animateToRegion({
        ...lastPointRef.current,
        latitudeDelta:  0.012,
        longitudeDelta: 0.012,
      }, 500);
    }
  };

  const claimTerritory = () => {
    const c = territoryCandidateRef.current;
    if (!c?.captureReady) {
      Alert.alert('Not ready', 'This territory does not meet the minimum requirements (1 km run, 250 sqm area).');
      return;
    }

    // ── TODO: wire up to backend in the next session ──────────────────────────
    // Uncomment when ready:
    //
    // try {
    //   await territoriesAPI.capture({
    //     polygonCoords: c.polygonCoords.map(p => ({ lat: p.latitude, lng: p.longitude })),
    //     areaSqm:   c.areaSqm,
    //     centerLat: c.centerLat,
    //     centerLng: c.centerLng,
    //   });
    // } catch (err) {
    //   Alert.alert('Save failed', err.message);
    //   return;
    // }

    Alert.alert(
      '🏆 Territory Claimed!',
      `${Math.round(c.effectiveAreaSqm).toLocaleString()} sqm added.\n\n` +
      `(Backend submission will be enabled next session)`,
      [{ text: 'Nice!', onPress: resetRun }]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderStatsBar = () => (
    <BlurView
      intensity={90}
      tint="dark"
      style={[styles.statsBar, { top: insets.top + 10 }]}
    >
      {/* Primary row */}
      <View style={styles.statsRowPrimary}>
        <StatBlock label="KM"   value={distanceKm.toFixed(2)} large />
        <View style={styles.statDivider} />
        <StatBlock label="TIME" value={formatDuration(durationSecs)} large />
      </View>

      {/* Secondary row */}
      <View style={styles.statsRowSecondary}>
        <StatBlock label="PACE /KM" value={formatPace(pace)} />
        <StatBlock
          label="KM/H"
          value={formatSpeed(currentSpeedKmh)}
          warn={currentSpeedKmh > SPEED.NORMAL_MAX_KMH}
        />
        <StatBlock label="CAL" value={String(estimateCalories(distanceKm))} />
      </View>

      {/* Speed warning strip */}
      {hasSpeedWarning && (
        <View style={styles.speedWarnStrip}>
          <Text style={styles.speedWarnText}>⚡ Speed penalty active — slow down</Text>
        </View>
      )}

      {/* Territory ready indicator */}
      {territoryCandidate?.isValid && (
        <View style={styles.captureReadyStrip}>
          <Text style={styles.captureReadyText}>🏆 Territory ready — stop to claim</Text>
        </View>
      )}
    </BlurView>
  );

  const renderTerritoryBanner = () => (
    <Animated.View style={[
      styles.territoryBanner,
      {
        transform: [{ translateY: bannerTranslateY.current }],
        opacity:   bannerAnim.current,
        top:       insets.top + (runState === 'RUNNING' || runState === 'PAUSED' ? 145 : 14),
      },
    ]}>
      <BlurView intensity={95} tint="dark" style={styles.territoryBannerInner}>
        <Text style={styles.bannerTitle}>
          {territoryCandidate?.isValid ? '🏆 Territory Found!' : '⚠️ Loop Closed'}
        </Text>
        <Text style={styles.bannerSub}>
          {territoryCandidate?.isValid
            ? `${Math.round(territoryCandidate.areaSqm).toLocaleString()} sqm · Stop to claim`
            : `Keep running — need ${CONFIG.MIN_RUN_DISTANCE_KM ?? 1} km minimum`}
        </Text>
      </BlurView>
    </Animated.View>
  );

  const renderIdleControls = () => (
    <View style={styles.idlePanel}>
      <Text style={styles.idleHint}>Run a loop to capture territory · min. {CONFIG.MIN_RUN_DISTANCE_KM ?? 1} km</Text>
      <TouchableOpacity style={styles.startBtn} onPress={startRun} activeOpacity={0.85}>
        <Text style={styles.startBtnText}>START RUN</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRunningControls = () => (
    <View style={styles.runControls}>
      <View style={styles.runBtnRow}>
        <TouchableOpacity style={styles.pauseBtn} onPress={pauseRun} activeOpacity={0.85}>
          <Text style={styles.pauseBtnText}>PAUSE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopBtn} onPress={stopRun} activeOpacity={0.85}>
          <Text style={styles.stopBtnText}>STOP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPausedControls = () => (
    <View style={styles.runControls}>
      <Text style={styles.pausedLabel}>⏸  Paused</Text>
      <View style={styles.runBtnRow}>
        <TouchableOpacity style={styles.resumeBtn} onPress={resumeRun} activeOpacity={0.85}>
          <Text style={styles.resumeBtnText}>RESUME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopBtn} onPress={stopRun} activeOpacity={0.85}>
          <Text style={styles.stopBtnText}>STOP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFinishedPanel = () => {
    const c        = territoryCandidate;
    const calories = estimateCalories(distanceKm);

    return (
      <View style={styles.finishedSheet}>
        {/* Drag handle */}
        <View style={styles.sheetHandle} />

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          {/* ── Territory section ───────────────────────────────────────── */}
          {c ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardTitle}>
                {c.captureReady ? '🏆 Territory Found' : '⚠️ Loop Detected'}
              </Text>

              {!c.isValid && (
                <Text style={styles.summaryInvalidHint}>
                  {!c.meetsDistance && `Need ${CONFIG.MIN_RUN_DISTANCE_KM ?? 1} km minimum distance · `}
                  {!c.meetsArea     && 'Area too small (min 250 sqm)'}
                </Text>
              )}

              <SummaryRow
                label="Area"
                value={`${Math.round(c.areaSqm).toLocaleString()} sqm`}
              />
              {c.speedPenalty.penaltyPercent > 0 && (
                <SummaryRow
                  label={`Speed penalty (${Math.round(c.speedPenalty.overspeedSeconds)}s over ${SPEED.NORMAL_MAX_KMH} km/h)`}
                  value={`−${c.speedPenalty.penaltyPercent}%`}
                  warn
                />
              )}
              <SummaryRow
                label="Effective area"
                value={`${Math.round(c.effectiveAreaSqm).toLocaleString()} sqm`}
                highlight={c.captureReady}
              />
            </View>
          ) : (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardTitle}>Run Complete</Text>
              <Text style={styles.summaryNoTerritory}>No territory loop detected this run.</Text>
            </View>
          )}

          {/* ── Run stats ─────────────────────────────────────────────────── */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardTitle}>Run Stats</Text>
            <SummaryRow label="Distance"  value={`${distanceKm.toFixed(2)} km`}  />
            <SummaryRow label="Time"      value={formatDuration(durationSecs)}   />
            <SummaryRow label="Avg pace"  value={`${formatPace(pace)} /km`}      />
            <SummaryRow label="Max speed" value={`${formatSpeed(maxSpeedKmh)} km/h`} />
            <SummaryRow label="Calories"  value={`${calories} kcal`}             />
            {hasSpeedWarning && (
              <SummaryRow
                label="Time over limit"
                value={`${Math.round(overspeedSeconds)}s at >${SPEED.NORMAL_MAX_KMH} km/h`}
                warn
              />
            )}
          </View>

          {/* ── Buttons ───────────────────────────────────────────────────── */}
          {c?.captureReady && (
            <TouchableOpacity style={styles.claimBtn} onPress={claimTerritory} activeOpacity={0.85}>
              <Text style={styles.claimBtnText}>CLAIM TERRITORY</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.doneBtn, c?.captureReady && styles.doneBtnSecondary]}
            onPress={resetRun}
            activeOpacity={0.85}
          >
            <Text style={[styles.doneBtnText, c?.captureReady && styles.doneBtnTextSecondary]}>
              {c?.captureReady ? 'DISCARD & FINISH' : 'DONE'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Permission screens (shown when location is not granted)
  // ─────────────────────────────────────────────────────────────────────────────

  if (permission === 'denied') {
    return (
      <View style={[styles.permScreen, { paddingTop: insets.top }]}>
        <Text style={styles.permIcon}>📍</Text>
        <Text style={styles.permTitle}>Location access needed</Text>
        <Text style={styles.permBody}>Enable location in Settings to start running and capture territories.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.permBtnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (permission === null || permission === 'undetermined') {
    return (
      <View style={[styles.permScreen, { paddingTop: insets.top }]}>
        <Text style={styles.permIcon}>🏃</Text>
        <Text style={styles.permTitle}>Allow location</Text>
        <Text style={styles.permBody}>SektorRun needs GPS to track your run and let you capture territories.</Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            setPermission(status);
          }}
        >
          <Text style={styles.permBtnText}>Allow location access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  const candidate = territoryCandidate; // stable reference for render

  return (
    <View style={styles.container}>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        userInterfaceStyle="dark"
        initialRegion={LUCKNOW_REGION}
        showsUserLocation={runState === 'IDLE'}   // use built-in dot when idle
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        onPress={() => {}}
      >
        {/* Live running path */}
        {pathCoords.length > 1 && (
          <Polyline
            coordinates={pathCoords}
            strokeColor={COLORS.NEON_GREEN}
            strokeWidth={3}
            lineDashPattern={runState === 'PAUSED' ? [8, 6] : null}
          />
        )}

        {/* Saved territory candidate polygon — shown while running continues */}
        {candidate && (
          <Polygon
            coordinates={candidate.polygonCoords}
            strokeColor={candidate.captureReady ? COLORS.NEON_GREEN : COLORS.NEON_ORANGE}
            fillColor={(candidate.captureReady ? COLORS.NEON_GREEN : COLORS.NEON_ORANGE) + '28'}
            strokeWidth={2}
          />
        )}

        {/* Custom runner position dot (neon green, visible during run) */}
        {currentPosition && runState !== 'IDLE' && (
          <Marker
            coordinate={currentPosition}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.runnerDot} />
          </Marker>
        )}

        {/* Start point marker */}
        {pathCoords.length > 0 && (
          <Marker
            coordinate={pathCoords[0]}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.startDot} />
          </Marker>
        )}
      </MapView>

      {/* ── Stats bar (during run / paused) ─────────────────────────────── */}
      {(runState === 'RUNNING' || runState === 'PAUSED') && renderStatsBar()}

      {/* ── Territory found banner ───────────────────────────────────────── */}
      {renderTerritoryBanner()}

      {/* ── Bottom controls ──────────────────────────────────────────────── */}
      {runState === 'IDLE'     && (
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 70 }]}>
          {renderIdleControls()}
        </View>
      )}
      {runState === 'RUNNING'  && (
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 70 }]}>
          {renderRunningControls()}
        </View>
      )}
      {runState === 'PAUSED'   && (
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 70 }]}>
          {renderPausedControls()}
        </View>
      )}

      {/* ── Finished sheet (slides up over map) ──────────────────────────── */}
      {runState === 'FINISHED' && renderFinishedPanel()}

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BG_PRIMARY,
  },

  // ── Permission ──────────────────────────────────────────────────────────────
  permScreen: {
    flex: 1, backgroundColor: COLORS.BG_PRIMARY,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.XL,
  },
  permIcon:  { fontSize: 48, marginBottom: SPACING.MD },
  permTitle: { fontSize: FONTS.SIZES.XL, fontWeight: '700', color: COLORS.TEXT_PRIMARY, marginBottom: SPACING.SM, textAlign: 'center' },
  permBody:  { fontSize: FONTS.SIZES.SM, color: COLORS.TEXT_SECONDARY, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.XL },
  permBtn:   { backgroundColor: COLORS.NEON_GREEN, borderRadius: RADIUS.MD, paddingVertical: 14, paddingHorizontal: 32 },
  permBtnText: { color: COLORS.TEXT_INVERSE, fontSize: FONTS.SIZES.MD, fontWeight: '600' },

  // ── Stats bar ───────────────────────────────────────────────────────────────
  statsBar: {
    position: 'absolute',
    left: 12, right: 12,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.BORDER,
  },
  statsRowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingTop: 10,
    paddingBottom: 4,
  },
  statsRowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingBottom: 8,
  },
  statDivider: {
    width: 1, height: 28,
    backgroundColor: COLORS.BORDER,
    marginHorizontal: SPACING.MD,
  },
  statBlock: {
    flex: 1, alignItems: 'center',
  },
  statValue: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: FONTS.SIZES.SM,
    fontWeight: '600',
  },
  statValueLg: {
    fontSize: FONTS.SIZES.XL,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statValueWarn: {
    color: COLORS.NEON_RED,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.GREY_500,
    letterSpacing: 0.6,
    fontWeight: '500',
    marginTop: 1,
  },
  speedWarnStrip: {
    backgroundColor: COLORS.NEON_RED + '22',
    paddingVertical: 4,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderColor: COLORS.NEON_RED + '55',
  },
  speedWarnText: {
    color: COLORS.NEON_RED, fontSize: 11, fontWeight: '500',
  },
  captureReadyStrip: {
    backgroundColor: COLORS.NEON_GREEN + '18',
    paddingVertical: 5,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderColor: COLORS.NEON_GREEN + '44',
  },
  captureReadyText: {
    color: COLORS.NEON_GREEN, fontSize: 11, fontWeight: '600',
  },

  // ── Territory found banner ──────────────────────────────────────────────────
  territoryBanner: {
    position: 'absolute',
    left: 12, right: 12,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
  },
  territoryBannerInner: {
    paddingVertical: 12, paddingHorizontal: SPACING.MD,
    borderWidth: 0.5, borderColor: COLORS.NEON_GREEN + '66',
    borderRadius: RADIUS.LG,
    alignItems: 'center',
  },
  bannerTitle: {
    color: COLORS.TEXT_PRIMARY, fontSize: FONTS.SIZES.MD, fontWeight: '700',
  },
  bannerSub: {
    color: COLORS.TEXT_SECONDARY, fontSize: FONTS.SIZES.XS, marginTop: 2,
  },

  // ── Bottom controls ─────────────────────────────────────────────────────────
  bottomControls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.MD,
  },
  idlePanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,14,14,0.88)',
    borderRadius: RADIUS.XL,
    padding: SPACING.LG,
    borderWidth: 0.5,
    borderColor: COLORS.BORDER,
  },
  idleHint: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: FONTS.SIZES.XS,
    marginBottom: SPACING.MD,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  startBtn: {
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  startBtnText: {
    color: COLORS.TEXT_INVERSE,
    fontSize: FONTS.SIZES.MD,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  runControls: {
    backgroundColor: 'rgba(14,14,14,0.88)',
    borderRadius: RADIUS.XL,
    padding: SPACING.MD,
    borderWidth: 0.5,
    borderColor: COLORS.BORDER,
  },
  runBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pausedLabel: {
    color: COLORS.NEON_ORANGE,
    fontSize: FONTS.SIZES.XS,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  pauseBtn: {
    flex: 1, backgroundColor: COLORS.BG_SURFACE,
    borderRadius: RADIUS.MD, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.BORDER_BRIGHT,
  },
  pauseBtnText: { color: COLORS.TEXT_PRIMARY, fontWeight: '600', fontSize: FONTS.SIZES.SM, letterSpacing: 1 },
  resumeBtn: {
    flex: 1, backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD, paddingVertical: 16, alignItems: 'center',
  },
  resumeBtnText: { color: COLORS.TEXT_INVERSE, fontWeight: '700', fontSize: FONTS.SIZES.SM, letterSpacing: 1 },
  stopBtn: {
    flex: 1, backgroundColor: COLORS.BG_SURFACE,
    borderRadius: RADIUS.MD, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.NEON_RED + '66',
  },
  stopBtnText: { color: COLORS.NEON_RED, fontWeight: '600', fontSize: FONTS.SIZES.SM, letterSpacing: 1 },

  // ── Marker dots ─────────────────────────────────────────────────────────────
  runnerDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.NEON_GREEN,
    borderWidth: 3, borderColor: '#ffffff',
  },
  startDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.NEON_BLUE,
    borderWidth: 2, borderColor: '#ffffff',
  },

  // ── Finished summary sheet ──────────────────────────────────────────────────
  finishedSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '56%',
    backgroundColor: COLORS.BG_CARD,
    borderTopLeftRadius: RADIUS.XL,
    borderTopRightRadius: RADIUS.XL,
    borderTopWidth: 0.5,
    borderColor: COLORS.BORDER,
    paddingTop: 8,
    paddingHorizontal: SPACING.MD,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.GREY_300,
    alignSelf: 'center',
    marginBottom: SPACING.MD,
  },
  summaryCard: {
    backgroundColor: COLORS.BG_SURFACE,
    borderRadius: RADIUS.MD,
    padding: SPACING.MD,
    marginBottom: SPACING.SM,
    borderWidth: 0.5,
    borderColor: COLORS.BORDER,
  },
  summaryCardTitle: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: FONTS.SIZES.SM,
    fontWeight: '700',
    marginBottom: SPACING.SM,
    letterSpacing: 0.3,
  },
  summaryInvalidHint: {
    color: COLORS.NEON_ORANGE,
    fontSize: FONTS.SIZES.XS,
    marginBottom: SPACING.SM,
  },
  summaryNoTerritory: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: FONTS.SIZES.SM,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.BORDER,
  },
  summaryLabel: { color: COLORS.TEXT_SECONDARY, fontSize: FONTS.SIZES.XS },
  summaryValue: { color: COLORS.TEXT_PRIMARY,   fontSize: FONTS.SIZES.SM, fontWeight: '500' },

  claimBtn: {
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: SPACING.SM,
    marginTop: SPACING.SM,
  },
  claimBtnText: {
    color: COLORS.TEXT_INVERSE,
    fontSize: FONTS.SIZES.SM,
    fontWeight: '700',
    letterSpacing: 1,
  },
  doneBtn: {
    backgroundColor: COLORS.BG_SURFACE,
    borderRadius: RADIUS.MD,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  doneBtnSecondary: {
    backgroundColor: 'transparent',
    borderColor: COLORS.NEON_RED + '55',
  },
  doneBtnText: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: FONTS.SIZES.SM,
    fontWeight: '600',
    letterSpacing: 1,
  },
  doneBtnTextSecondary: {
    color: COLORS.NEON_RED,
  },
});
