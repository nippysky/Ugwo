import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { parseISO, addDays, startOfDay, setHours, setMinutes, setSeconds } from 'date-fns';
import type { Debt } from '../../types';
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

// ─── Log nudges ─────────────────────────────────────────────────────────────
// Unlike debt reminders (tied to a specific debt's due date), these are
// unprompted "did anything happen lately?" check-ins — the app reaching out
// on its own so a favor between friends never quietly turns into a forgotten
// debt. Kept deliberately irregular (randomised interval + hour + copy) so
// they read as a genuine nudge rather than a robotic daily alarm.

const LOG_NUDGE_QUEUE_SIZE = 6;   // always keep this many upcoming nudges scheduled
const LOG_NUDGE_MIN_DAYS   = 4;   // shortest gap between nudges
const LOG_NUDGE_MAX_DAYS   = 8;   // longest gap between nudges
const LOG_NUDGE_HOUR_MIN   = 10;  // never before 10am
const LOG_NUDGE_HOUR_MAX   = 19;  // never after 7pm

const LOG_NUDGE_COPY: { title: string; body: string }[] = [
  { title: 'Quick check-in 👀',        body: "Anyone owe you money right now? Log it before it slips your mind." },
  { title: 'Borrowed something lately?', body: 'A 10-second log now saves you from forgetting later.' },
  { title: 'Ledger check',             body: 'Any new IOUs since we last talked? Keep Ụgwọ up to date.' },
  { title: 'Before you forget…',       body: 'Did you lend or borrow anything this week? Log it now.' },
  { title: 'A nudge from Ụgwọ',        body: "Money moves fast — make sure your ledger has the full picture." },
  { title: 'Quiet week?',              body: "Good time to double-check nothing's slipped through the cracks." },
  { title: 'Taken a loan recently?',   body: 'Log it now — a small habit that saves big headaches later.' },
  { title: 'Who owes who?',            body: 'Take a second to update who owes you, and who you owe.' },
  { title: 'Just checking in',         body: 'Anything new to track today? Tap to log it in seconds.' },
  { title: "Don't let it slip",        body: "A favor between friends can turn into a forgotten debt. Log it while it's fresh." },
];

// ─── Copy craft ───────────────────────────────────────────────────────────────
// Every debt gets its own consistent voice: variants are picked by a stable
// hash of the debt id, so reminders for one debt always read as a sequence
// (7d → 3d → 1d → day-of escalates gently), while different debts feel fresh.
// Tone rules: dignified, never nagging, never shaming — Ụgwọ protects the
// relationship first. Amounts stay in the body, out of lock-screen titles.

function pick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function composeLadderCopy(
  debtId: string,
  days: number,
  firstName: string,
  amount: string,
  owedToMe: boolean,
): { title: string; body: string } {
  if (owedToMe) {
    switch (days) {
      case 7: return pick(debtId, [
        { title: `One week to ${firstName}'s due date`,
          body:  `${amount} is due next week. No action needed yet — Ụgwọ is keeping count so you don't have to.` },
        { title: `${firstName}'s repayment is a week away`,
          body:  `${amount} comes due in 7 days. Relax — we'll walk you to the date.` },
      ]);
      case 3: return pick(debtId, [
        { title: `Three days: ${firstName}`,
          body:  `${amount} is due Friday-soon. A light "hope all is well" today makes the due date easy.` },
        { title: `${firstName}'s due date is closing in`,
          body:  `${amount} due in 3 days. Now's the perfect time for a gentle heads-up — tap to send one.` },
      ]);
      case 1: return pick(debtId, [
        { title: `Tomorrow: ${firstName}`,
          body:  `${amount} is due tomorrow. One polite reminder tonight saves an awkward one next week.` },
        { title: `${firstName}'s repayment lands tomorrow`,
          body:  `${amount} due tomorrow. Tap to send a friendly nudge — we've already written it for you.` },
      ]);
      default: return pick(debtId, [
        { title: `Today's the day — ${firstName}`,
          body:  `${amount} is due today. If it arrives, record it and enjoy the little celebration. 🎉` },
        { title: `${firstName}'s due date is today`,
          body:  `${amount} due today. A warm reminder now keeps both the money and the friendship.` },
      ]);
    }
  }

  // You owe them — the tone turns inward: honour your own word.
  switch (days) {
    case 7: return pick(debtId, [
      { title: `One week to settle with ${firstName}`,
        body:  `${amount} is due next week. Plenty of time — future you says thanks for planning ahead.` },
      { title: `Your word to ${firstName}: 7 days`,
        body:  `${amount} due in a week. Set the money aside now and the due date becomes a non-event.` },
    ]);
    case 3: return pick(debtId, [
      { title: `Three days to settle with ${firstName}`,
        body:  `${amount} due in 3 days. Even a part-payment now speaks volumes.` },
      { title: `${firstName} is counting on Friday-soon`,
        body:  `${amount} due in 3 days. Keeping your word is the whole point of Ụgwọ.` },
    ]);
    case 1: return pick(debtId, [
      { title: `Tomorrow: your promise to ${firstName}`,
        body:  `${amount} is due tomorrow. Send it tonight and sleep like a person with no debts.` },
      { title: `One more day — ${firstName}`,
        body:  `${amount} due tomorrow. Beat the deadline; it feels better than meeting it.` },
    ]);
    default: return pick(debtId, [
      { title: `Today: settle with ${firstName}`,
        body:  `${amount} is due today. Pay it, record it, and watch it move to History. ✅` },
      { title: `Keep the peace with ${firstName} today`,
        body:  `${amount} due today. On-time repayment is how trust compounds.` },
    ]);
  }
}

