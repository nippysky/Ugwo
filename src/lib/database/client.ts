import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { schema } from './schema';

// ─── Database Client ───────────────────────────────────────────────────────
// Single SQLite connection, shared across the app. Opened lazily on first
// access. Mirrors Akù's client conventions.

const DB_NAME = 'ugwo.db';

let _db: ReturnType<typeof drizzle> | null = null;
let _sqliteDb: SQLite.SQLiteDatabase | null = null;

export function getDatabase() {
  if (!_db) {
    _sqliteDb = SQLite.openDatabaseSync(DB_NAME);
    _db = drizzle(_sqliteDb, { schema });
  }
  return _db;
}

export function getSQLiteDatabase() {
  if (!_sqliteDb) {
    getDatabase(); // initializes both
  }
  return _sqliteDb!;
}

// ─── DB Migration / Setup ─────────────────────────────────────────────────
// Creates all tables if they don't exist. Safe to call on every app start.

const CREATE_TABLES_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    biometric_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('owed_to_me','i_owe')),
    principal INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    incurred_on TEXT NOT NULL,
    due_on TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
    settled_at TEXT,
    aku_entity_id TEXT,
    aku_entity_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS repayments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    debt_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid_on TEXT NOT NULL,
    note TEXT,
    aku_entity_id TEXT,
    aku_entity_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reference_id TEXT,
    is_read INTEGER DEFAULT 0,
    scheduled_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_persons_user ON persons(user_id);
  CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);
  CREATE INDEX IF NOT EXISTS idx_debts_person ON debts(person_id);
  CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
  CREATE INDEX IF NOT EXISTS idx_debts_due ON debts(due_on);
  CREATE INDEX IF NOT EXISTS idx_repayments_debt ON repayments(debt_id);
  CREATE INDEX IF NOT EXISTS idx_repayments_user ON repayments(user_id);
  CREATE INDEX IF NOT EXISTS idx_repayments_date ON repayments(paid_on);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);
`;

// ─── Column migrations (safe to run on every boot) ────────────────────────
// Reserved for future schema evolution — same pattern as Akù: each ALTER is
// attempted and "duplicate column" errors are swallowed on fresh installs.

const MIGRATIONS_SQL: string[] = [
  // Connect-Akù: mirror debts/repayments to a linked Akù account as
  // expense/income records. These columns trace which Akù record (if any)
  // corresponds to each local row, for later edits/deletes.
  "ALTER TABLE debts ADD COLUMN aku_entity_id TEXT",
  "ALTER TABLE debts ADD COLUMN aku_entity_type TEXT",
  "ALTER TABLE repayments ADD COLUMN aku_entity_id TEXT",
  "ALTER TABLE repayments ADD COLUMN aku_entity_type TEXT",
];

export async function initializeDatabase(): Promise<void> {
  const sqlite = getSQLiteDatabase();
  sqlite.execSync(CREATE_TABLES_SQL);
  for (const sql of MIGRATIONS_SQL) {
    try { sqlite.execSync(sql); } catch { /* column already exists */ }
  }
}

export { schema };
export type UgwoDB = ReturnType<typeof getDatabase>;
