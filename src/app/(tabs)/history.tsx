/**
 * History — settled debts + monthly recovery recaps.
 * "You recovered ₦120,000 in July."
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Archive, BadgeCheck } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { DirectionBadge } from '../../components/ui/DirectionBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { monthlyRecovered } from '../../lib/debt-math';
import { friendlyDate } from '../../lib/reminder-message';
import type { Debt } from '../../types';

// ─── Month helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10));
  const thisYear = new Date().getFullYear();
  const name = MONTH_NAMES[(m ?? 1) - 1];
  return y === thisYear ? name : `${name} ${y}`;
}

type Section = {
  title:     string;
  recovered: number;
  data:      Debt[];
};

export default function HistoryScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user       = useAuthStore((s) => s.user);
  const persons    = useLedgerStore((s) => s.persons);
  const debts      = useLedgerStore((s) => s.debts);
  const repayments = useLedgerStore((s) => s.repayments);
  const load       = useLedgerStore((s) => s.load);
  const { fmt }    = useCurrencyFormat();

  useFocusEffect(
    useCallback(() => {
      if (user) load(user.id);
    }, [user?.id]),
  );

  const personName = useCallback(
    (id: string) => persons.find((p) => p.id === id)?.name ?? 'Unknown',
    [persons],
  );

  // History isn't a normal stacked route (it lives inside the tab group with
  // no back-stack entry of its own), so router.back() can't be trusted —
  // fall back to explicitly returning to Home when there's nothing to pop.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  }, [router]);

  // Group settled debts by settlement month, newest first
  const sections = useMemo<Section[]>(() => {
    const settled = debts
      .filter((d) => d.status === 'settled' && d.settledAt)
      .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''));

    const byMonth = new Map<string, Debt[]>();
    for (const d of settled) {
      const ym = (d.settledAt as string).slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push(d);
    }

    return Array.from(byMonth.entries()).map(([ym, list]) => ({
      title:     monthTitle(ym),
      recovered: monthlyRecovered(ym, debts, repayments),
      data:      list,
    }));
  }, [debts, repayments]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingTop:        insets.top + Spacing[4],
          paddingBottom:     120,
          paddingHorizontal: Layout.screenPadding,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing[4] }}>
            <Pressable
              hitSlop={12}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backBtn}
            >
              <ArrowLeft size={22} color={colors.textSecondary as string} strokeWidth={2} />
            </Pressable>
            <Text style={[text.bodySm, { color: colors.textTertiary }]}>Settled &amp; recovered</Text>
            <Text style={[styles.screenTitle, { color: colors.text }]}>History</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHead, { borderColor: colors.borderLight }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            {section.recovered > 0 && (
              <Text style={[text.bodySm, { color: colors.owedToMe }]}>
                You recovered {fmt(section.recovered)}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          const owed = item.direction === 'owed_to_me';
          return (
            <View
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
            >
              <DirectionBadge owedToMe={owed} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
                  {personName(item.personId)}
                </Text>
                <Text style={[text.caption, { color: colors.textTertiary }]}>
                  {owed ? 'Repaid you in full' : 'You repaid in full'}
                  {item.settledAt ? ` · ${friendlyDate(item.settledAt.slice(0, 10))}` : ''}
                </Text>
              </View>
              <View style={styles.amountArea}>
                <BadgeCheck size={15} color={colors.success as string} />
                <Text style={[styles.amount, { color: colors.textSecondary }]}>
                  {fmt(item.principal)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={Archive}
            title="Nothing settled yet"
            message="When a debt is fully repaid it moves here — along with your monthly recovery recaps."
            action={{ label: 'Back to the ledger', onPress: () => router.push('/(tabs)' as never) }}
            style={{ marginTop: Spacing[8] }}
          />
        }
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    marginLeft:     -8,
    marginBottom:   4,
  },
  screenTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    letterSpacing: -0.8,
    marginTop:     2,
  },
  sectionHead: {
    marginTop:      Spacing[4],
    marginBottom:   Spacing[3],
    paddingBottom:  Spacing[2],
    borderBottomWidth: 1,
    gap:            2,
  },
  sectionTitle: {
    fontFamily:    FontFamily.displayRegular,
    fontSize:      FontSize.lg,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    padding:       13,
    borderRadius:  16,
    borderWidth:   1,
    marginBottom:  Spacing[3],
  },
  amountArea: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  amount: {
    fontFamily:  FontFamily.sansSemiBold,
    fontSize:    FontSize.sm,
    fontVariant: ['tabular-nums'],
  },
});
