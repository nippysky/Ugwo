/**
 * Notifications — live attention feed + received-notification history.
 *
 *   1. "Needs attention" — overdue debts (derived live from the ledger)
 *   2. "Coming up"       — debts due within 7 days
 *   3. "Earlier"         — persisted notification history
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlarmClock, BellOff, CalendarClock, CheckCheck } from 'lucide-react-native';
import { useTheme } from '../theme';
import { FontFamily, FontSize } from '../theme/typography';
import { Layout, Spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth.store';
import { useLedgerStore } from '../store/ledger.store';
import { useNotifHistoryStore } from '../store/notif-history.store';
import { useCurrencyFormat } from '../hooks/useCurrencyFormat';
import { withBalance, debtStatus } from '../lib/debt-math';
import { friendlyDate } from '../lib/reminder-message';

type AlertItem = {
  id:       string;
  title:    string;
  body:     string;
  overdue:  boolean;
  personId: string;
};

export default function NotificationsScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user        = useAuthStore((s) => s.user);
  const persons     = useLedgerStore((s) => s.persons);
  const debts       = useLedgerStore((s) => s.debts);
  const repayments  = useLedgerStore((s) => s.repayments);
  const history     = useNotifHistoryStore((s) => s.items);
  const markAllRead = useNotifHistoryStore((s) => s.markAllRead);
  const { fmt }     = useCurrencyFormat();

  const { overdue, upcoming } = useMemo(() => {
    const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? 'Someone';
    const over: AlertItem[] = [];
    const up:   AlertItem[] = [];
    for (const d of debts) {
      if (d.status !== 'open') continue;
      const b = withBalance(d, repayments);
      if (b.outstanding <= 0) continue;
      const status = debtStatus(d);
      const owed = d.direction === 'owed_to_me';
      if (status === 'overdue') {
        over.push({
          id:       `over-${d.id}`,
          title:    owed
            ? `${personName(d.personId)} is overdue`
            : `You're overdue with ${personName(d.personId)}`,
          body:     `${fmt(b.outstanding)} was due ${friendlyDate(d.dueOn!)}`,
          overdue:  true,
          personId: d.personId,
        });
      } else if (status === 'due-soon') {
        up.push({
          id:       `soon-${d.id}`,
          title:    owed
            ? `${personName(d.personId)}'s repayment is coming up`
            : `Your repayment to ${personName(d.personId)} is coming up`,
          body:     `${fmt(b.outstanding)} due ${friendlyDate(d.dueOn!)}`,
          overdue:  false,
          personId: d.personId,
        });
      }
    }
    return { overdue: over, upcoming: up };
  }, [debts, repayments, persons, fmt]);

  const AlertRow = ({ alert }: { alert: AlertItem }) => (
    <Pressable
      onPress={() => router.push(`/person/${alert.personId}` as never)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: alert.overdue ? colors.statusOverdueBg : colors.warningBg },
        ]}
      >
        {alert.overdue
          ? <AlarmClock size={17} color={colors.statusOverdue as string} />
          : <CalendarClock size={17} color={colors.warning as string} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[text.bodyMedium, { color: colors.text }]}>{alert.title}</Text>
        <Text style={[text.caption, { color: colors.textSecondary }]}>{alert.body}</Text>
      </View>
    </Pressable>
  );

  const hasAnything = overdue.length > 0 || upcoming.length > 0 || history.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop:        insets.top + Spacing[3],
          paddingBottom:     insets.bottom + Spacing[8],
          paddingHorizontal: Layout.screenPadding,
          gap:               Spacing[3],
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.text as string} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Notifications</Text>
          {history.some((h) => !h.isRead) && user ? (
            <Pressable hitSlop={8} onPress={() => markAllRead(user.id)}>
              <CheckCheck size={20} color={colors.accent as string} />
            </Pressable>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>

        {!hasAnything && (
          <View style={styles.empty}>
            <BellOff size={36} color={colors.textTertiary as string} strokeWidth={1.4} />
            <Text style={[text.bodyMedium, { color: colors.text, marginTop: 10 }]}>All quiet</Text>
            <Text style={[text.bodySm, { color: colors.textTertiary, textAlign: 'center' }]}>
              Reminders about due and overdue debts will appear here.
            </Text>
          </View>
        )}

        {overdue.length > 0 && (
          <>
            <Text style={[text.label, { color: colors.textTertiary, marginTop: Spacing[2] }]}>
              NEEDS ATTENTION
            </Text>
            {overdue.map((a) => <AlertRow key={a.id} alert={a} />)}
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <Text style={[text.label, { color: colors.textTertiary, marginTop: Spacing[2] }]}>
              COMING UP
            </Text>
            {upcoming.map((a) => <AlertRow key={a.id} alert={a} />)}
          </>
        )}

        {history.length > 0 && (
          <>
            <Text style={[text.label, { color: colors.textTertiary, marginTop: Spacing[2] }]}>
              EARLIER
            </Text>
            {history.map((h) => (
              <View
                key={h.id}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor:     colors.borderLight,
                    opacity:         h.isRead ? 0.65 : 1,
                  },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.backgroundTertiary }]}>
                  <CalendarClock size={17} color={colors.textSecondary as string} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[text.bodyMedium, { color: colors.text }]}>{h.title}</Text>
                  {h.body ? (
                    <Text style={[text.caption, { color: colors.textSecondary }]}>{h.body}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing[3],
  },
  screenTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['2xl'],
    letterSpacing: -0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    padding:       13,
    borderRadius:  16,
    borderWidth:   1,
  },
  rowIcon: {
    width:          34,
    height:         34,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems:        'center',
    gap:               4,
    marginTop:         80,
    paddingHorizontal: Spacing[6],
  },
});
