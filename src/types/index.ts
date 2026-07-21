// ─── Ụgwọ — TypeScript Type System ─────────────────────────────────────────

// ─── Primitives ────────────────────────────────────────────────────────────

export type ISO8601 = string;    // '2026-07-20T09:00:00.000Z'
export type DateString = string; // '2026-07-20'
export type UUID = string;
export type Minor = number;      // all amounts in minor units (kobo) internally

// ─── Auth & User ──────────────────────────────────────────────────────────

export interface User {
  id:        UUID;
  name:      string;
  email:     string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface AuthSession {
  userId:      UUID;
  accessToken: string;
  expiresAt:   ISO8601;
}

export interface BiometricConfig {
  enabled: boolean;
  type:    'faceId' | 'touchId' | 'fingerprint' | 'none';
}

// ─── Persons ──────────────────────────────────────────────────────────────

export interface Person {
  id:        UUID;
  userId:    UUID;
  name:      string;
  note:      string | null;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

// ─── Debts ────────────────────────────────────────────────────────────────

export type DebtDirection = 'owed_to_me' | 'i_owe';
export type DebtStatus    = 'open' | 'settled';

/** Derived UI status chip for a person / debt. */
export type DueStatus = 'overdue' | 'due-soon' | 'open-ended' | 'upcoming' | 'settled';

export interface Debt {
  id:            UUID;
  userId:        UUID;
  personId:      UUID;
  direction:     DebtDirection;
  /** Principal in minor units (kobo). Never floats. */
  principal:     Minor;
  currency:      string;          // display currency code at time of entry
  incurredOn:    DateString;
  dueOn:         DateString | null;  // null = open-ended
  note:          string | null;
  status:        DebtStatus;
  settledAt:     ISO8601 | null;
  createdAt:     ISO8601;
  updatedAt:     ISO8601;
}

// ─── Repayments ───────────────────────────────────────────────────────────

export interface Repayment {
  id:        UUID;
  userId:    UUID;
  debtId:    UUID;
  amount:    Minor;
  paidOn:    DateString;
  note:      string | null;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

// ─── Derived aggregates ───────────────────────────────────────────────────

/** A debt with its repayments folded in. */
export interface DebtWithBalance extends Debt {
  repaid:      Minor;
  outstanding: Minor;
}

/** Per-person rollup used by the Home list + person ledger header. */
export interface PersonBalance {
  person:        Person;
  /** Positive = they owe you, negative = you owe them (minor units). */
  net:           Minor;
  owedToMe:      Minor;
  iOwe:          Minor;
  openDebtCount: number;
  /** Worst-case status across the person's open debts. */
  status:        DueStatus;
  /** Earliest upcoming due date across open debts, if any. */
  nextDueOn:     DateString | null;
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface AppNotification {
  id:          UUID;
  userId:      UUID;
  type:        string;
  title:       string;
  body:        string;
  referenceId: string | null;
  isRead:      boolean;
  scheduledAt: ISO8601 | null;
  createdAt:   ISO8601;
}
