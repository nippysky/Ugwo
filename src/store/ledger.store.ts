/**
 * ledger.store.ts — the single source of truth for Ụgwọ's domain data.
 *
 * Holds persons, debts and repayments (loaded from SQLite), exposes actions
 * for every write path, and keeps three side-effects consistent on every
 * mutation:
 *   1. SQLite write (local source of truth)
 *   2. Sync trigger (debounced encrypted push; tombstones for deletes)
 *   3. Local notification (re)scheduling for due-date reminders
 *
 * Derived data (net position, per-person balances) is computed via the pure
 * functions in lib/debt-math.ts — screens call the exported selectors below.
 */

import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
import { triggerPush, triggerDelete } from '../lib/sync/trigger';
import { notificationService } from '../lib/notifications';
import { withBalance, todayStr } from '../lib/debt-math';
import { useUIStore } from './ui.store';
import {
  pushDebtToAku,
  updateAkuEntityForDebt,
  deleteAkuEntityForDebt,
  pushRepaymentToAku,
  deleteAkuEntityForRepayment,
  retryUnsyncedAkuMirrors,
  backfillHistoryToAku,
  type AkuBulkSyncResult,
} from '../lib/aku-link/sync-to-aku';
import type { AkuEntityType, Debt, DebtDirection, Person, Repayment } from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

interface LedgerState {
  persons:    Person[];
  debts:      Debt[];
  repayments: Repayment[];
  isLoading:  boolean;
  isLoaded:   boolean;
  error:      string | null;

  // ── Read ──
  load: (userId: string) => Promise<void>;

