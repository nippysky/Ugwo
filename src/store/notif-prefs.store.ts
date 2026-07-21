/**
 * notif-prefs.store.ts
 *
 * Persists user notification preferences in the SQLite app_state table.
 * NotificationService reads getNotifPrefs() before scheduling any alert.
 * All Ụgwọ reminders are LOCAL notifications scheduled on-device — the
 * server can never read due dates, so it can never send debt reminders.
 */

import { create } from 'zustand';
import { getSQLiteDatabase } from '../lib/database/client';

// ─── Preference keys ──────────────────────────────────────────────────────────

const KEY_DEBT_REMINDERS = 'notif_debt_reminders';
const KEY_MONTHLY_RECAP  = 'notif_monthly_recap';

// ─── SQLite helpers ───────────────────────────────────────────────────────────

function appStateGet(key: string, fallback: boolean): boolean {
  try {
    const sqlite = getSQLiteDatabase();
    const row = sqlite.getFirstSync<{ value: string }>(
      'SELECT value FROM app_state WHERE key = ?', [key],
    );
    if (row == null) return fallback;
    return row.value === '1';
  } catch { return fallback; }
}

function appStateSet(key: string, value: boolean): void {
  try {
    const sqlite = getSQLiteDatabase();
    sqlite.runSync(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value ? '1' : '0'],
    );
  } catch { /* ignore — prefs just won't persist on error */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifPrefs {
  /** Due-date ladder (7/3/1/day-of) + 30-day nudge for open-ended debts. */
  debtReminders: boolean;
  /** "You recovered ₦X in July" — first day of each month. */
  monthlyRecap:  boolean;
}

interface NotifPrefsState extends NotifPrefs {
  isLoaded: boolean;
  load:     () => void;
  set:      <K extends keyof NotifPrefs>(key: K, value: boolean) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotifPrefsStore = create<NotifPrefsState>()((set) => ({
  debtReminders: true,
  monthlyRecap:  true,
  isLoaded:      false,

  load: () => {
    set({
      debtReminders: appStateGet(KEY_DEBT_REMINDERS, true),
      monthlyRecap:  appStateGet(KEY_MONTHLY_RECAP,  true),
      isLoaded:      true,
    });
  },

  set: (key, value) => {
    set((s) => ({ ...s, [key]: value }));
    const keyMap: Record<keyof NotifPrefs, string> = {
      debtReminders: KEY_DEBT_REMINDERS,
      monthlyRecap:  KEY_MONTHLY_RECAP,
    };
    appStateSet(keyMap[key], value);
  },
}));

// ─── Exported getter (used by NotificationService synchronously) ──────────────

export function getNotifPrefs(): NotifPrefs {
  const { debtReminders, monthlyRecap } = useNotifPrefsStore.getState();
  return { debtReminders, monthlyRecap };
}
