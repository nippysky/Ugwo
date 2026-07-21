/**
 * Onboarding welcome — three slides, under 60 seconds to the app.
 *
 *   1. What Ụgwọ does   — track who owes you, and who you owe
 *   2. Privacy promise  — "We can't see your debts. Nobody can."
 *   3. Sign up          — get started / sign in
 *
 * Dark indigo canvas, Fraunces display type, amber accents — the same
 * dignified-ledger language as the rest of the app.
 */
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { HandCoins, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Slide content ─────────────────────────────────────────────────────────

const SLIDES = [
  {
    Icon: HandCoins,
    kicker: 'THE LEDGER',
    title: 'Every kobo,\nremembered.',
    body:
      'Track who owes you and who you owe — friends, family, colleagues. ' +
      'Log a debt in under ten seconds, settle it with dignity.',
  },
  {
    Icon: ShieldCheck,
    kicker: 'THE PROMISE',
    title: "We can't see\nyour debts.",
    body:
      'Nobody can. Your records are encrypted on your phone before they ' +
      'ever leave it. No bank connections. No prying eyes. Just your word, kept.',
  },
  {
    Icon: Sparkles,
    kicker: 'THE PEACE',
    title: 'Owed. Remembered.\nSettled.',
    body:
      'Gentle reminders, face-saving messages, and one small celebration ' +
      'every time a debt is settled. Keep track — and keep the peace.',
  },
] as const;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (p !== page) setPage(p);
  };

  const isLast = page === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      router.push('/(onboarding)/name');
    } else {
      scrollRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + Spacing[6], paddingBottom: Math.max(insets.bottom, Spacing[6]) },
        ]}
      >
        {/* Wordmark */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.brandRow}>
          <Text style={styles.wordmark}>Ụgwọ</Text>
          <Text style={styles.byline}>BY NIPPYSKY</Text>
        </Animated.View>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.pager}
        >
          {SLIDES.map((slide, i) => (
            <View key={i} style={[styles.slide, { width: SCREEN_W }]}>
              <View style={styles.iconBadge}>
                <slide.Icon size={40} color={Palette.amber} strokeWidth={1.4} />
              </View>
              <Text style={styles.kicker}>{slide.kicker}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        {/* CTAs */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(500)}
          style={styles.ctaArea}
        >
          <Pressable
            onPress={handleNext}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>
              {isLast ? 'Get started' : 'Continue'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.indigo,
  },
  brandRow: {
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: Layout.screenPadding,
  },
  wordmark: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['2xl'],
    color:         Palette.paper,
    letterSpacing: -0.5,
  },
  byline: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      9,
    color:         Palette.amber,
    letterSpacing: 3,
  },
  pager: {
    flexGrow: 0,
    flex:     1,
  },
  slide: {
    paddingHorizontal: Layout.screenPadding + Spacing[2],
    alignItems:        'flex-start',
    justifyContent:    'center',
    gap:               Spacing[4],
  },
  iconBadge: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth:     1.5,
    borderColor:     'rgba(232,163,61,0.4)',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing[2],
  },
  kicker: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      11,
    color:         Palette.amber,
    letterSpacing: 3,
  },
  title: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['4xl'],
    color:         Palette.paper,
    letterSpacing: -1,
    lineHeight:    FontSize['4xl'] * 1.12,
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.base,
    color:      'rgba(250,249,247,0.62)',
    lineHeight: FontSize.base * 1.6,
  },
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: Spacing[4],
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: 'rgba(250,249,247,0.25)',
  },
  dotActive: {
    backgroundColor: Palette.amber,
    width:           22,
  },
  ctaArea: {
    paddingHorizontal: Layout.screenPadding,
    gap:               Spacing[3],
  },
  primaryBtn: {
    backgroundColor: Palette.amber,
    borderRadius:    100,
    paddingVertical: 16,
    alignItems:      'center',
  },
  primaryBtnText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.base,
    color:      Palette.indigo,
  },
  secondaryBtn: {
    alignItems:      'center',
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
    color:      'rgba(250,249,247,0.7)',
  },
});