  // ── Persons ──
  addPerson:    (userId: string, name: string, note?: string | null) => Promise<Person>;
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'note'>>) => Promise<void>;
  /** Deletes the person AND all their debts + repayments (with tombstones). */
  deletePerson: (id: string) => Promise<void>;

  // ── Debts ──
  addDebt: (input: {
    userId:     string;
    personId:   string;
    direction:  DebtDirection;
    principal:  number;           // minor units
    currency:   string;
    incurredOn: string;
    dueOn:      string | null;
    note:       string | null;
  }) => Promise<Debt>;
  updateDebt: (id: string, patch: Partial<Pick<Debt,
    'principal' | 'incurredOn' | 'dueOn' | 'note' | 'direction'>>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  /** Explicitly mark a debt settled (also fired automatically at zero balance). */
  settleDebt: (id: string) => Promise<void>;
  /** Reopen a settled debt (undo). */
  reopenDebt: (id: string) => Promise<void>;

  // ── Repayments ──
  /**
   * Record a repayment against a debt. Auto-settles the debt when the
   * outstanding balance reaches zero. Returns true if the debt was settled
   * by this repayment (caller shows the celebration).
   */
  recordRepayment: (input: {
    userId: string;
    debtId: string;
    amount: number;               // minor units
    paidOn: string;
    note:   string | null;
  }) => Promise<{ settled: boolean }>;
  deleteRepayment: (id: string) => Promise<void>;

  // ── Connect-Akù bulk sync ──
  /** Retry any debt/repayment that should already be Akù-synced but isn't
   *  (e.g. logged while offline). Safe to call often — cheap no-op when
   *  nothing is pending. */
  retryAkuSync: () => Promise<void>;
  /** One-time, explicit backfill of ALL existing history to Akù. Only ever
   *  called when the user opts in from the Connect Akù screen. */
  backfillAkuHistory: () => Promise<AkuBulkSyncResult>;
  /**
   * Clear every local `akuEntityId`/`akuEntityType` tag for this user. Called
   * by aku-link.store.ts when it detects a reconnect to a DIFFERENT Akù
   * account — tags from the old account would otherwise block the new
   * account from ever backfilling this history, since eligibility only
   * checks "is this tagged?", not "tagged for which account?".
   */
  resetAkuMirrorTags: (userId: string) => Promise<void>;
  /**
   * Recompute every open debt's reminder times against the device's CURRENT
   * local timezone. Call on every app foreground (see _layout.tsx).
   *
   * Reminders are scheduled as one-off `DATE`-type triggers — expo-notifications
   * has no cross-platform "calendar day + local hour, timezone-adaptive" trigger
   * (Android has no CALENDAR trigger at all; it only exists on iOS). A `DATE`
   * trigger is a fixed instant: if a reminder is computed while in Lagos and the
   * user then flies to Stockholm before it fires, the OS still fires at that
   * exact instant — which now reads as the wrong LOCAL hour on the new
   * timezone. Re-running the same schedule-at-9am math on every foreground
   * (idempotent — cancels + reschedules) means the next time the app is
   * opened in the new timezone, every still-pending reminder recomputes
   * using the phone's current clock and self-corrects. This mirrors the
   * pattern already used for scheduleMonthlyRecap/scheduleLogNudges.
   */
  refreshAllReminders: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/** Reschedule local reminders for one debt (fire-and-forget, never throws). */
function rescheduleReminders(debt: Debt, persons: Person[]): void {
  const person = persons.find((p) => p.id === debt.personId);
  const symbol = useUIStore.getState().currency.symbol;
  notificationService
    .scheduleDebtReminders(debt, person?.name ?? 'Someone', symbol)
    .catch(() => {});
}

function personNameFor(personId: string, persons: Person[]): string {
  return persons.find((p) => p.id === personId)?.name ?? 'Someone';
}

// ─── Connect-Akù mirroring (fire-and-forget, never blocks the ledger) ─────────
// See src/lib/aku-link — when connected, new/edited/deleted debts and
// repayments are mirrored to Akù as expense/income records. Every helper
// below is best-effort: failures are swallowed so a flaky connection or a
// currency mismatch never affects the primary Ụgwọ write that already
// succeeded before these were called.

async function persistDebtAkuLink(
  debtId: string,
  result: { akuEntityId: string; akuEntityType: AkuEntityType },
): Promise<void> {
  try {
    const db = getDatabase();
    await db.update(schema.debts)
      .set({ akuEntityId: result.akuEntityId, akuEntityType: result.akuEntityType })
      .where(eq(schema.debts.id, debtId));
  } catch { /* non-fatal — next edit will retry the sync */ }
  useLedgerStore.setState((s) => ({
    debts: s.debts.map((d) => (d.id === debtId ? { ...d, ...result } : d)),
  }));
}

async function persistRepaymentAkuLink(
  repaymentId: string,
  result: { akuEntityId: string; akuEntityType: AkuEntityType },
): Promise<void> {
  try {
    const db = getDatabase();
    await db.update(schema.repayments)
      .set({ akuEntityId: result.akuEntityId, akuEntityType: result.akuEntityType })
      .where(eq(schema.repayments.id, repaymentId));
  } catch { /* non-fatal */ }
  useLedgerStore.setState((s) => ({
    repayments: s.repayments.map((r) => (r.id === repaymentId ? { ...r, ...result } : r)),
  }));
}

function syncNewDebtToAku(debt: Debt, persons: Person[]): void {
  pushDebtToAku(debt, personNameFor(debt.personId, persons))
    .then((result) => { if (result) void persistDebtAkuLink(debt.id, result); })
    .catch(() => {});
}

function syncDebtEditToAku(debt: Debt, persons: Person[]): void {
  updateAkuEntityForDebt(debt, personNameFor(debt.personId, persons))
    .then((result) => { if (result) void persistDebtAkuLink(debt.id, result); })
    .catch(() => {});
}

function syncNewRepaymentToAku(repayment: Repayment, debt: Debt, persons: Person[]): void {
  pushRepaymentToAku(repayment, debt, personNameFor(debt.personId, persons))
    .then((result) => { if (result) void persistRepaymentAkuLink(repayment.id, result); })
    .catch(() => {});
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLedgerStore = create<LedgerState>()((set, get) => ({
  persons:    [],
  debts:      [],
  repayments: [],
  isLoading:  false,
  isLoaded:   false,
  error:      null,

  // ── Load everything for this user ───────────────────────────────────────
  load: async (userId) => {
    // Only show the loading flag on first load — silent refresh afterwards
    if (!get().isLoaded) set({ isLoading: true });
    try {
      const db = getDatabase();
      const [persons, debts, repayments] = await Promise.all([
        db.select().from(schema.persons).where(eq(schema.persons.userId, userId)),
        db.select().from(schema.debts).where(eq(schema.debts.userId, userId)),
        db.select().from(schema.repayments).where(eq(schema.repayments.userId, userId)),
      ]);
      set({
        persons:    persons as Person[],
        debts:      debts as Debt[],
        repayments: repayments as Repayment[],
        isLoading:  false,
        isLoaded:   true,
        error:      null,
      });
      // Fire-and-forget: pick up anything that should already be Akù-synced
      // but isn't yet (e.g. logged while offline). Cheap no-op if nothing
      // is pending — never blocks or delays this load.
      void get().retryAkuSync();
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load' });
    }
  },

  // ── Persons ─────────────────────────────────────────────────────────────
  addPerson: async (userId, name, note = null) => {
    const now = nowIso();
    const person: Person = {
      id: generateUUID(), userId, name: name.trim(), note, createdAt: now, updatedAt: now,
    };
    const db = getDatabase();
    await db.insert(schema.persons).values(person);
    set((s) => ({ persons: [...s.persons, person] }));
    triggerPush();
    return person;
  },

  updatePerson: async (id, patch) => {
    const now = nowIso();
    const db = getDatabase();
    await db.update(schema.persons).set({ ...patch, updatedAt: now })
      .where(eq(schema.persons.id, id));
    set((s) => ({
      persons: s.persons.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p)),
    }));
    triggerPush();
  },

  deletePerson: async (id) => {
    const { debts, repayments } = get();
    const db = getDatabase();

    // Cascade: repayments → debts → person, each with its own tombstone so
    // the deletion propagates to other devices and never resurrects.
    const personDebts = debts.filter((d) => d.personId === id);
    for (const debt of personDebts) {
      for (const rep of repayments.filter((r) => r.debtId === debt.id)) {
        await db.delete(schema.repayments).where(eq(schema.repayments.id, rep.id));
        triggerDelete('repayment', rep.id);
        void deleteAkuEntityForRepayment(rep);
      }
      await db.delete(schema.debts).where(eq(schema.debts.id, debt.id));
      triggerDelete('debt', debt.id);
      notificationService.cancelDebtReminders(debt.id).catch(() => {});
      void deleteAkuEntityForDebt(debt);
    }
    await db.delete(schema.persons).where(eq(schema.persons.id, id));
    triggerDelete('person', id);

    const debtIds = new Set(personDebts.map((d) => d.id));
    set((s) => ({
      persons:    s.persons.filter((p) => p.id !== id),
      debts:      s.debts.filter((d) => d.personId !== id),
      repayments: s.repayments.filter((r) => !debtIds.has(r.debtId)),
    }));
  },

  // ── Debts ───────────────────────────────────────────────────────────────
  addDebt: async (input) => {
    const now = nowIso();
    const debt: Debt = {
      id:         generateUUID(),
      userId:     input.userId,
      personId:   input.personId,
      direction:  input.direction,
      principal:  input.principal,
      currency:   input.currency,
      incurredOn: input.incurredOn,
      dueOn:      input.dueOn,
      note:       input.note,
      status:     'open',
      settledAt:  null,
      akuEntityId:   null,
      akuEntityType: null,
      createdAt:  now,
      updatedAt:  now,
    };
    const db = getDatabase();
    await db.insert(schema.debts).values(debt);
    set((s) => ({ debts: [...s.debts, debt] }));
    triggerPush();
    rescheduleReminders(debt, get().persons);
    syncNewDebtToAku(debt, get().persons);
    return debt;
  },

  updateDebt: async (id, patch) => {
    const now = nowIso();
    const db = getDatabase();
    await db.update(schema.debts).set({ ...patch, updatedAt: now })
      .where(eq(schema.debts.id, id));
    set((s) => ({
      debts: s.debts.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: now } : d)),
    }));
    triggerPush();
    const debt = get().debts.find((d) => d.id === id);
    if (debt) {
      rescheduleReminders(debt, get().persons);
      // Only worth re-syncing if a field Akù actually cares about changed.
      if ('principal' in patch || 'incurredOn' in patch || 'direction' in patch) {
        syncDebtEditToAku(debt, get().persons);
      }
    }
  },

  deleteDebt: async (id) => {
    const { repayments, debts } = get();
    const debt = debts.find((d) => d.id === id);
    const db = getDatabase();
    for (const rep of repayments.filter((r) => r.debtId === id)) {
      await db.delete(schema.repayments).where(eq(schema.repayments.id, rep.id));
      triggerDelete('repayment', rep.id);
      void deleteAkuEntityForRepayment(rep);
    }
    await db.delete(schema.debts).where(eq(schema.debts.id, id));
    triggerDelete('debt', id);
    notificationService.cancelDebtReminders(id).catch(() => {});
    if (debt) void deleteAkuEntityForDebt(debt);
    set((s) => ({
      debts:      s.debts.filter((d) => d.id !== id),
      repayments: s.repayments.filter((r) => r.debtId !== id),
    }));
  },

  settleDebt: async (id) => {
    const now = nowIso();
    const db = getDatabase();
    await db.update(schema.debts).set({ status: 'settled', settledAt: now, updatedAt: now })
      .where(eq(schema.debts.id, id));
    set((s) => ({
      debts: s.debts.map((d) =>
        d.id === id ? { ...d, status: 'settled' as const, settledAt: now, updatedAt: now } : d),
    }));
    triggerPush();
    notificationService.cancelDebtReminders(id).catch(() => {});
  },

  reopenDebt: async (id) => {
    const now = nowIso();
    const db = getDatabase();
    await db.update(schema.debts).set({ status: 'open', settledAt: null, updatedAt: now })
      .where(eq(schema.debts.id, id));
    set((s) => ({
      debts: s.debts.map((d) =>
        d.id === id ? { ...d, status: 'open' as const, settledAt: null, updatedAt: now } : d),
    }));
    triggerPush();
    const debt = get().debts.find((d) => d.id === id);
    if (debt) rescheduleReminders(debt, get().persons);
  },

  // ── Repayments ──────────────────────────────────────────────────────────
  recordRepayment: async (input) => {
    const now = nowIso();
    const repayment: Repayment = {
      id:        generateUUID(),
      userId:    input.userId,
      debtId:    input.debtId,
      amount:    input.amount,
      paidOn:    input.paidOn,
      note:      input.note,
      akuEntityId:   null,
      akuEntityType: null,
      createdAt: now,
      updatedAt: now,
    };
    const db = getDatabase();
    await db.insert(schema.repayments).values(repayment);

    const repayments = [...get().repayments, repayment];
    set({ repayments });
    triggerPush();

    const debt = get().debts.find((d) => d.id === input.debtId);
    if (debt) syncNewRepaymentToAku(repayment, debt, get().persons);

    // Auto-settle at zero balance
    if (debt && debt.status === 'open') {
      const { outstanding } = withBalance(debt, repayments);
      if (outstanding <= 0) {
        await get().settleDebt(debt.id);
        return { settled: true };
      }
    }
    return { settled: false };
  },

  deleteRepayment: async (id) => {
    const db = getDatabase();
    const repayment = get().repayments.find((r) => r.id === id);
    await db.delete(schema.repayments).where(eq(schema.repayments.id, id));
    triggerDelete('repayment', id);
    if (repayment) void deleteAkuEntityForRepayment(repayment);
    set((s) => ({ repayments: s.repayments.filter((r) => r.id !== id) }));
  },

  // ── Connect-Akù bulk sync ────────────────────────────────────────────────
  retryAkuSync: async () => {
    try {
      const { debts, repayments, persons } = get();
      const result = await retryUnsyncedAkuMirrors(debts, repayments, persons);
      for (const link of result.links) {
        if (link.kind === 'debt') await persistDebtAkuLink(link.id, link);
        else await persistRepaymentAkuLink(link.id, link);
      }
    } catch { /* best-effort — will retry again on next load/foreground */ }
  },

  backfillAkuHistory: async () => {
    const { debts, repayments, persons } = get();
    const result = await backfillHistoryToAku(debts, repayments, persons);
    for (const link of result.links) {
      if (link.kind === 'debt') await persistDebtAkuLink(link.id, link);
      else await persistRepaymentAkuLink(link.id, link);
    }
    return result;
  },

  resetAkuMirrorTags: async (userId: string) => {
    try {
      const db = getDatabase();
      await db.update(schema.debts)
        .set({ akuEntityId: null, akuEntityType: null })
        .where(eq(schema.debts.userId, userId));
      await db.update(schema.repayments)
        .set({ akuEntityId: null, akuEntityType: null })
        .where(eq(schema.repayments.userId, userId));
    } catch {
      // Best-effort — worst case some old tags linger, blocking backfill
      // into the new account until the next successful pass.
    }
    useLedgerStore.setState((s) => ({
      debts:      s.debts.map((d) => ({ ...d, akuEntityId: null, akuEntityType: null })),
      repayments: s.repayments.map((r) => ({ ...r, akuEntityId: null, akuEntityType: null })),
    }));
  },

  refreshAllReminders: () => {
    const { debts, persons } = get();
    for (const debt of debts) {
      if (debt.status !== 'open') continue;
      rescheduleReminders(debt, persons);
    }
  },
}));

// ─── Convenience: today string re-export for screens ──────────────────────────

export { todayStr };
