/**
 * Ụgwọ — pure ledger math.
 *
 * Everything here is a pure function over plain data: no I/O, no stores.
 * Amounts are integers in minor units (kobo). Dates are 'YYYY-MM-DD' strings,
 * which compare correctly with plain string comparison.
 */

import type {
  Debt,
  DebtWithBalance,
  DueStatus,
  Person,
  PersonBalance,
  Repayment,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** A debt due within this many days counts as "due soon". */
export const DUE_SOON_DAYS = 7;

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`); // noon avoids DST edge cases
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). Positive = future. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ─── Per-debt math ────────────────────────────────────────────────────────────

export function repaidTotal(debtId: string, repayments: Repayment[]): number {
  let sum = 0;
  for (const r of repayments) {
    if (r.debtId === debtId) sum += r.amount;
  }
  return sum;
}

export function withBalance(debt: Debt, repayments: Repayment[]): DebtWithBalance {
  const repaid = repaidTotal(debt.id, repayments);
  return {
    ...debt,
    repaid,
    outstanding: Math.max(debt.principal - repaid, 0),
  };
}

/** Status chip for a single debt. */
export function debtStatus(debt: Debt, today: string = todayStr()): DueStatus {
  if (debt.status === 'settled') return 'settled';
  if (!debt.dueOn) return 'open-ended';
  if (debt.dueOn < today) return 'overdue';
  if (daysBetween(today, debt.dueOn) <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

// ─── Status severity (worst-first ordering for person rollups) ────────────────

const SEVERITY: Record<DueStatus, number> = {
  'overdue':    4,
  'due-soon':   3,
  'upcoming':   2,
  'open-ended': 1,
  'settled':    0,
};

export function worstStatus(a: DueStatus, b: DueStatus): DueStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

// ─── Person rollups ───────────────────────────────────────────────────────────

/**
 * Compute the per-person rollup that powers the Home list and the person
 * ledger header. Net is signed: positive = they owe you.
 */
export function personBalance(
  person: Person,
  debts: Debt[],
  repayments: Repayment[],
  today: string = todayStr(),
): PersonBalance {
  let owedToMe = 0;
  let iOwe = 0;
  let openDebtCount = 0;
  let status: DueStatus = 'settled';
  let nextDueOn: string | null = null;

  for (const debt of debts) {
    if (debt.personId !== person.id) continue;
    if (debt.status !== 'open') continue;

    const { outstanding } = withBalance(debt, repayments);
    if (outstanding <= 0) continue;

    openDebtCount++;
    if (debt.direction === 'owed_to_me') owedToMe += outstanding;
    else iOwe += outstanding;

    status = worstStatus(status, debtStatus(debt, today));

    if (debt.dueOn && debt.dueOn >= today) {
      if (!nextDueOn || debt.dueOn < nextDueOn) nextDueOn = debt.dueOn;
    }
  }

  return {
    person,
    net: owedToMe - iOwe,
    owedToMe,
    iOwe,
    openDebtCount,
    status,
    nextDueOn,
  };
}

/**
 * All person balances, sorted for the Home list: worst status first, then
 * largest absolute net, then name.
 */
export function allPersonBalances(
  persons: Person[],
  debts: Debt[],
  repayments: Repayment[],
  today: string = todayStr(),
): PersonBalance[] {
  return persons
    .map((p) => personBalance(p, debts, repayments, today))
    .sort((a, b) => {
      const sev = SEVERITY[b.status] - SEVERITY[a.status];
      if (sev !== 0) return sev;
      const abs = Math.abs(b.net) - Math.abs(a.net);
      if (abs !== 0) return abs;
      return a.person.name.localeCompare(b.person.name);
    });
}

// ─── Global totals (Home hero) ────────────────────────────────────────────────

export interface NetPosition {
  /** Signed net across everyone (minor units). */
  net:      number;
  owedToMe: number;
  iOwe:     number;
}

export function netPosition(debts: Debt[], repayments: Repayment[]): NetPosition {
  let owedToMe = 0;
  let iOwe = 0;
  for (const debt of debts) {
    if (debt.status !== 'open') continue;
    const { outstanding } = withBalance(debt, repayments);
    if (debt.direction === 'owed_to_me') owedToMe += outstanding;
    else iOwe += outstanding;
  }
  return { net: owedToMe - iOwe, owedToMe, iOwe };
}

// ─── Monthly recovery (History tab recaps) ────────────────────────────────────

/**
 * Total repayments received in a calendar month ('YYYY-MM') on debts owed
 * to the user — "You recovered ₦X in July".
 */
export function monthlyRecovered(
  month: string,
  debts: Debt[],
  repayments: Repayment[],
): number {
  const owedIds = new Set(
    debts.filter((d) => d.direction === 'owed_to_me').map((d) => d.id),
  );
  let sum = 0;
  for (const r of repayments) {
    if (r.paidOn.startsWith(month) && owedIds.has(r.debtId)) sum += r.amount;
  }
  return sum;
}