function composeNudgeCopy(
  debtId: string,
  firstName: string,
  amount: string,
  owedToMe: boolean,
): { title: string; body: string } {
  if (owedToMe) {
    return pick(debtId, [
      { title: `A month on — ${firstName}`,
        body:  `${amount} has been open for 30 days with no due date. A soft check-in keeps it from becoming "that money we don't talk about".` },
      { title: `Still in the ledger: ${firstName}`,
        body:  `${amount}, open a month now. Tap to send the gentle reminder we've drafted — face-saving guaranteed.` },
    ]);
  }
  return pick(debtId, [
    { title: `A month on — you owe ${firstName}`,
      body:  `${amount} has been open for 30 days. Even a small part-payment today tells them their trust was well placed.` },
    { title: `Quiet debt, loud gratitude`,
      body:  `${firstName}'s ${amount} is a month old. Settling unasked is the classiest move in the book.` },
  ]);
}

// ─── NotificationService ──────────────────────────────────────────────────────

class NotificationService {
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

    await Notifications.setNotificationChannelAsync('nudges', {
      name: 'Log Reminders',
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

    const firstName = personName.trim().split(/\s+/)[0];

    if (debt.dueOn) {
      const dueDate = parseISO(debt.dueOn);
      for (const days of REMINDER_LADDER) {
        const triggerDate = setSeconds(setMinutes(setHours(
          days === 0 ? dueDate : addDays(dueDate, -days),
          REMINDER_HOUR), 0), 0);

        const { title, body } = composeLadderCopy(
          debt.id, days, firstName, amountFormatted, owedToMe,
        );
        await schedule(`debt_${debt.id}_${days}d`, triggerDate, title, body);
      }
    } else {
      // Open-ended: one nudge 30 days after the loan was made
      const nudgeDate = setSeconds(setMinutes(setHours(
        addDays(startOfDay(parseISO(debt.incurredOn)), OPEN_ENDED_NUDGE_DAYS),
        REMINDER_HOUR), 0), 0);

      const { title, body } = composeNudgeCopy(debt.id, firstName, amountFormatted, owedToMe);
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

    const now = new Date();
    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, REMINDER_HOUR, 0, 0);

    await Notifications.scheduleNotificationAsync({
      identifier: 'ugwo_monthly_recap',
      content: {
        title: 'New month, clean ledger?',
        body:  'Your recap is ready — what came home last month, and what is still out there.',
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

  // ── Log nudges ───────────────────────────────────────────────────────────
  // Unprompted "did anything happen lately?" check-ins, wholly unrelated to
  // any specific debt. Called on every app open/foreground: tops up a rolling
  // queue so there are always LOG_NUDGE_QUEUE_SIZE nudges scheduled ahead.
  // The OS delivers them even if Ụgwọ stays closed for weeks — each future
  // open just extends the queue further out.

  async scheduleLogNudges(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existingCount = scheduled.filter((n) => n.identifier.startsWith('log_nudge_')).length;
    const needed = LOG_NUDGE_QUEUE_SIZE - existingCount;
    if (needed <= 0) return;

    let anchor = new Date();

    for (let i = 0; i < needed; i++) {
      const days   = LOG_NUDGE_MIN_DAYS + Math.floor(Math.random() * (LOG_NUDGE_MAX_DAYS - LOG_NUDGE_MIN_DAYS + 1));
      const hour   = LOG_NUDGE_HOUR_MIN + Math.floor(Math.random() * (LOG_NUDGE_HOUR_MAX - LOG_NUDGE_HOUR_MIN + 1));
      const minute = Math.floor(Math.random() * 60);
      anchor = setSeconds(setMinutes(setHours(addDays(anchor, days), hour), minute), 0);

      const { title, body } = LOG_NUDGE_COPY[Math.floor(Math.random() * LOG_NUDGE_COPY.length)];

      await Notifications.scheduleNotificationAsync({
        identifier: `log_nudge_${Date.now()}_${i}`,
        content: {
          title,
          body,
          sound: true,
          data: { screen: 'home', type: 'log_nudge', action: 'log' },
          ...(Platform.OS === 'android' ? { channelId: 'nudges' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: anchor,
        },
      });
    }
  }

  async cancelLogNudges(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const cancelIds = scheduled
      .filter((n) => n.identifier.startsWith('log_nudge_'))
      .map((n) => n.identifier);
    await Promise.all(
      cancelIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
    );
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
