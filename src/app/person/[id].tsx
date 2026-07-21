/**
 * Person ledger — running balance + vertical timeline of loans & repayments.
 *
 * Actions: Record repayment · Send reminder (face-saving share message) ·
 * Add another debt · edit/delete via long-press.
 */
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  HandCoins,
  MessageCircleHeart,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { InitialsAvatar } from '../../components/ui/InitialsAvatar';
import { Button } from '../../components/ui/Button';
import { AddDebtSheet } from '../../components/ledger/AddDebtSheet';
import { RecordRepaymentSheet } from '../../components/ledger/RecordRepaymentSheet';
import { SettleCelebration } from '../../components/ledger/SettleCelebration';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { personBalance, withBalance, debtStatus } from '../../lib/debt-math';
import {
  composeReminder,
  composeIOweMessage,
  friendlyDate,
  shareReminder,
} from '../../lib/reminder-message';
import type { Debt, DebtWithBalance, DebtDirection, Repayment } from '../../types';

// ─── Timeline entry model ─────────────────────────────────────────────────────

type TimelineEntry =
  | { kind: 'debt'; date: string; debt: DebtWithBalance }
  | { kind: 'repayment'; date: string; repayment: Repayment; debt: Debt };

export default function PersonLedgerScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const user       = useAuthStore((s) => s.user);
  const persons    = useLedgerStore((s) => s.persons);
  const debts      = useLedgerStore((s) => s.debts);
  const repayments = useLedgerStore((s) => s.repayments);
  const deleteDebt = useLedgerStore((s) => s.deleteDebt);
  const deletePerson = useLedgerStore((s) => s.deletePerson);
  const showToast  = useUIStore((s) => s.showToast);
  const { fmt, symbol } = useCurrencyFormat();

  const [repayFor, setRepayFor]   = useState<DebtWithBalance | null>(null);
  const [addDir, setAddDir]       = useState<DebtDirection | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const person = persons.find((p) => p.id === id);

  const balance = useMemo(
    () => (person ? personBalance(person, debts, repayments) : null),
    [person, debts, repayments],
  );

  const personDebts = useMemo(
    () =>
      debts
        .filter((d) => d.personId === id)
        .map((d) => withBalance(d, repayments)),
    [debts, repayments, id],
  );

  const openDebts = personDebts.filter((d) => d.status === 'open' && d.outstanding > 0);

  // Timeline: newest first — debts by incurredOn, repayments by paidOn
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    for (const d of personDebts) {
      entries.push({ kind: 'debt', date: `${d.incurredOn}~${d.createdAt}`, debt: d });
      for (const r of repayments.filter((r) => r.debtId === d.id)) {
        entries.push({ kind: 'repayment', date: `${r.paidOn}~${r.createdAt}`, repayment: r, debt: d });
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [personDebts, repayments]);

  if (!person || !balance) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[text.body, { color: colors.textSecondary }]}>Person not found.</Text>
      </View>
    );
  }

  const positive = balance.net >= 0;

  // ── Send reminder ───────────────────────────────────────────────────────
  const handleReminder = async () => {
    // Remind about the largest outstanding debt (owed to me first)
    const target =
      openDebts.filter((d) => d.direction === 'owed_to_me').sort((a, b) => b.outstanding - a.outstanding)[0] ??
      openDebts.sort((a, b) => b.outstanding - a.outstanding)[0];

    if (!target) {
      showToast('info', 'Nothing outstanding to remind about.');
      return;
    }

    const message = target.direction === 'owed_to_me'
      ? composeReminder(person.name, target, symbol)
      : composeIOweMessage(person.name, target, symbol);

    await shareReminder(message);
  };

  // ── Delete flows ────────────────────────────────────────────────────────
  const confirmDeleteDebt = (debt: DebtWithBalance) => {
    Alert.alert(
      'Delete this debt?',
      'The debt and its repayments will be removed from your ledger everywhere.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDebt(debt.id).catch(() => showToast('error', 'Could not delete.')),
        },
      ],
    );
  };

  const confirmDeletePerson = () => {
    Alert.alert(
      `Remove ${person.name}?`,
      'Their entire ledger — debts and repayments — will be deleted everywhere. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deletePerson(person.id).catch(() => showToast('error', 'Could not remove.'));
            router.back();
          },
        },
      ],
    );
  };

  // ── Timeline row ────────────────────────────────────────────────────────
  const renderEntry = (entry: TimelineEntry, index: number) => {
    if (entry.kind === 'debt') {
      const d = entry.debt;
      const owed = d.direction === 'owed_to_me';
      const status = debtStatus(d);
      const settled = d.status === 'settled';
      return (
        <Animated.View
          key={`d_${d.id}`}
          entering={FadeInDown.delay(Math.min(index * 30, 200)).duration(250)}
        >
          <Pressable
            onLongPress={() => confirmDeleteDebt(d)}
            onPress={() => {
              if (!settled && d.outstanding > 0) setRepayFor(d);
            }}
            style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
          >
            <View
              style={[
                styles.entryIcon,
                { backgroundColor: settled ? colors.successBg : owed ? colors.owedToMeBg : colors.iOweBg },
              ]}
            >
              {settled
                ? <BadgeCheck size={18} color={colors.success as string} />
                : owed
                  ? <ArrowDownLeft size={18} color={colors.owedToMe as string} />
                  : <ArrowUpRight size={18} color={colors.iOwe as string} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[text.bodyMedium, { color: colors.text }]}>
                {settled
                  ? 'Settled'
                  : owed ? 'Loan — owed to you' : 'Loan — you owe'}
                {d.note ? ` · ${d.note}` : ''}
              </Text>
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                {friendlyDate(d.incurredOn)}
                {d.dueOn && !settled ? ` · due ${friendlyDate(d.dueOn)}` : ''}
                {!settled && status === 'overdue' ? ' · overdue' : ''}
                {!settled && d.repaid > 0 ? ` · ${fmt(d.repaid)} repaid` : ''}
              </Text>
            </View>
            <Text
              style={[
                styles.entryAmount,
                {
                  color: settled
                    ? colors.textTertiary
                    : owed ? colors.owedToMe : colors.iOwe,
                  textDecorationLine: settled ? 'line-through' : 'none',
                },
              ]}
            >
              {fmt(settled ? d.principal : d.outstanding)}
            </Text>
          </Pressable>
        </Animated.View>
      );
    }

    const { repayment, debt } = entry;
    return (
      <Animated.View
        key={`r_${repayment.id}`}
        entering={FadeInDown.delay(Math.min(index * 30, 200)).duration(250)}
      >
        <View style={[styles.entry, styles.repaymentEntry, { borderColor: colors.borderLight }]}>
          <View style={[styles.entryIcon, { backgroundColor: colors.successBg }]}>
            <HandCoins size={18} color={colors.success as string} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[text.bodyMedium, { color: colors.text }]}>
              Repayment{repayment.note ? ` · ${repayment.note}` : ''}
            </Text>
            <Text style={[text.caption, { color: colors.textTertiary }]}>
              {friendlyDate(repayment.paidOn)}
              {debt.direction === 'owed_to_me' ? ' · received' : ' · paid'}
            </Text>
          </View>
          <Text style={[styles.entryAmount, { color: colors.success }]}>
            {fmt(repayment.amount)}
          </Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + Spacing[8],
        }}
      >
        {/* Header card */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: Palette.indigo, paddingTop: insets.top + Spacing[3] },
          ]}
        >
          <View style={styles.navRow}>
            <Pressable hitSlop={12} onPress={() => router.back()} style={styles.navBtn}>
              <ArrowLeft size={22} color={Palette.paper} />
            </Pressable>
            <Pressable hitSlop={12} onPress={confirmDeletePerson} style={styles.navBtn}>
              <Trash2 size={18} color="rgba(250,249,247,0.55)" />
            </Pressable>
          </View>

          <View style={styles.headerBody}>
            <InitialsAvatar name={person.name} size={56} />
            <Text style={styles.personName}>{person.name}</Text>
            {person.note ? (
              <Text style={styles.personNote}>{person.note}</Text>
            ) : null}
            <Text style={styles.balanceLabel}>
              {positive ? 'OWES YOU' : 'YOU OWE'}
            </Text>
            <Text
              style={[
                styles.balanceValue,
                { color: positive ? Palette.amber : '#F0A196' },
              ]}
            >
              {fmt(Math.abs(balance.net))}
            </Text>
            {balance.owedToMe > 0 && balance.iOwe > 0 && (
              <Text style={styles.balanceBreakdown}>
                {fmt(balance.owedToMe)} owed to you · {fmt(balance.iOwe)} you owe
              </Text>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Palette.amber }]}
              onPress={() => {
                const target = openDebts.sort((a, b) => b.outstanding - a.outstanding)[0];
                if (!target) {
                  showToast('info', 'No open debt to repay.');
                  return;
                }
                setRepayFor(target);
              }}
            >
              <HandCoins size={17} color={Palette.indigo} />
              <Text style={[styles.actionText, { color: Palette.indigo }]}>Record repayment</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionGhost]}
              onPress={handleReminder}
            >
              <MessageCircleHeart size={17} color={Palette.paper} />
              <Text style={[styles.actionText, { color: Palette.paper }]}>Send reminder</Text>
            </Pressable>
          </View>
        </View>

        {/* Timeline */}
        <View style={{ paddingHorizontal: Layout.screenPadding, marginTop: Spacing[5], gap: Spacing[3] }}>
          <View style={styles.timelineHead}>
            <Text style={[text.label, { color: colors.textTertiary }]}>TIMELINE</Text>
            <Pressable
              hitSlop={8}
              onPress={() => setAddDir('owed_to_me')}
              style={[styles.addSmall, { borderColor: colors.border }]}
            >
              <Plus size={14} color={colors.textSecondary as string} />
              <Text style={[text.caption, { color: colors.textSecondary }]}>New debt</Text>
            </Pressable>
          </View>

          {timeline.length === 0 ? (
            <Text style={[text.bodySm, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing[6] }]}>
              No entries yet — log a debt to start this ledger.
            </Text>
          ) : (
            timeline.map(renderEntry)
          )}
        </View>
      </ScrollView>

      {/* Sheets */}
      <RecordRepaymentSheet
        visible={repayFor !== null}
        debt={repayFor}
        onClose={() => setRepayFor(null)}
        onSettled={() => setCelebrating(true)}
      />
      <AddDebtSheet
        visible={addDir !== null}
        direction={addDir ?? 'owed_to_me'}
        personId={person.id}
        onClose={() => setAddDir(null)}
      />
      <SettleCelebration
        visible={celebrating}
        personName={person.name}
        onDone={() => setCelebrating(false)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerCard: {
    borderBottomLeftRadius:  28,
    borderBottomRightRadius: 28,
    paddingHorizontal:       Layout.screenPadding,
    paddingBottom:           Spacing[5],
  },
  navRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  navBtn: { padding: 4 },
  headerBody: {
    alignItems: 'center',
    gap:        4,
    marginTop:  Spacing[2],
  },
  personName: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['2xl'],
    color:         Palette.paper,
    letterSpacing: -0.5,
    marginTop:     6,
  },
  personNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    color:      'rgba(250,249,247,0.55)',
  },
  balanceLabel: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      10,
    color:         'rgba(250,249,247,0.5)',
    letterSpacing: 2.5,
    marginTop:     10,
  },
  balanceValue: {
    fontFamily:  FontFamily.displayLight,
    fontSize:    36,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  balanceBreakdown: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.xs,
    color:      'rgba(250,249,247,0.5)',
    marginTop:  2,
  },
  actionRow: {
    flexDirection: 'row',
    gap:           10,
    marginTop:     Spacing[5],
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             7,
    paddingVertical: 13,
    borderRadius:    100,
  },
  actionGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth:     1,
    borderColor:     'rgba(250,249,247,0.25)',
  },
  actionText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.sm,
  },

  timelineHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  addSmall: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderWidth:       1,
    borderRadius:      100,
    paddingVertical:   4,
    paddingHorizontal: 10,
  },
  entry: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    padding:       14,
    borderRadius:  16,
    borderWidth:   1,
  },
  repaymentEntry: {
    backgroundColor: 'transparent',
  },
  entryIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  entryAmount: {
    fontFamily:  FontFamily.sansSemiBold,
    fontSize:    FontSize.sm,
    fontVariant: ['tabular-nums'],
  },
});
