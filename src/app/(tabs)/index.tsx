/**
 * Home — the ledger at a glance.
 *
 *   · Hero: net position (+₦155,000) with Owed-to-me / I-owe sub-figures
 *   · People-first list: direction badge, name, net balance, status chip
 *   · History icon (top-right) → History tab
 *   · Logging a debt happens from the center FAB in the tab bar (see
 *     (tabs)/_layout.tsx), which opens the "Owed to me / I owe" picker
 *     and then AddDebtSheet from anywhere in the app.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { History, ArrowDownLeft, ArrowUpRight, Users } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { DirectionBadge } from '../../components/ui/DirectionBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useSyncStore } from '../../store/sync.store';
import { useAddDebtStore } from '../../store/add-debt.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { allPersonBalances, netPosition } from '../../lib/debt-math';
import { friendlyDate } from '../../lib/reminder-message';
import type { DueStatus, PersonBalance } from '../../types';

// ─── Time-of-day greeting (device-local time zone) ────────────────────────────

function greetingForHour(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Status chip config ───────────────────────────────────────────────────────

const STATUS_META: Record<DueStatus, { label: string; colorKey: 'statusOverdue' | 'statusUpcoming' | 'textTertiary' | 'statusPaid' }> = {
  'overdue':    { label: 'Overdue',      colorKey: 'statusOverdue' },
  'due-soon':   { label: 'Due soon',     colorKey: 'statusUpcoming' },
  'upcoming':   { label: 'Upcoming',     colorKey: 'textTertiary' },
  'open-ended': { label: 'No due date',  colorKey: 'textTertiary' },
  'settled':    { label: 'Settled',      colorKey: 'statusPaid' },
};

// ─── Screen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors, text } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const user        = useAuthStore((s) => s.user);
  const persons     = useLedgerStore((s) => s.persons);
  const debts       = useLedgerStore((s) => s.debts);
  const repayments  = useLedgerStore((s) => s.repayments);
  const load        = useLedgerStore((s) => s.load);
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const openSheet   = useAddDebtStore((s) => s.openSheet);
  const { fmt }     = useCurrencyFormat();

  // Load on focus + whenever a sync pull lands
  useFocusEffect(
    useCallback(() => {
      if (user) load(user.id);
    }, [user?.id]),
  );
  useEffect(() => {
    if (user) load(user.id);
  }, [syncVersion]);

  const totals = useMemo(() => netPosition(debts, repayments), [debts, repayments]);
  const balances = useMemo(
    () => allPersonBalances(persons, debts, repayments).filter((b) => b.openDebtCount > 0),
    [persons, debts, repayments],
  );

  const firstName = user?.name?.split(/\s+/)[0] ?? '';
  const greeting  = greetingForHour();
  const netSign   = totals.net >= 0 ? '+' : '−';
  const netColor  = totals.net >= 0 ? Palette.amber : '#F0A196';

  // ── Person row ──────────────────────────────────────────────────────────
  const renderRow = ({ item, index }: { item: PersonBalance; index: number }) => {
    const meta = STATUS_META[item.status];
    const chipColor = colors[meta.colorKey] as string;
    const positive = item.net >= 0;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 240)).duration(300)}>
        <Pressable
          onPress={() => router.push(`/person/${item.person.id}` as never)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.card,
              borderColor:     colors.borderLight,
              opacity:         pressed ? 0.85 : 1,
            },
          ]}
        >
          <DirectionBadge owedToMe={positive} size={44} />
          <View style={styles.rowBody}>
            <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
              {item.person.name}
            </Text>
            <View style={styles.chipRow}>
              <View style={[styles.chipDot, { backgroundColor: chipColor }]} />
              <Text style={[text.caption, { color: chipColor }]}>
                {meta.label}
                {item.nextDueOn && item.status !== 'overdue'
                  ? ` · ${friendlyDate(item.nextDueOn)}`
                  : ''}
              </Text>
            </View>
          </View>
          <View style={styles.rowAmount}>
            <Text
              style={[
                styles.rowNet,
                { color: positive ? colors.owedToMe : colors.iOwe },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {positive ? '+' : '−'}{fmt(Math.abs(item.net))}
            </Text>
            <Text style={[text.caption, { color: colors.textTertiary }]}>
              {positive ? 'owes you' : 'you owe'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={balances}
        keyExtractor={(b) => b.person.id}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop:        insets.top + Spacing[4],
          paddingBottom:     140,
          paddingHorizontal: Layout.screenPadding,
          gap:               Spacing[3],
        }}
        ListHeaderComponent={
          <View style={{ gap: Spacing[4], marginBottom: Spacing[2] }}>
            {/* Greeting */}
            <View style={styles.greetingRow}>
              <View>
                <Text style={[text.bodySm, { color: colors.textTertiary }]}>
                  {firstName ? `${greeting}, ${firstName}` : greeting}
                </Text>
                <Text style={[styles.screenTitle, { color: colors.text }]}>Your ledger</Text>
              </View>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="History"
                onPress={() => router.push('/(tabs)/history' as never)}
                style={({ pressed }) => [
                  styles.historyBtn,
                  { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <History size={19} color={colors.textSecondary as string} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Hero card */}
            <Animated.View entering={FadeIn.duration(400)}>
              <View style={[styles.hero, { backgroundColor: Palette.indigo }]}>
                <Text style={styles.heroLabel}>NET POSITION</Text>
                <Text
                  style={[styles.heroNet, { color: netColor }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {netSign}{fmt(Math.abs(totals.net))}
                </Text>
                <View style={[styles.heroRule, { backgroundColor: 'rgba(232,163,61,0.35)' }]} />
                <View style={styles.heroSubRow}>
                  <View style={styles.heroSub}>
                    <View style={styles.heroSubHead}>
                      <ArrowDownLeft size={14} color={Palette.amber} />
                      <Text style={styles.heroSubLabel}>Owed to me</Text>
                    </View>
                    <Text
                      style={[styles.heroSubValue, { color: Palette.amber }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {fmt(totals.owedToMe)}
                    </Text>
                  </View>
                  <View style={[styles.heroDivider, { backgroundColor: 'rgba(250,249,247,0.12)' }]} />
                  <View style={styles.heroSub}>
                    <View style={styles.heroSubHead}>
                      <ArrowUpRight size={14} color="#F0A196" />
                      <Text style={styles.heroSubLabel}>I owe</Text>
                    </View>
                    <Text
                      style={[styles.heroSubValue, { color: '#F0A196' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {fmt(totals.iOwe)}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {balances.length > 0 && (
              <Text style={[text.label, { color: colors.textTertiary }]}>PEOPLE</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Users}
            title="Who owes you?"
            message="Log your first debt in under ten seconds. Amounts stay encrypted on your phone — nobody else can see them."
            action={{ label: 'Owed to me', onPress: () => openSheet('owed_to_me') }}
            style={{ marginTop: Spacing[6] }}
          />
        }
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  greetingRow: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    justifyContent: 'space-between',
  },
  historyBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   4,
  },
  screenTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    letterSpacing: -0.8,
    marginTop:     2,
  },

  // Hero
  hero: {
    borderRadius: 24,
    padding:      24,
  },
  heroLabel: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      10,
    color:         'rgba(250,249,247,0.55)',
    letterSpacing: 2.5,
  },
  heroNet: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      30,
    letterSpacing: -0.6,
    marginTop:     6,
    fontVariant:   ['tabular-nums'],
  },
  heroRule: {
    height:       1,
    marginVertical: 18,
  },
  heroSubRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  heroSub: { flex: 1, gap: 4 },
  heroSubHead: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  heroSubLabel: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      11,
    color:         'rgba(250,249,247,0.6)',
    letterSpacing: 0.4,
  },
  heroSubValue: {
    fontFamily:  FontFamily.sansSemiBold,
    fontSize:    FontSize.lg,
    fontVariant: ['tabular-nums'],
  },
  heroDivider: {
    width:            1,
    height:           36,
    marginHorizontal: 16,
  },

  // Person row
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    padding:       14,
    borderRadius:  18,
    borderWidth:   1,
  },
  rowBody: { flex: 1, gap: 3 },
  chipRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  chipDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  rowAmount: { alignItems: 'flex-end', gap: 2 },
  rowNet: {
    fontFamily:  FontFamily.sansSemiBold,
    fontSize:    FontSize.base,
    fontVariant: ['tabular-nums'],
  },
});
