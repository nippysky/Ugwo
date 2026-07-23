import { int, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

// ─── Ụgwọ Database Schema (Drizzle + Expo SQLite) ─────────────────────────
// All dates stored as ISO8601 text. Amounts stored as integers (kobo).
// UUIDs generated client-side with crypto.randomUUID().
// This SQLite database is the source of truth — the server only ever sees
// AES-256-GCM ciphertext of these rows.

// ─── Users ────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id:               text('id').primaryKey(),
  name:             text('name').notNull(),
  email:            text('email').notNull().unique(),
  biometricEnabled: int('biometric_enabled', { mode: 'boolean' }).default(false),
  createdAt:        text('created_at').notNull(),
  updatedAt:        text('updated_at').notNull(),
}, (t) => [
  index('idx_users_email').on(t.email),
]);

// ─── Persons (the people you lend to / borrow from) ───────────────────────

export const persons = sqliteTable('persons', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  name:      text('name').notNull(),
  note:      text('note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_persons_user').on(t.userId),
]);

// ─── Debts ────────────────────────────────────────────────────────────────

export const debts = sqliteTable('debts', {
  id:         text('id').primaryKey(),
  userId:     text('user_id').notNull(),
  personId:   text('person_id').notNull(),
  /** 'owed_to_me' | 'i_owe' */
  direction:  text('direction').notNull(),
  /** Principal in minor units (kobo) — never floats. */
  principal:  int('principal').notNull(),
  currency:   text('currency').notNull().default('NGN'),
  incurredOn: text('incurred_on').notNull(),  // 'YYYY-MM-DD'
  dueOn:      text('due_on'),                 // null = open-ended
  note:       text('note'),
  /** 'open' | 'settled' */
  status:     text('status').notNull().default('open'),
  settledAt:  text('settled_at'),
  /** Set when this debt has been mirrored to a connected Akù account as an
   *  expense/income record (see src/lib/aku-link). Null = not synced / not
   *  connected. */
  akuEntityId:   text('aku_entity_id'),
  /** 'expense' | 'income' | null */
  akuEntityType: text('aku_entity_type'),
  createdAt:  text('created_at').notNull(),
  updatedAt:  text('updated_at').notNull(),
}, (t) => [
  index('idx_debts_user').on(t.userId),
  index('idx_debts_person').on(t.personId),
  index('idx_debts_status').on(t.status),
  index('idx_debts_due').on(t.dueOn),
]);

// ─── Repayments ───────────────────────────────────────────────────────────

export const repayments = sqliteTable('repayments', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  debtId:    text('debt_id').notNull(),
  amount:    int('amount').notNull(),          // in kobo
  paidOn:    text('paid_on').notNull(),        // 'YYYY-MM-DD'
  note:      text('note'),
  /** See debts.akuEntityId — same mirroring, for the repayment side. */
  akuEntityId:   text('aku_entity_id'),
  akuEntityType: text('aku_entity_type'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_repayments_debt').on(t.debtId),
  index('idx_repayments_user').on(t.userId),
  index('idx_repayments_date').on(t.paidOn),
]);

// ─── Notifications (in-app history) ───────────────────────────────────────

export const notifications = sqliteTable('notifications', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  type:        text('type').notNull(),
  title:       text('title').notNull(),
  body:        text('body').notNull(),
  referenceId: text('reference_id'),
  isRead:      int('is_read', { mode: 'boolean' }).default(false),
  scheduledAt: text('scheduled_at'),
  createdAt:   text('created_at').notNull(),
}, (t) => [
  index('idx_notifications_user').on(t.userId),
  index('idx_notifications_read').on(t.isRead),
  index('idx_notifications_user_created').on(t.userId, t.createdAt),
]);

// ─── App State (persisted UI preferences) ────────────────────────────────

export const appState = sqliteTable('app_state', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Schema Export ────────────────────────────────────────────────────────

export const schema = {
  users,
  persons,
  debts,
  repayments,
  notifications,
  appState,
};
