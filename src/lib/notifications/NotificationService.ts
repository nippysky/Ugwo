import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseISO, addDays, startOfDay, setHours, setMinutes, setSeconds } from 'date-fns';
import type { Debt } from '../../types';
import { getNotifPrefs } from '../../store/notif-prefs.store';
import { formatAmount } from '../format';

// ─── Notification Handler ─────────────────────────────────────────────────────
// Controls how notifications appear when the app is foregrounded.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

/** Days-before-due ladder. 0 = day-of. */
const REMINDER_LADDER = [7, 3, 1, 0] as const;

/** Open-ended debts get a gentle nudge this many days after they were incurred. */
const OPEN_ENDED_NUDGE_DAYS = 30;

/** All reminders fire at 09:00 local time. */
const REMINDER_HOUR = 9;

// ─── NotificationService ──────────────────────────────────────────────────────

class NotificationService {
  private _simulatorWarnShown = false;

  // ── Permissions ─────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice && Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.warn('[NotificationService] Notifications not supported on this platform.');
      return false;
    }

    if (Platform.OS === 'android') {
      await this.setupNotificationChannels();
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  // ── Android Channels ─────────────────────────────────────────────────────

  async setupNotificationChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('debts', {
      name: 'Debt Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('recap', {
      name: 'Monthly Recap',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
      showBadge: false,
    });
  }

  // ── Debt Reminders ───────────────────────────────────────────────────────
  //
  // All scheduled ON-DEVICE. The server stores only ciphertext, so it can
  // never read a due date — reminders must (and do) work fully offline.
  //
  //   Due-dated debts: 7 / 3 / 1 days before + day-of, at 09:00.
  //   Open-ended debts: a single gentle nudge 30 days after incurredOn.

  async scheduleDebtReminders(
    debt: Debt,
    personName: string,
    currencySymbol = '₦',
  ): Promise<void> {
    // Cancel any existing reminders for this debt first (edits reschedule)
    await this.cancelDebtReminders(debt.id);

    if (debt.status !== 'open') return;
    if (!getNotifPrefs().debtReminders) return;

    const now = new Date();
    const amountFormatted = formatAmount(debt.principal, currencySymbol);
    const owedToMe = debt.direction === 'owed_to_me';

    const schedule = async (identifier: string, triggerDate: Date, title: string, body: string) => {
      if (triggerDate <= now) return; // never schedule in the past
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: true,
          badge: 1,
          data: {
            screen: 'person',
            id:     debt.personId,
            type:   'debt_reminder',
          },
          ...(Platform.OS === 'android' ? { channelId: 'debts' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    };

    if (debt.dueOn) {
      const dueDate = parseISO(debt.dueOn);
      for (const days of REMINDER_LADDER) {
        const triggerDate = setSeconds(setMinutes(setHours(
          days === 0 ? dueDate : addDays(dueDate, -days),
          REMINDER_HOUR), 0), 0);

        const when = days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
        const title = owedToMe
          ? `${personName}'s repayment is ${when}`
          : `Your repayment to ${personName} is ${when}`;
        const body = owedToMe
          ? `${amountFormatted} owed to you. A gentle reminder keeps the peace.`
          : `${amountFormatted} owed to ${personName}. Settle it and breathe easy.`;

        await schedule(`debt_${debt.id}_${days}d`, triggerDate, title, body);
      }
    } else {
      // Open-ended: one nudge 30 days after the loan was made
      const nudgeDate = setSeconds(setMinutes(setHours(
        addDays(startOfDay(parseISO(debt.incurredOn)), OPEN_ENDED_NUDGE_DAYS),
        REMINDER_HOUR), 0), 0);

      const title = owedToMe
        ? `Still open: ${personName} owes you ${amountFormatted}`
        : `Still open: you owe ${personName} ${amountFormatted}`;
      const body = owedToMe
        ? 'It has been a month. Maybe time for a friendly nudge?'
        : 'It has been a month. A part-payment keeps trust strong.';

      await schedule(`debt_${debt.id}_nudge`, nudgeDate, title, body);
    }
  }

  async cancelDebtReminders(debtId: string): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const cancelIds = scheduled
      .filter((n) => n.identifier.startsWith(`debt_${debtId}_`))
      .map((n) => n.identifier);
    await Promise.all(
      cancelIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
    );
  }

  // ── Settlement celebration ───────────────────────────────────────────────
  // Fires immediately when a debt is fully settled — the one moment of
  // celebration Ụgwọ allows itself.

  async sendSettlementCelebration(
    personName: string,
    amount: number,
    owedToMe: boolean,
    currencySymbol = '₦',
  ): Promise<void> {
    const amountFormatted = formatAmount(amount, currencySymbol);
    await Notifications.scheduleNotificationAsync({
      identifier: `settled_${Date.now()}`,
      content: {
        title: 'Settled ✅',
        body: owedToMe
          ? `${personName} has fully repaid ${amountFormatted}. Owed. Remembered. Settled.`
          : `You've fully repaid ${personName} ${amountFormatted}. Well done.`,
        sound: true,
        badge: 1,
        data: { screen: 'history', type: 'debt_settled' },
        ...(Platform.OS === 'android' ? { channelId: 'debts' } : {}),
      },
      trigger: null, // fire immediately
    });
  }

  // ── Monthly recap ────────────────────────────────────────────────────────
  // Scheduled for 09:00 on the 1st of next month; rescheduled on every app
  // open so it always points at the upcoming month boundary.

  async scheduleMonthlyRecap(): Promise<void> {
    await this.cancelMonthlyRecap();
    if (!getNotifPrefs().monthlyRecap) return;

    const now = new Date();
    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, REMINDER_HOUR, 0, 0);

    await Notifications.scheduleNotificationAsync({
      identifier: 'ugwo_monthly_recap',
      content: {
        title: 'Your monthly recap is ready',
        body:  'See what you recovered — and what is still out there.',
        sound: true,
        data: { screen: 'history', type: 'monthly_recap' },
        ...(Platform.OS === 'android' ? { channelId: 'recap' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: firstOfNext,
      },
    });
  }

  async cancelMonthlyRecap(): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync('ugwo_monthly_recap');
    } catch { /* may not exist yet */ }
  }

  // ── Expo Push Token ──────────────────────────────────────────────────────
  // The push layer exists for future silent-sync wakes and product updates.
  // Debt reminders themselves never depend on it.

  async getExpoPushToken(): Promise<string | null> {
    if (!Device.isDevice) {
      if (!this._simulatorWarnShown) {
        console.warn('[NotificationService] Push tokens require a physical device.');
        this._simulatorWarnShown = true;
      }
      return null;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[NotificationService] EAS projectId not found in app config.');
      return null;
    }

    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      return result.data;
    } catch (err) {
      console.error('[NotificationService] Failed to get push token:', err);
      return null;
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const notificationService = new NotificationService();
