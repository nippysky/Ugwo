/**
 * Home — the ledger at a glance.
 *
 *   · Hero: net position (+₦155,000) with Owed-to-me / I-owe sub-figures
 *   · People-first list: avatar, name, net balance, status chip
 *   · FAB → "Owed to me" / "I owe" → AddDebtSheet (<10s logging)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { Plus, HandCoins, ArrowDownLeft, ArrowUpRight, Users } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { InitialsAvatar } from '../../components/ui/InitialsAvatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddDebtSheet } from '../../components/ledger/AddDebtSheet';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useSyncStore } from '../../store/sync.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { allPersonBalances, netPosition } from '../../lib/debt-math';
import { friendlyDate } from '../../lib/reminder-message';
import type { DebtDirection, DueStatus, PersonBalance } from '../../types';

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
  const { colors, text, isDark } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const user        = useAuthStore((s) => s.user);
  const persons     = useLedgerStore((s) => s.persons);
  const debts       = useLedgerStore((s) => s.debts);
  const repayments  = useLedgerStore((s) => s.repayments);
  const load        = useLedgerStore((s) => s.load);
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const { fmt }     = useCurrencyFormat();

  const [fabOpen, setFabOpen]     = useState(false);
  const [sheetDir, setSheetDir]   = useState<DebtDirection | null>(null);

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
  const netSign   = totals.net >= 0 ? '+' : '−';
  const netColor  = totals.net >= 0 ? Palette.amber : '#F0A196';

  const openSheet = (dir: DebtDirection) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFabOpen(false);
    setSheetDir(dir);
  };

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
          <InitialsAvatar name={item.person.name} size={44} />
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
            <View>
              <Text style={[text.bodySm, { color: colors.textTertiary }]}>
                {firstName ? `Ndeewo, ${firstName}` : 'Ndeewo'}
              </Text>
              <Text style={[styles.screenTitle, { color: colors.text }]}>Your ledger</Text>
            </View>

            {/* Hero card */}
            <Animated.View entering={FadeIn.duration(400)}>
              <View style={[styles.hero, { backgroundColor: Palette.indigo }]}>
                <Text style={styles.heroLabel}>NET POSITION</Text>
                <Text style={[styles.heroNet, { color: netColor }]}>
                  {netSign}{fmt(Math.abs(totals.net))}
                </Text>
                <View style={[styles.heroRule, { backgroundColor: 'rgba(232,163,61,0.35)' }]} />
                <View style={styles.heroSubRow}>
                  <View style={styles.heroSub}>
                    <View style={styles.heroSubHead}>
                      <ArrowDownLeft size={14} color={Palette.amber} />
                      <Text style={styles.heroSubLabel}>Owed to me</Text>
                    </View>
                    <Text style={[styles.heroSubValue, { color: Palette.amber }]}>
                      {fmt(totals.owedToMe)}
                    </Text>
                  </View>
                  <View style={[styles.heroDivider, { backgroundColor: 'rgba(250,249,247,0.12)' }]} />
                  <View style={styles.heroSub}>
                    <View style={styles.heroSubHead}>
                      <ArrowUpRight size={14} color="#F0A196" />
                      <Text style={styles.heroSubLabel}>I owe</Text>
                    </View>
                    <Text style={[styles.heroSubValue, { color: '#F0A196' }]}>
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

      {/* FAB + direction sheet */}
      {fabOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={() => setFabOpen(false)}
        />
      )}
      <View style={[styles.fabArea, { bottom: Layout.tabBarHeight + insets.bottom + Spacing[5] }]}>
        {fabOpen && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.fabMenu}>
            <Pressable
              onPress={() => openSheet('owed_to_me')}
              style={[styles.fabOption, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <ArrowDownLeft size={18} color={colors.owedToMe as string} />
              <Text style={[text.bodyMedium, { color: colors.text }]}>Owed to me</Text>
            </Pressable>
            <Pressable
              onPress={() => openSheet('i_owe')}
              style={[styles.fabOption, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <ArrowUpRight size={18} color={colors.iOwe as string} />
              <Text style={[text.bodyMedium, { color: colors.text }]}>I owe</Text>
            </Pressable>
          </Animated.View>
        )}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setFabOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel="Log a debt"
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              shadowColor:     colors.primary,
              transform:       [{ rotate: fabOpen ? '45deg' : '0deg' }, { scale: pressed ? 0.95 : 1 }],
              borderColor:     isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)',
            },
          ]}
        >
          <Plus size={28} color={Palette.paper} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Add-debt sheet */}
      <AddDebtSheet
        visible={sheetDir !== null}
        direction={sheetDir ?? 'owed_to_me'}
        onClose={() => setSheetDir(null)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontSize:      40,
    letterSpacing: -1,
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

  // FAB
  fabArea: {
    position:   'absolute',
    right:      Layout.screenPadding,
    alignItems: 'flex-end',
    gap:        12,
  },
  fabMenu: { gap: 10, alignItems: 'flex-end' },
  fabOption: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingVertical:   12,
    paddingHorizontal: 18,
    borderRadius:      100,
    borderWidth:       1,
  },
  fab: {
    width:          60,
    height:         60,
    borderRadius:   30,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.35,
    shadowRadius:   10,
    elevation:      10,
  },
});
