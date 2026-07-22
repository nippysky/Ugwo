import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

// ─── Ụgwọ API — PostgreSQL schema ────────────────────────────────────────────
// Lives in its own `ugwo_db` database on the shared NIPPYSKY Postgres
// instance (same droplet as Akù's DB — separate database, never shared).
//
// Privacy model: the server NEVER sees plaintext ledger data. sync_records
// holds AES-256-GCM ciphertext encrypted on-device with the user's DEK.

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:    text('id').primaryKey(),           // UUID v4
  name:  text('name').notNull(),
  email: text('email').notNull().unique(),
  /**
   * The user's Data Encryption Key, encrypted at rest with the server master
   * key (AES-256-GCM). Stored as base64(iv[12] || ciphertext || tag[16]).
   * Returned only to the authenticated owner so they can decrypt their own
   * data on any device. The server never stores or logs the plaintext DEK.
   */
  encryptedDek: text('encrypted_dek'),
  /**
   * Preferred display currency — persisted server-side so it survives
   * logout / reinstall / new-device sign-in. null = never set (client
   * falls back to NGN).
   */
  preferredCurrencyCode:   text('preferred_currency_code'),
  preferredCurrencySymbol: text('preferred_currency_symbol'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Magic Link Tokens ────────────────────────────────────────────────────────
// One-time tokens sent via email. tokenHash is SHA-256(rawToken).
// The raw token is in the email URL; only the hash is stored here.

export const magicTokens = pgTable('magic_tokens', {
  id:        text('id').primaryKey(),           // UUID v4
  email:     text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  /** 6-digit numeric OTP — alternative to clicking the email link. */
  otpCode:   text('otp_code'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),              // null = still valid
  createdAt: timestamp('created_at').notNull().defaultNow(),
  /** True when the user row was created in the same POST /magic-link request. */
  isNew:     boolean('is_new').notNull().default(false),
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
// JWT sessions issued after magic link verification.
// tokenHash is SHA-256(jwt) — lets us invalidate specific tokens on sign-out.

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),           // UUID v4
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),           // null = active
});

// ─── Sync Records ─────────────────────────────────────────────────────────────
// Encrypted ledger blobs for cross-device sync.
//
//   - encrypted_payload = base64(iv[12] || AES-256-GCM(plaintext) || tag[16])
//   - Encrypted client-side with the user's DEK.
//   - Conflict resolution: last-write-wins on client_updated_at.
//   - Soft-delete: is_deleted = true + encrypted_payload = '' signals deletion.

export const syncRecords = pgTable('sync_records', {
  id:               text('id').primaryKey(),       // client-generated stable ID
  userId:           text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType:       text('entity_type').notNull(), // 'person' | 'debt' | 'repayment'
  entityId:         text('entity_id').notNull(),
  encryptedPayload: text('encrypted_payload').notNull(),
  clientUpdatedAt:  timestamp('client_updated_at', { withTimezone: true }).notNull(),
  serverUpdatedAt:  timestamp('server_updated_at', { withTimezone: true }).notNull().defaultNow(),
  isDeleted:        boolean('is_deleted').notNull().default(false),
}, (t) => [
  // Fast pull: "give me all records for user X updated after timestamp T"
  index('idx_sync_user_server_ts').on(t.userId, t.serverUpdatedAt),
  // Upsert lookup: "does this entity already exist for this user?"
  index('idx_sync_user_entity').on(t.userId, t.entityType, t.entityId),
]);
