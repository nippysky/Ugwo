/**
 * Notification settings — Ụgwọ's two local-notification streams.
 * Everything is scheduled on-device; the server can never read due dates.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlarmClock, CalendarHeart, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../theme';
import { FontFamily, FontSize } from '../theme/typography';
import { Layout, Spacing } from '../theme/spacing';
import { useNotifPrefsStore } from '../store/notif-prefs.store';
import { useAuthStore } from '../store/auth.store';
import { useLedgerStore } from '../store/ledger.store';
import { useUIStore } from '../store/ui.store';
import { notificationService } from '../lib/notifications';

export default function NotificationSettingsScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const debtReminders = useNotifPrefsStore((s) => s.debtReminders);
  const monthlyRecap  = useNotifPrefsStore((s) => s.monthlyRecap);
  const setPref       = useNotifPrefsStore((s) => s.set);

  const user    = useAuthStore((s) => s.user);
  const ledger  = useLedgerStore.getState();
  const symbol  = useUIStore((s) => s.currency.symbol);

  // ── Toggle handlers: flip pref, then (re)schedule accordingly ───────────

  const toggleDebtReminders = async (value: boolean) => {
    setPref('debtReminders', value);
    if (!value) {
      // Cancel every scheduled debt reminder
      for (const debt of ledger.debts) {
        await notificationService.cancelDebtReminders(debt.id).catch(() => {});
      }
    } else if (user) {
      // Reschedule reminders for all open debts
      const { persons, debts } = useLedgerStore.getState();
      for (const debt of debts) {
        if (debt.status !== 'open') continue;
        const name = persons.find((p) => p.id === debt.personId)?.name ?? 'Someone';
        await notificationService.scheduleDebtReminders(debt, name, symbol).catch(() => {});
      }
    }
  };

  const toggleMonthlyRecap = async (value: boolean) => {
    setPref('monthlyRecap', value);
    if (value) {
      await notificationService.scheduleMonthlyRecap().catch(() => {});
    } else {
      await notificationService.cancelMonthlyRecap().catch(() => {});
    }
  };

  const renderRowSwitch = ({
    icon: Icon,
    title,
    subtitle,
    value,
    onChange,
  }: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.backgroundTertiary }]}>
        <Icon size={18} color={colors.textSecondary as string} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[text.bodyMedium, { color: colors.text }]}>{title}</Text>
        <Text style={[text.caption, { color: colors.textSecondary, lineHeight: 16 }]}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary as string, false: colors.border as string }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

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
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.text as string} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Notifications</Text>
          <View style={{ width: 22 }} />
        </View>

        {renderRowSwitch({
          icon: AlarmClock,
          title: 'Debt reminders',
          subtitle: '7, 3 and 1 day before a due date, plus the day itself — and a gentle 30-day nudge for open-ended debts.',
          value: debtReminders,
          onChange: toggleDebtReminders,
        })}

        {renderRowSwitch({
          icon: CalendarHeart,
          title: 'Monthly recap',
          subtitle: "On the 1st of each month: what you recovered, and what's still out there.",
          value: monthlyRecap,
          onChange: toggleMonthlyRecap,
        })}

        {/* Privacy note */}
        <View style={[styles.note, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}>
          <ShieldCheck size={16} color={colors.success as string} />
          <Text style={[text.caption, { color: colors.textSecondary, flex: 1, lineHeight: 17 }]}>
            All reminders are scheduled privately on this device. Our servers only
            ever hold encrypted data — they can't read amounts, names or due dates.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

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
    padding:       14,
    borderRadius:  16,
    borderWidth:   1,
  },
  rowIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    gap:           10,
    padding:       14,
    borderRadius:  14,
    borderWidth:   1,
    marginTop:     Spacing[2],
    alignItems:    'flex-start',
  },
});
