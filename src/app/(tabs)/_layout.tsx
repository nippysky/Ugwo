import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet, Pressable, Text, type ColorValue } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Menu, Plus, ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Layout } from '../../theme/spacing';
import { FontFamily, FontSize } from '../../theme/typography';
import { AddDebtSheet } from '../../components/ledger/AddDebtSheet';
import { useAddDebtStore } from '../../store/add-debt.store';
import type { DebtDirection } from '../../types';

type TabIconProps = {
  color:   ColorValue;
  focused: boolean;
  size:    number;
};

function TabIcon({
  Icon,
  color,
  focused,
  size,
}: TabIconProps & { Icon: React.ElementType }) {
  return (
    <View style={styles.iconWrap}>
      <Icon
        size={size}
        color={color as string}
        strokeWidth={focused ? 2 : 1.5}
      />
    </View>
  );
}

/**
 * Floating center action — tap opens the "Owed to me / I owe" picker.
 * Ụgwọ is fundamentally about logging one of those two directions, so this
 * is the visual anchor of the tab bar: a raised, icon-only accent button.
 * The plus glyph smoothly rotates into a close (×) shape while open, and the
 * whole button eases up in scale — both driven by reanimated so the state
 * change reads as one continuous motion instead of an abrupt snap.
 */
function AddTabIcon() {
  const { colors, isDark } = useTheme();
  const pickerOpen = useAddDebtStore((s) => s.pickerOpen);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(pickerOpen ? 1 : 0, { damping: 14, stiffness: 200, mass: 0.5 });
  }, [pickerOpen]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.08 }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));

  return (
    <Animated.View
      style={[
        styles.addFab,
        {
          backgroundColor: colors.primary,
          shadowColor:     colors.primary,
          borderColor:     isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
        },
        fabStyle,
      ]}
    >
      <Animated.View style={iconStyle}>
        <Plus size={26} color="#FAF9F7" strokeWidth={2.2} />
      </Animated.View>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isIOS  = Platform.OS === 'ios';

  const pickerOpen  = useAddDebtStore((s) => s.pickerOpen);
  const openPicker  = useAddDebtStore((s) => s.openPicker);
  const closePicker = useAddDebtStore((s) => s.closePicker);
  const openSheet   = useAddDebtStore((s) => s.openSheet);
  const sheetDir    = useAddDebtStore((s) => s.sheetDir);
  const closeSheet  = useAddDebtStore((s) => s.closeSheet);

  const pick = (dir: DebtDirection) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    openSheet(dir);
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,

          // ── iOS ──────────────────────────────────────────────────────────────
          ...(isIOS
            ? isDark
              ? {
                  // Dark mode iOS: clean solid surface — no blur artefacts
                  tabBarStyle: {
                    backgroundColor: colors.tabBar,
                    borderTopColor:  'rgba(255,255,255,0.07)',
                    borderTopWidth:  0.5,
                    height:          Layout.tabBarHeight + insets.bottom,
                    paddingBottom:   insets.bottom,
                    paddingTop:      8,
                    elevation:       0,
                    shadowOpacity:   0,
                  },
                }
              : {
                  // Light mode iOS: frosted glass
                  tabBarBackground: () => (
                    <BlurView
                      intensity={60}
                      tint="light"
                      style={StyleSheet.absoluteFill}
                    />
                  ),
                  tabBarStyle: {
                    backgroundColor: 'transparent',
                    borderTopColor:  'rgba(0,0,0,0.06)',
                    borderTopWidth:  0.5,
                    height:          Layout.tabBarHeight + insets.bottom,
                    paddingBottom:   insets.bottom,
                    paddingTop:      8,
                    elevation:       0,
                    shadowOpacity:   0,
                  },
                }
            : {
                // ── Android: solid Material 3 ────────────────────────────────
                tabBarStyle: {
                  backgroundColor: colors.tabBar,
                  borderTopWidth:  0,
                  elevation:       8,
                  height:          Layout.tabBarHeight + insets.bottom,
                  paddingBottom:   insets.bottom,
                  paddingTop:      8,
                },
              }),

          tabBarActiveTintColor:   colors.tabActive   as string,
          tabBarInactiveTintColor: colors.tabInactive as string,
          tabBarLabelStyle: {
            fontFamily:    FontFamily.sansMedium,
            fontSize:      FontSize.xs,
            marginTop:     2,
            letterSpacing: 0.1,
          },
          tabBarItemStyle: {
            paddingVertical: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused, size }) => (
              <TabIcon Icon={Home} color={color} focused={focused} size={size} />
            ),
          }}
        />
        {/* History is still a real, navigable route (reached from the icon on
            Home) but no longer occupies a slot in the tab bar itself. */}
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen
          name="add"
          options={{
            title:       '',
            tabBarLabel: () => null,
            tabBarIcon:  () => <AddTabIcon />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              openPicker();
            },
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, focused, size }) => (
              <TabIcon Icon={Menu} color={color} focused={focused} size={size} />
            ),
          }}
        />
      </Tabs>

      {/* Direction picker — opened from the center FAB, available on any tab.
          Presented as a bold, elaborate panel (not tiny pills) so each choice
          reads clearly: colored icon, title, one-line description. */}
      {pickerOpen && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={closePicker}
          />
        </Animated.View>
      )}
      {pickerOpen && (
        <Animated.View
          entering={FadeInDown.springify().damping(16).mass(0.7)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.pickerPanel,
            {
              backgroundColor: colors.card,
              bottom:          Layout.tabBarHeight + insets.bottom + 20,
              left:            Layout.screenPadding,
              right:           Layout.screenPadding,
              shadowColor:     isDark ? '#000000' : colors.text as string,
            },
          ]}
        >
          <Pressable
            onPress={() => pick('owed_to_me')}
            style={({ pressed }) => [styles.pickerRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.pickerIconWrap, { backgroundColor: colors.owedToMeBg }]}>
              <ArrowDownLeft size={22} color={colors.owedToMe as string} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Owed to me</Text>
              <Text style={[styles.pickerSubtitle, { color: colors.textTertiary }]}>
                Log money someone owes you
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary as string} />
          </Pressable>

          <View style={[styles.pickerDivider, { backgroundColor: colors.borderLight }]} />

          <Pressable
            onPress={() => pick('i_owe')}
            style={({ pressed }) => [styles.pickerRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.pickerIconWrap, { backgroundColor: colors.iOweBg }]}>
              <ArrowUpRight size={22} color={colors.iOwe as string} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>I owe</Text>
              <Text style={[styles.pickerSubtitle, { color: colors.textTertiary }]}>
                Log money you owe someone
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary as string} />
          </Pressable>
        </Animated.View>
      )}

      <AddDebtSheet
        visible={sheetDir !== null}
        direction={sheetDir ?? 'owed_to_me'}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width:           32,
    height:          32,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    10,
  },

  // ── Floating center FAB ───────────────────────────────────────────────────
  addFab: {
    width:          58,
    height:         58,
    borderRadius:   29,
    marginTop:      -26, // raise above the tab bar edge
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.32,
    shadowRadius:   10,
    elevation:      10,
  },

  // ── Direction picker panel ────────────────────────────────────────────────
  pickerPanel: {
    position:          'absolute',
    borderRadius:       24,
    paddingVertical:    6,
    paddingHorizontal:  6,
    shadowOffset:       { width: 0, height: 12 },
    shadowOpacity:       0.18,
    shadowRadius:        24,
    elevation:           12,
  },
  pickerRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               14,
    paddingVertical:   14,
    paddingHorizontal: 12,
    borderRadius:      18,
  },
  pickerIconWrap: {
    width:          46,
    height:         46,
    borderRadius:   23,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pickerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.base,
  },
  pickerSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.xs,
    marginTop:  2,
  },
  pickerDivider: {
    height:     1,
    marginHorizontal: 12,
  },
});
