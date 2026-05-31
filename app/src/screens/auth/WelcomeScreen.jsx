import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/colors';
// import { CONFIG } from '../../constants/config';
// import { authAPI } from '../../api/index';
import useAuthStore from '../../store/authStore';

export default function WelcomeScreen({ navigation }) {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

 const handleGoogleSignIn = async () => {
  setLoading(true);

  try {
    await login('dev-test-token', {
      id: 'dev-user-1',
      username: 'test_runner',
      nickname: 'Test Runner',
      email: 'test@sektorrun.dev',
      profilePhoto: null,
    });
  } catch (error) {
    console.error('[DevLogin]', error);
    Alert.alert('Error', 'Temporary dev login failed.');
  } finally {
    setLoading(false);
  }
};

  return (
    <View style={styles.container}>

      {/* Logo area */}
      <View style={styles.hero}>
        <Text style={styles.appName}>
          SEKTOR<Text style={styles.appNameAccent}>RUN</Text>
        </Text>

        <Text style={styles.tagline}>
          Claim Lucknow.{'\n'}One run at a time.
        </Text>

        <View style={styles.decorRow}>
          <View style={[styles.decorLine, { backgroundColor: COLORS.NEON_GREEN }]} />
          <View style={[styles.decorDot, { backgroundColor: COLORS.NEON_GREEN }]} />
          <View style={[styles.decorLine, { backgroundColor: COLORS.NEON_GREEN }]} />
        </View>
      </View>

      {/* Feature bullets */}
      <View style={styles.features}>
        {[
          '🏃  Run to capture territory',
          '🗺   Own zones across Lucknow',
          '🏆  Compete on leaderboards',
        ].map((f) => (
          <Text key={f} style={styles.featureText}>
            {f}
          </Text>
        ))}
      </View>

      {/* Sign-in button */}
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
