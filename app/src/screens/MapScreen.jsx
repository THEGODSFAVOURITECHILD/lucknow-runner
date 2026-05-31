import React, { useState, useRef, useEffect } from 'react';

import {

  View, Text, TouchableOpacity, StyleSheet,

  Linking, ActivityIndicator,

} from 'react-native';

import MapView, { Polygon, Marker, PROVIDER_DEFAULT } from 'react-native-maps';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS } from '../constants/colors';

import { CONFIG } from '../constants/config';

import { useLocation } from '../hooks/useLocation';

import { territoriesAPI, businessesAPI } from '../api/index';

import useAuthStore from '../store/authStore';



// Default region — Lucknow city center

const LUCKNOW_REGION = {

  latitude:      CONFIG.LUCKNOW_CENTER.latitude,

  longitude:     CONFIG.LUCKNOW_CENTER.longitude,

  latitudeDelta:  0.06,

  longitudeDelta: 0.06,

};



export default function MapScreen() {

  const insets   = useSafeAreaInsets();

  const mapRef   = useRef(null);

  const { user } = useAuthStore();



  const { location, permission, requestPermission, getOnce } = useLocation();



  const [mapReady,           setMapReady]           = useState(false);

  const [territories,        setTerritories]        = useState([]);

  const [businesses,         setBusinesses]         = useState([]);

  const [selectedTerritory,  setSelectedTerritory]  = useState(null);

  const [loadingData,        setLoadingData]        = useState(false);

  const [centeredOnUser,     setCenteredOnUser]     = useState(false);



  // ── On mount: check permission and get initial location ──────────────────

  useEffect(() => {

    if (permission === 'granted') {

      getOnce(); // fetch a fast location fix right away

    }

  }, [permission]);



  // ── Center map on user when location first arrives ───────────────────────

  useEffect(() => {

    if (location && mapReady && !centeredOnUser) {

      mapRef.current?.animateToRegion({

        latitude:      location.latitude,

        longitude:     location.longitude,

        latitudeDelta:  0.012,

        longitudeDelta: 0.012,

      }, 900);

      setCenteredOnUser(true);

    }

  }, [location, mapReady, centeredOnUser]);



  // ── Load territories + businesses from backend ───────────────────────────

  useEffect(() => {

    loadMapData();

  }, []);



  const loadMapData = async () => {

    setLoadingData(true);

    try {

      const [terrRes, bizRes] = await Promise.allSettled([

        territoriesAPI.getAll(),

        businessesAPI.getAll(),

      ]);

      if (terrRes.status === 'fulfilled') {

        setTerritories(terrRes.value.territories || []);

      }

      if (bizRes.status === 'fulfilled') {

        setBusinesses(bizRes.value.businesses || []);

      }

    } catch (err) {

      console.error('[MapScreen] data load error:', err.message);

    } finally {

      setLoadingData(false);

    }

  };



  // ── Fly to user location ──────────────────────────────────────────────────

  const centerOnMe = () => {

    if (!location) return;

    mapRef.current?.animateToRegion({

      latitude:      location.latitude,

      longitude:     location.longitude,

      latitudeDelta:  0.008,

      longitudeDelta: 0.008,

    }, 500);

  };



  // ── Territory fill/stroke color ───────────────────────────────────────────

  const getColor = (territory) => {

    // Your own territory

    if (territory.owner_id === user?.id) return COLORS.NEON_GREEN;

    // Vulnerable (lock expired) — can be captured

    if (territory.is_vulnerable)         return COLORS.NEON_ORANGE;

    // Premium user with custom color

    if (territory.territory_color && territory.subscription_type !== 'free') {

      return territory.territory_color;

    }

    // All other players

    return COLORS.NEON_RED;

  };



  // ── Parse polygon coords safely ───────────────────────────────────────────

  const parseCoords = (raw) => {

    try {

      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;

      return arr.map(p => ({ latitude: Number(p.lat), longitude: Number(p.lng) }));

    } catch {

      return [];

    }

  };



  // ── Permission screens ────────────────────────────────────────────────────

  if (permission === 'denied') {

    return (

      <View style={[styles.permScreen, { paddingTop: insets.top }]}>

        <Text style={styles.permIcon}>📍</Text>

        <Text style={styles.permTitle}>Location access needed</Text>

        <Text style={styles.permBody}>

          Enable location in Settings so SektorRun can show you the map and track your runs.

        </Text>

        <TouchableOpacity

          style={styles.permBtn}

          onPress={() => Linking.openSettings()}

          activeOpacity={0.85}

        >

          <Text style={styles.permBtnText}>Open Settings</Text>

        </TouchableOpacity>

      </View>

    );

  }



  if (permission === null || permission === 'undetermined') {

    return (

      <View style={[styles.permScreen, { paddingTop: insets.top }]}>

        <Text style={styles.permIcon}>🗺</Text>

        <Text style={styles.permTitle}>Allow location access</Text>

        <Text style={styles.permBody}>

          SektorRun uses your GPS to show the map and let you capture territories by running.

        </Text>

        <TouchableOpacity

          style={styles.permBtn}

          onPress={requestPermission}

          activeOpacity={0.85}

        >

          <Text style={styles.permBtnText}>Allow location</Text>

        </TouchableOpacity>

      </View>

    );

  }



  // ── Main map ──────────────────────────────────────────────────────────────

  return (

    <View style={styles.container}>



      {/* ── Map ─────────────────────────────────────────────────────────── */}

      <MapView

        ref={mapRef}

        style={styles.map}

        provider={PROVIDER_DEFAULT}

        userInterfaceStyle="dark"       // Dark Apple Maps on iOS — no API key needed

        initialRegion={LUCKNOW_REGION}

        showsUserLocation                // Built-in blue dot for user position

        showsMyLocationButton={false}    // We use our own button below

        showsCompass={false}

        showsScale={false}

        showsTraffic={false}

        showsBuildings={false}

        onMapReady={() => setMapReady(true)}

        onPress={() => setSelectedTerritory(null)}

      >



        {/* Territory polygons */}

        {territories.map((t) => {

          const coords = parseCoords(t.polygon_coords);

          if (coords.length < 3) return null;

          const color = getColor(t);

          return (

            <Polygon

              key={t.id}

              coordinates={coords}

              strokeColor={color}

              fillColor={color + '2E'}   // ~18% opacity fill

              strokeWidth={2}

              tappable

              onPress={(e) => {

                e.stopPropagation?.();

                setSelectedTerritory(t);

              }}

            />

          );

        })}



        {/* Business markers */}

        {businesses.map((b) => (

          <Marker

            key={b.id}

            coordinate={{ latitude: Number(b.lat), longitude: Number(b.lng) }}

            title={b.name}

            description={b.category?.replace('_', ' ')}

            pinColor={b.is_highlighted ? '#FFD700' : '#707070'}

          />

        ))}



      </MapView>



      {/* ── Loading overlay (shown until map tiles appear) ──────────────── */}

      {!mapReady && (

        <View style={styles.loadingOverlay}>

          <ActivityIndicator color={COLORS.NEON_GREEN} size="large" />

          <Text style={styles.loadingText}>Loading map…</Text>

        </View>

      )}



      {/* ── Top city chip ────────────────────────────────────────────────── */}

      <View style={[styles.topBar, { top: insets.top + 14 }]} pointerEvents="none">

        <View style={styles.topChip}>

          <Text style={styles.topLabel}>LUCKNOW</Text>

          {loadingData && (

            <ActivityIndicator

              size="small"

              color={COLORS.NEON_GREEN}

              style={{ marginLeft: 8 }}

            />

          )}

        </View>

      </View>



      {/* ── Right-side buttons ───────────────────────────────────────────── */}

      <View style={[styles.sideButtons, { bottom: insets.bottom + 80 }]}>



        {/* Refresh territories */}

        <TouchableOpacity

          style={styles.iconBtn}

          onPress={loadMapData}

          activeOpacity={0.8}

        >

          <Text style={[styles.iconBtnLabel, { color: COLORS.TEXT_SECONDARY }]}>↻</Text>

        </TouchableOpacity>



        {/* Center on me */}

        <TouchableOpacity

          style={[styles.iconBtn, { borderColor: COLORS.NEON_GREEN }]}

          onPress={centerOnMe}

          activeOpacity={0.8}

        >

          <Text style={[styles.iconBtnLabel, { color: COLORS.NEON_GREEN }]}>⊕</Text>

        </TouchableOpacity>



      </View>



      {/* ── Legend chip ──────────────────────────────────────────────────── */}

      <View style={[styles.legend, { bottom: insets.bottom + 80 }]} pointerEvents="none">

        {[

          { color: COLORS.NEON_GREEN,  label: 'Yours' },

          { color: COLORS.NEON_RED,    label: 'Enemy' },

          { color: COLORS.NEON_ORANGE, label: 'Open'  },

        ].map(({ color, label }) => (

          <View key={label} style={styles.legendItem}>

            <View style={[styles.legendDot, { backgroundColor: color }]} />

            <Text style={styles.legendText}>{label}</Text>

          </View>

        ))}

      </View>



      {/* ── Territory info panel ─────────────────────────────────────────── */}

      {selectedTerritory && (

        <View style={[styles.infoPanel, { bottom: insets.bottom + 80 }]}>

          <View style={styles.infoPanelLeft}>

            <Text style={styles.infoPanelOwner}>

              {selectedTerritory.owner_id === user?.id

                ? '🏠  Your territory'

                : `@${selectedTerritory.owner_username || 'unknown'}`}

            </Text>

            <Text style={styles.infoPanelMeta}>

              {Math.round(selectedTerritory.area_sqm || 0).toLocaleString()} sqm

              {'   ·   '}

              {selectedTerritory.is_vulnerable

                ? '🟠 Vulnerable'

                : '🔒 Protected'}

            </Text>

          </View>

          <TouchableOpacity

            style={styles.infoPanelClose}

            onPress={() => setSelectedTerritory(null)}

            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}

          >

            <Text style={styles.infoPanelCloseIcon}>✕</Text>

          </TouchableOpacity>

        </View>

      )}



    </View>

  );

}



// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  container: {

    flex: 1,

    backgroundColor: COLORS.BG_PRIMARY,

  },

  map: {

    flex: 1,

  },



  // ── Permission screens ─────────────────────────────────────────────────────

  permScreen: {

    flex: 1,

    backgroundColor: COLORS.BG_PRIMARY,

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: SPACING.XL,

  },

  permIcon: {

    fontSize: 48,

    marginBottom: SPACING.MD,

  },

  permTitle: {

    fontSize: FONTS.SIZES.XL,

    fontWeight: '700',

    color: COLORS.TEXT_PRIMARY,

    marginBottom: SPACING.SM,

    textAlign: 'center',

  },

  permBody: {

    fontSize: FONTS.SIZES.SM,

    color: COLORS.TEXT_SECONDARY,

    textAlign: 'center',

    lineHeight: 22,

    marginBottom: SPACING.XL,

  },

  permBtn: {

    backgroundColor: COLORS.NEON_GREEN,

    borderRadius: RADIUS.MD,

    paddingVertical: 14,

    paddingHorizontal: 32,

  },

  permBtnText: {

    color: COLORS.TEXT_INVERSE,

    fontSize: FONTS.SIZES.MD,

    fontWeight: '600',

  },



  // ── Map overlays ───────────────────────────────────────────────────────────

  loadingOverlay: {

    ...StyleSheet.absoluteFillObject,

    backgroundColor: COLORS.BG_PRIMARY,

    justifyContent: 'center',

    alignItems: 'center',

    gap: 16,

  },

  loadingText: {

    color: COLORS.TEXT_SECONDARY,

    fontSize: FONTS.SIZES.SM,

  },



  topBar: {

    position: 'absolute',

    left: 0,

    right: 0,

    alignItems: 'center',

  },

  topChip: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: 'rgba(14,14,14,0.88)',

    paddingHorizontal: 14,

    paddingVertical: 7,

    borderRadius: RADIUS.FULL,

    borderWidth: 0.5,

    borderColor: COLORS.BORDER,

  },

  topLabel: {

    color: COLORS.TEXT_PRIMARY,

    fontSize: FONTS.SIZES.XS,

    fontWeight: '700',

    letterSpacing: 3,

  },



  sideButtons: {

    position: 'absolute',

    right: 16,

    gap: 10,

  },

  iconBtn: {

    width: 46,

    height: 46,

    borderRadius: 23,

    backgroundColor: 'rgba(14,14,14,0.9)',

    borderWidth: 1,

    borderColor: COLORS.BORDER,

    justifyContent: 'center',

    alignItems: 'center',

  },

  iconBtnLabel: {

    fontSize: 22,

    lineHeight: 26,

  },



  legend: {

    position: 'absolute',

    left: 16,

    flexDirection: 'row',

    gap: 12,

    backgroundColor: 'rgba(14,14,14,0.88)',

    paddingHorizontal: 12,

    paddingVertical: 8,

    borderRadius: RADIUS.FULL,

    borderWidth: 0.5,

    borderColor: COLORS.BORDER,

  },

  legendItem: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 5,

  },

  legendDot: {

    width: 8,

    height: 8,

    borderRadius: 4,

  },

  legendText: {

    color: COLORS.TEXT_SECONDARY,

    fontSize: 10,

    fontWeight: '500',

  },



  infoPanel: {

    position: 'absolute',

    left: 16,

    right: 16,

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: 'rgba(14,14,14,0.96)',

    borderRadius: RADIUS.MD,

    padding: SPACING.MD,

    borderWidth: 0.5,

    borderColor: COLORS.BORDER_BRIGHT,

  },

  infoPanelLeft: {

    flex: 1,

  },

  infoPanelOwner: {

    color: COLORS.TEXT_PRIMARY,

    fontSize: FONTS.SIZES.SM,

    fontWeight: '600',

    marginBottom: 3,

  },

  infoPanelMeta: {

    color: COLORS.TEXT_SECONDARY,

    fontSize: FONTS.SIZES.XS,

  },

  infoPanelClose: {

    padding: SPACING.XS,

    marginLeft: SPACING.SM,

  },

  infoPanelCloseIcon: {

    color: COLORS.GREY_500,

    fontSize: 16,

  },

});