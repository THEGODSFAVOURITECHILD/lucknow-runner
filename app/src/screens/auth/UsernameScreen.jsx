import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/colors';
import { authAPI } from '../../api/index';
import useAuthStore from '../../store/authStore';

export default function UsernameScreen({ navigation, route }) {
  const { email, name, picture, googleId } = route.params;
  const { login } = useAuthStore();

  const [username,     setUsername]     = useState('');
  const [nickname,     setNickname]     = useState(name || '');
  const [checking,     setChecking]     = useState(false);
  const [availability, setAvailability] = useState(null); // null | 'available' | 'taken' | 'invalid'
  const [availMsg,     setAvailMsg]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');

  const debounceTimer = useRef(null);

  // ── Username field handler ────────────────────────────────────────────────
  const handleUsernameChange = (text) => {
    // Strip spaces and special characters as the user types
    const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(clean);
    setAvailability(null);
    setAvailMsg('');
    setError('');

    // Wait 600ms after the user stops typing before checking availability
    clearTimeout(debounceTimer.current);
    if (clean.length >= 3) {
      debounceTimer.current = setTimeout(() => checkAvailability(clean), 600);
    }
  };

  const checkAvailability = async (value) => {
    setChecking(true);
    try {
      const { available, reason } = await authAPI.checkUsername(value);
      setAvailability(available ? 'available' : 'taken');
      setAvailMsg(available ? 'Username available' : (reason || 'Username already taken'));
    } catch {
      setAvailability(null);
      setAvailMsg('Could not check availability');
    } finally {
      setChecking(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (availability !== 'available') return;
    if (!nickname.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await authAPI.completeGoogleSignup({
        username, nickname: nickname.trim(),
        email, googleId, profilePhoto: picture,
      });
      await login(response.token, response.user);

    } catch (err) {
      const msg = err?.response?.data?.error || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived UI states ─────────────────────────────────────────────────────
  const borderColor =
    availability === 'available' ? COLORS.NEON_GREEN :
    availability === 'taken'     ? COLORS.NEON_RED   :
    COLORS.BORDER;

  const hintColor =
    availability === 'available' ? COLORS.NEON_GREEN :
    COLORS.NEON_RED;

  const canSubmit = availability === 'available' && nickname.trim().length > 0 && !submitting;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.BG_PRIMARY }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Text style={styles.title}>Pick your username</Text>
        <Text style={styles.subtitle}>
          This is your permanent player ID.{'\n'}
          Other runners will see this on the map.
        </Text>

        {/* ── Username field ──────────────────────────────────────────────── */}
        <View style={styles.field}>
          <Text style={styles.label}>USERNAME</Text>
          <View style={[styles.inputRow, { borderColor }]}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder="your_username"
              placeholderTextColor={COLORS.GREY_500}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={30}
            />
            {checking && (
              <ActivityIndicator size="small" color={COLORS.NEON_BLUE} style={{ marginRight: 12 }} />
            )}
          </View>
          {availMsg ? (
            <Text style={[styles.hint, { color: hintColor }]}>
              {availability === 'available' ? '✓ ' : '✗ '}{availMsg}
            </Text>
          ) : (
            <Text style={styles.hint}>
              3–30 characters. Letters, numbers, underscores only.
            </Text>
          )}
        </View>

        {/* ── Nickname field ──────────────────────────────────────────────── */}
        <View style={styles.field}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={styles.inputFull}
            value={nickname}
            onChangeText={(t) => { setNickname(t); setError(''); }}
            placeholder="How you appear on the map"
            placeholderTextColor={COLORS.GREY_500}
            maxLength={50}
          />
          <Text style={styles.hint}>Can include spaces. Editable later.</Text>
        </View>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.TEXT_INVERSE} />
          ) : (
            <Text style={styles.btnText}>Enter the game →</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: SPACING.LG,
    paddingTop: 60,
  },
  title: {
    fontSize: FONTS.SIZES.XXL,
    fontWeight: '700',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: SPACING.SM,
  },
  subtitle: {
    fontSize: FONTS.SIZES.SM,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: SPACING.XL,
  },
  field: {
    marginBottom: SPACING.LG,
  },
  label: {
    fontSize: FONTS.SIZES.XS,
    fontWeight: '600',
    color: COLORS.GREY_500,
    letterSpacing: 0.8,
    marginBottom: SPACING.SM,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.MD,
    backgroundColor: COLORS.BG_INPUT,
    paddingHorizontal: SPACING.MD,
  },
  atSign: {
    color: COLORS.GREY_500,
    fontSize: FONTS.SIZES.LG,
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: COLORS.TEXT_PRIMARY,
    fontSize: FONTS.SIZES.MD,
    paddingVertical: 14,
  },
  inputFull: {
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.MD,
    backgroundColor: COLORS.BG_INPUT,
    paddingHorizontal: SPACING.MD,
    paddingVertical: 14,
    color: COLORS.TEXT_PRIMARY,
    fontSize: FONTS.SIZES.MD,
  },
  hint: {
    fontSize: FONTS.SIZES.XS,
    color: COLORS.GREY_500,
    marginTop: 6,
  },
  error: {
    fontSize: FONTS.SIZES.SM,
    color: COLORS.NEON_RED,
    marginBottom: SPACING.MD,
  },
  btn: {
    backgroundColor: COLORS.NEON_GREEN,
    borderRadius: RADIUS.MD,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: SPACING.MD,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    color: COLORS.TEXT_INVERSE,
    fontSize: FONTS.SIZES.MD,
    fontWeight: '600',
  },
});
