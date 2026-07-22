/**
 * SettleCelebration — the ONE moment of celebration Ụgwọ allows itself.
 *
 * A full-screen overlay: gentle falling confetti in brand colors and a
 * Fraunces "Settled." headline. Auto-dismisses after ~2.8 s or on tap.
 * Pure react-native-reanimated — no extra dependencies.
 */
import React, { useEffect, useMemo } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';

const { width: W, height: H } = Dimensions.get('window');

const CONFETTI_COLORS = [
  Palette.amber,
  Palette.amberLight,
  Palette.paper,
  Palette.indigoMuted,
  '#8FA3D8',
];

const PIECE_COUNT = 24;

// ─── One confetti piece ───────────────────────────────────────────────────────

function Piece({ index }: { index: number }) {
  const progress = useSharedValue(0);

  // Deterministic pseudo-random layout per index
  const seed   = useMemo(() => Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1, [index]);
  const seed2  = useMemo(() => Math.abs(Math.sin(index * 78.233) * 12345.6789) % 1, [index]);
  const x      = seed * W;
  const drift  = (seed2 - 0.5) * 120;
  const size   = 6 + seed2 * 8;
  const delay  = seed * 500;
  const dur    = 1800 + seed2 * 900;
  const color  = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const isRect = index % 3 === 0;

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: dur, easing: Easing.in(Easing.quad) }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 + progress.value * (H + 80) },
      { translateX: x + progress.value * drift },
      { rotate: `${progress.value * (360 + seed * 360)}deg` },
    ],
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        style,
        {
          width:        size,
          height:       isRect ? size * 0.5 : size,
          borderRadius: isRect ? 2 : size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface SettleCelebrationProps {
  visible:    boolean;
  personName: string;
  onDone:     () => void;
}

export function SettleCelebration({ visible, personName, onDone }: SettleCelebrationProps) {
  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDone}>
      <Pressable style={styles.backdrop} onPress={onDone}>
        {Array.from({ length: PIECE_COUNT }, (_, i) => (
          <Piece key={i} index={i} />
        ))}
        <Animated.View
          entering={FadeIn.delay(150).duration(400)}
          exiting={FadeOut.duration(200)}
          style={styles.card}
        >
          <CheckCircle2 size={44} color={Palette.amber} strokeWidth={1.6} />
          <Text style={styles.headline}>Settled.</Text>
          <Text style={styles.sub}>
            Your account with {personName.split(/\s+/)[0]} is clear.
          </Text>
          <Text style={styles.tagline}>Owed. Remembered. Settled.</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(14,16,23,0.88)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  piece: {
    position: 'absolute',
    top:      0,
    left:     0,
  },
  card: {
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 36,
  },
  headline: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['4xl'],
    color:         Palette.paper,
    letterSpacing: -1,
    marginTop:     6,
  },
  sub: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.base,
    color:      'rgba(250,249,247,0.7)',
    textAlign:  'center',
  },
  tagline: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      10,
    color:         Palette.amber,
    letterSpacing: 2.5,
    marginTop:     12,
    textTransform: 'uppercase',
  },
});
