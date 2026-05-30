import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/colors';
import { CONFIG } from '../../constants/config';
import { authAPI } from '../../api/index';
import useAuthStore from '../../store/authStore';

// Configure Google Sign-In once when this module loads
GoogleSignin.configure({
  webClientId: CONFIG.GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

export default function WelcomeScreen({ navigation }) {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // Check Google Play Services is available (Android)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Open Google account picker
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();

      if (!idToken) throw new Error('No ID token from Google');

      // Send to our backend for verification
      const response = await authAPI.googleLogin(idToken);

      if (response.needsUsername) {
        // New user — needs to pick a username
        navigation.navigate('Username', {
          email:    response.email,
          name:     response.name,
          picture:  response.picture,
          googleId: response.googleId,
        });
      } else {
        // Returning user — log in directly
        await login(response.token, response.user);
      }

    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User closed the picker — do nothing
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Sign-in already in progress — do nothing
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services is required. Please update it and try again.');
      } else {
        console.error('[GoogleSignIn]', error);
        Alert.alert('Sign-in Failed', 'Could not connect to Google. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* ── Logo area ──────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <Text style={styles.appName}>
          SEKTOR<Text style={styles.appNameAccent}>RUN</Text>
        </Text>
        <Text style={styles.tagline}>Claim Lucknow.{'\n'}One run at a time.</Text>

        {/* Decorative neon lines */}
        <View style={styles.decorRow}>
          <View style={[styles.decorLine, { backgroundColor: COLORS.NEON_GREEN }]} />
          <View style={[styles.decorDot,  { backgroundColor: COLORS.NEON_GREEN }]} />
          <View style={[styles.decorLine, { backgroundColor: COLORS.NEON_GREEN }]} />
        </View>
      </View>

      {/* ── Feature bullets ────────────────────────────────────────────────── */}
      <View style={styles.features}>
        {[
          '🏃  Run to capture territory',
          '🗺   Own zones across Lucknow',
          '🏆  Compete on leaderboards',
        ].map((f) => (
          <Text key={f} style={styles.featureText}>{f}</Text>
        ))}
      </View>

      {/* ── Sign-in button ─────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.TEXT_INVERSE} />
          ) : (
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legal}>
          By continuing you agree to our Terms of Service
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BG_PRIMARY,
    paddingHorizontal: SPACING.LG,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    fontSize: 52,
    fontWeight: '800',
    color: COLORS.TEXT_PRIMARY,
    letterSpacing: 4,
  },
  appNameAccent: {
    color: COLORS.NEON_GREEN,
  },
  tagline: {
    fontSize: FONTS.SIZES.XL,
    color: COLORS.TEXT_SECONDARY,
    marginTop: SPACING.SM,
    lineHeight: 28,
  },
  decorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.LG,
    gap: SPACING.SM,
  },
  decorLine: {
    flex: 1,
    height: 1,
    opacity: 0.4,
  },
  decorDot: {
    width: 5,
    height: 5,
    borderRadius: RADIUS.FULL,
  },
  features: {
    gap: SPACING.MD,
    marginBottom: SPACING.XL,
  },
  featureText: {
    fontSize: FONTS.SIZES.MD,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 22,
  },
  actions: {
    gap: SPACING.MD,
  },
  googleBtn: {
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  googleBtnText: {
    color: COLORS.TEXT_INVERSE,
    fontSize: FONTS.SIZES.MD,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  legal: {
    fontSize: FONTS.SIZES.XS,
    color: COLORS.TEXT_MUTED,
    textAlign: 'center',
  },
});
