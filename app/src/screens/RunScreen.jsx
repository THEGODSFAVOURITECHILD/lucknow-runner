import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import MapView, { Polyline, Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';

import { COLORS, FONTS, SPACING, RADIUS } from '../constants/colors';

const { width } = Dimensions.get('window');

const LUCKNOW_REGION = {
  latitude: 26.8467,
  longitude: 80.9462,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

const MIN_CAPTURE_DISTANCE_KM = 1.0;
const MIN_CAPTURE_AREA_SQM = 250;
const LOOP_CLOSE_DISTANCE_METERS = 35;
const MAX_ACCEPTABLE_ACCURACY = 35;
const MAX_REASONABLE_SPEED_MPS = 10;

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function calculatePathDistanceKm(points) {
  if (points.length < 2) return 0;

  let totalMeters = 0;

  for (let i = 1; i < points.length; i++) {
    totalMeters += distanceMeters(points[i - 1], points[i]);
  }

  return totalMeters / 1000;
}

function calculatePolygonAreaSqm(points) {
  if (points.length < 3) return 0;

  const earthRadius = 6371000;
  let area = 0;

  const closedPoints = [...points, points[0]];

  for (let i = 0; i < closedPoints.length - 1; i++) {
    const p1 = closedPoints[i];
    const p2 = closedPoints[i + 1];

    area +=
      toRad(p2.longitude - p1.longitude) *
      (2 + Math.sin(toRad(p1.latitude)) + Math.sin(toRad(p2.latitude)));
  }

  area = Math.abs((area * earthRadius * earthRadius) / 2);

  return area;
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatPace(distanceKm, seconds) {
  if (!distanceKm || distanceKm <= 0) return '--';

  const paceSeconds = seconds / distanceKm;
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.floor(paceSeconds % 60);

  return `${mins}:${String(secs).padStart(2, '0')}/km`;
}

function getCaptureStatus(distanceKm, areaSqm, loopClosed) {
  if (!loopClosed) {
    return 'Close your loop to capture territory';
  }

  if (distanceKm < MIN_CAPTURE_DISTANCE_KM) {
    return `Minimum ${MIN_CAPTURE_DISTANCE_KM.toFixed(1)} km required`;
  }

  if (areaSqm < MIN_CAPTURE_AREA_SQM) {
    return `Minimum ${MIN_CAPTURE_AREA_SQM} m² area required`;
  }

  return 'Territory ready to capture';
}

export default function RunScreen() {
  const mapRef = useRef(null);
  const watcherRef = useRef(null);
  const timerRef = useRef(null);

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [runState, setRunState] = useState('idle');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [path, setPath] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loopClosed, setLoopClosed] = useState(false);
  const [areaSqm, setAreaSqm] = useState(0);

  useEffect(() => {
    requestLocationPermission();

    return () => {
      stopWatcher();
      stopTimer();
    };
  }, []);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Location Required',
        'SektorRun needs location permission to track your run.'
      );
      setPermissionGranted(false);
      return false;
    }

    setPermissionGranted(true);

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const coord = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: Date.now(),
      accuracy: position.coords.accuracy,
    };

    setCurrentLocation(coord);

    mapRef.current?.animateToRegion(
      {
        latitude: coord.latitude,
        longitude: coord.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      800
    );

    return true;
  };

  const startTimer = () => {
    stopTimer();

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopWatcher = () => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  };

  const processLocationPoint = (position) => {
    const { latitude, longitude, accuracy } = position.coords;

    if (accuracy && accuracy > MAX_ACCEPTABLE_ACCURACY) {
      return;
    }

    const newPoint = {
      latitude,
      longitude,
      timestamp: Date.now(),
      accuracy,
    };

    setCurrentLocation(newPoint);

    setPath((prevPath) => {
      if (prevPath.length === 0) {
        return [newPoint];
      }

      const lastPoint = prevPath[prevPath.length - 1];
      const segmentMeters = distanceMeters(lastPoint, newPoint);
      const timeDiffSeconds = Math.max(
        1,
        (newPoint.timestamp - lastPoint.timestamp) / 1000
      );

      const speedMps = segmentMeters / timeDiffSeconds;

      if (speedMps > MAX_REASONABLE_SPEED_MPS) {
        return prevPath;
      }

      if (segmentMeters < 2) {
        return prevPath;
      }

      const updatedPath = [...prevPath, newPoint];
      const updatedDistanceKm = calculatePathDistanceKm(updatedPath);

      setDistanceKm(updatedDistanceKm);

      const startPoint = updatedPath[0];
      const currentToStartMeters = distanceMeters(startPoint, newPoint);

      const hasEnoughPoints = updatedPath.length >= 20;
      const hasEnoughDistance = updatedDistanceKm >= MIN_CAPTURE_DISTANCE_KM;
      const returnedToStart = currentToStartMeters <= LOOP_CLOSE_DISTANCE_METERS;

      if (hasEnoughPoints && hasEnoughDistance && returnedToStart) {
        const calculatedArea = calculatePolygonAreaSqm(updatedPath);

        setLoopClosed(true);
        setAreaSqm(calculatedArea);
      } else {
        setLoopClosed(false);
        setAreaSqm(0);
      }

      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        400
      );

      return updatedPath;
    });
  };

  const startRun = async () => {
    let allowed = permissionGranted;

    if (!allowed) {
      allowed = await requestLocationPermission();
    }

    if (!allowed) return;

    setRunState('running');
    setPath([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setLoopClosed(false);
    setAreaSqm(0);

    startTimer();

    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      processLocationPoint
    );
  };

  const pauseRun = () => {
    setRunState('paused');
    stopWatcher();
    stopTimer();
  };

  const resumeRun = async () => {
    setRunState('running');
    startTimer();

    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      processLocationPoint
    );
  };

  const stopRun = () => {
    stopWatcher();
    stopTimer();
    setRunState('finished');

    const captureStatus = getCaptureStatus(distanceKm, areaSqm, loopClosed);

    Alert.alert(
      loopClosed ? 'Run Finished' : 'Run Finished',
      `${captureStatus}\n\nDistance: ${distanceKm.toFixed(2)} km\nArea: ${Math.round(areaSqm)} m²`
    );
  };

  const resetRun = () => {
    stopWatcher();
    stopTimer();

    setRunState('idle');
    setPath([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setLoopClosed(false);
    setAreaSqm(0);
  };

  const centerOnMe = () => {
    if (!currentLocation) return;

    mapRef.current?.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      600
    );
  };

  const pace = formatPace(distanceKm, elapsedSeconds);
  const captureStatus = getCaptureStatus(distanceKm, areaSqm, loopClosed);
  const captureReady =
    loopClosed &&
    distanceKm >= MIN_CAPTURE_DISTANCE_KM &&
    areaSqm >= MIN_CAPTURE_AREA_SQM;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={
          currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }
            : LUCKNOW_REGION
        }
        showsUserLocation={permissionGranted}
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
      >
        {captureReady && path.length > 2 && (
          <Polygon
            coordinates={path}
            strokeColor={COLORS.NEON_GREEN}
            strokeWidth={3}
            fillColor="rgba(0,255,136,0.22)"
          />
        )}

        {path.length > 1 && (
          <Polyline
  coordinates={path}
  strokeColor={COLORS.NEON_GREEN}
  strokeWidth={5}
/>
        )}

        {path.length > 0 && (
          <Marker coordinate={path[0]} title="Start" pinColor="green" />
        )}

        {loopClosed && path.length > 0 && (
          <Marker
            coordinate={path[path.length - 1]}
            title="Loop Closed"
            description="Territory preview ready"
            pinColor="orange"
          />
        )}
      </MapView>

      <View style={styles.topChip}>
        <Text style={styles.topChipText}>
          {runState === 'running'
            ? 'RUNNING'
            : runState === 'paused'
            ? 'PAUSED'
            : runState === 'finished'
            ? 'FINISHED'
            : 'READY'}
        </Text>
      </View>

      {(loopClosed || captureReady) && (
        <View
          style={[
            styles.loopBanner,
            captureReady ? styles.loopReadyBanner : null,
          ]}
        >
          <Text style={styles.loopTitle}>
            {captureReady ? 'Territory Ready' : 'Loop Detected'}
          </Text>
          <Text style={styles.loopText}>{captureStatus}</Text>
          <Text style={styles.loopText}>
            Area: {Math.round(areaSqm)} m²
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.centerBtn} onPress={centerOnMe}>
        <Text style={styles.centerBtnText}>⊕</Text>
      </TouchableOpacity>

      <View style={styles.panel}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.statLabel}>KM</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatDuration(elapsedSeconds)}</Text>
            <Text style={styles.statLabel}>TIME</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{pace}</Text>
            <Text style={styles.statLabel}>PACE</Text>
          </View>
        </View>

        <View style={styles.captureBox}>
          <Text style={styles.captureLabel}>CAPTURE STATUS</Text>
          <Text
            style={[
              styles.captureText,
              captureReady ? styles.captureTextReady : null,
            ]}
          >
            {captureStatus}
          </Text>
          <Text style={styles.captureSubText}>
            Distance required: 1.00 km • Area required: 250 m²
          </Text>
        </View>

        {runState === 'idle' && (
          <TouchableOpacity style={styles.startBtn} onPress={startRun}>
            <Text style={styles.startBtnText}>Start Run</Text>
          </TouchableOpacity>
        )}

        {runState === 'running' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.pauseBtn} onPress={pauseRun}>
              <Text style={styles.actionText}>Pause</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.stopBtn} onPress={stopRun}>
              <Text style={styles.actionText}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {runState === 'paused' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.startBtnSmall} onPress={resumeRun}>
              <Text style={styles.actionTextDark}>Resume</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.stopBtn} onPress={stopRun}>
              <Text style={styles.actionText}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {runState === 'finished' && (
          <TouchableOpacity style={styles.startBtn} onPress={resetRun}>
            <Text style={styles.startBtnText}>New Run</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BG_PRIMARY,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topChip: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderColor: COLORS.NEON_GREEN,
    borderWidth: 1,
    borderRadius: RADIUS.FULL,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  topChipText: {
    color: COLORS.NEON_GREEN,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: FONTS.SIZES.SM,
  },
  loopBanner: {
    position: 'absolute',
    top: 104,
    left: SPACING.LG,
    right: SPACING.LG,
    backgroundColor: 'rgba(255,165,0,0.92)',
    borderRadius: RADIUS.MD,
    padding: SPACING.MD,
  },
  loopReadyBanner: {
    backgroundColor: 'rgba(0,255,136,0.92)',
  },
  loopTitle: {
    color: '#111',
    fontWeight: '800',
    fontSize: FONTS.SIZES.MD,
  },
  loopText: {
    color: '#222',
    marginTop: 3,
    fontSize: FONTS.SIZES.SM,
  },
  centerBtn: {
    position: 'absolute',
    right: SPACING.LG,
    bottom: 394,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderColor: COLORS.NEON_GREEN,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtnText: {
    color: COLORS.NEON_GREEN,
    fontSize: 30,
    marginTop: -3,
  },
  panel: {
  position: 'absolute',
  bottom: 96,
  width,
  backgroundColor: 'rgba(10,10,10,0.96)',
  borderColor: COLORS.BORDER,
  borderWidth: 1,
  borderRadius: RADIUS.LG,
  paddingHorizontal: SPACING.LG,
  paddingTop: SPACING.LG,
  paddingBottom: 22,
  marginHorizontal: 0,
},
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.SM,
    marginBottom: SPACING.MD,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.BG_CARD,
    borderRadius: RADIUS.MD,
    paddingVertical: 14,
    alignItems: 'center',
    borderColor: COLORS.BORDER,
    borderWidth: 1,
  },
  statValue: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 1,
  },
  captureBox: {
    backgroundColor: COLORS.BG_CARD,
    borderRadius: RADIUS.MD,
    borderColor: COLORS.BORDER,
    borderWidth: 1,
    padding: SPACING.MD,
    marginBottom: SPACING.MD,
  },
  captureLabel: {
    color: COLORS.TEXT_MUTED,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  captureText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: FONTS.SIZES.SM,
    fontWeight: '700',
  },
  captureTextReady: {
    color: COLORS.NEON_GREEN,
  },
  captureSubText: {
    color: COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  startBtn: {
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: {
    color: COLORS.TEXT_INVERSE,
    fontWeight: '800',
    fontSize: FONTS.SIZES.MD,
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.MD,
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: COLORS.BG_CARD,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
    borderColor: COLORS.NEON_GREEN,
    borderWidth: 1,
  },
  stopBtn: {
    flex: 1,
    backgroundColor: COLORS.NEON_RED || '#FF3B30',
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnSmall: {
    flex: 1,
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionText: {
    color: COLORS.TEXT_PRIMARY,
    fontWeight: '800',
    fontSize: FONTS.SIZES.MD,
  },
  actionTextDark: {
    color: COLORS.TEXT_INVERSE,
    fontWeight: '800',
    fontSize: FONTS.SIZES.MD,
  },
});