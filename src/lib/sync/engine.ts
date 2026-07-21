/**
 * Ụgwọ Sync Engine
 *
 * Orchestrates push + pull of encrypted ledger data between the device and
 * the server. All data is encrypted with the user's DEK (from sync.store)
 * before leaving the device. The server stores only ciphertext.
 *
 * Push: INCREMENTAL — only rows updated since the last successful push are
 *       encrypted and uploaded (batches of 200). A 60-second overlap window
 *       guards against clock skew and writes racing a push.
 * Deletes: local deletes are queued as tombstones (app_state.pending_deletes)
 *       and pushed as isDeleted records so they propagate to other devices
 *       and never resurrect on a fresh restore.
 * Pull: fetches encrypted deltas (since lastSyncAt), decrypts, upserts locally.
 * Conflict: last-write-wins on clientUpdatedAt. If local is newer, skip.
 * Soft-delete: isDeleted=true → remove the local row.
 */

import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../database/client';
import { encryptRecord, decryptRecord } from './crypto';
import { syncPush, syncPull } from '../api-client';
import { useSyncStore } from '../../store/sync.store';
import { trackReviewEvent } from '../review';
import type { EntityType } from './trigger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalRecord {
  syncId:     string;   // stable sync-record ID: type-prefix + entity UUID
  entityType: EntityType;
  entityId:   string;
  payload:    object;
  updatedAt:  string;
}

interface PulledRecord {
  id:               string;
  entityType:       string;
  entityId:         string;
  encryptedPayload: string;
  clientUpdatedAt:  string | Date;
  serverUpdatedAt:  string | Date;
  isDeleted:        boolean;
}

// ─── Delete tombstones ────────────────────────────────────────────────────────

const PENDING_DELETES_KEY = 'pending_deletes';

const SYNC_PREFIX: Record<EntityType, string> = {
  person:    'per',
  debt:      'debt',
  repayment: 'rep',
};

interface PendingDelete {
  entityType: EntityType;
  entityId:   string;
  deletedAt:  string;
}

async function readPendingDeletes(db: ReturnType<typeof getDatabase>): Promise<PendingDelete[]> {
  try {
    const [row] = await db.select().from(schema.appState)
      .where(eq(schema.appState.key, PENDING_DELETES_KEY)).limit(1);
    return row ? (JSON.parse(row.value) as PendingDelete[]) : [];
  } catch {
    return [];
  }
}

async function writePendingDeletes(
  db: ReturnType<typeof getDatabase>,
  queue: PendingDelete[],
): Promise<void> {
  const value = JSON.stringify(queue);
  await db.insert(schema.appState)
    .values({ key: PENDING_DELETES_KEY, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value } });
}

/** Queue a deleted entity for tombstone push. Call before/after the local delete. */
export async function queueDelete(entityType: EntityType, entityId: string): Promise<void> {
  const db    = getDatabase();
  const queue = await readPendingDeletes(db);
  if (!queue.some((q) => q.entityType === entityType && q.entityId === entityId)) {
    queue.push({ entityType, entityId, deletedAt: new Date().toISOString() });
    await writePendingDeletes(db, queue);
  }
}

// ─── Push ─────────────────────────────────────────────────────────────────────

/** Overlap window re-pushed on every sync to absorb clock skew / races. */
const PUSH_OVERLAP_MS = 60_000;

export async function pushAll(): Promise<void> {
  const { dek, lastPushAt } = useSyncStore.getState();
  if (!dek) return; // no DEK = local-only mode; silently skip

  // Captured BEFORE reading rows — any write racing this push lands after
  // this timestamp and is safely included in the next push.
  const pushStartedAt = new Date().toISOString();

  // Incremental cutoff: only rows updated after (lastPushAt − overlap)
  const cutoff = lastPushAt
    ? new Date(new Date(lastPushAt).getTime() - PUSH_OVERLAP_MS).toISOString()
    : null;

  const db = getDatabase();
  const records: LocalRecord[] = [];

  const [personRows, debtRows, repaymentRows] = await Promise.all([
    db.select().from(schema.persons),
    db.select().from(schema.debts),
    db.select().from(schema.repayments),
  ]);

  for (const p of personRows) {
    records.push({ syncId: `per_${p.id}`, entityType: 'person', entityId: p.id, payload: p, updatedAt: p.updatedAt });
  }
  for (const d of debtRows) {
    records.push({ syncId: `debt_${d.id}`, entityType: 'debt', entityId: d.id, payload: d, updatedAt: d.updatedAt });
  }
  for (const r of repaymentRows) {
    records.push({ syncId: `rep_${r.id}`, entityType: 'repayment', entityId: r.id, payload: r, updatedAt: r.updatedAt });
  }

  // ── Incremental filter: skip rows already pushed ───────────────────────────
  const changed = cutoff
    ? records.filter((r) => r.updatedAt > cutoff)
    : records;

  // ── Pending delete tombstones ──────────────────────────────────────────────
  const pendingDeletes = await readPendingDeletes(db);

  if (changed.length === 0 && pendingDeletes.length === 0) {
    // Nothing new — still advance the cursor so the overlap window moves on.
    useSyncStore.getState().setLastPushAt(pushStartedAt);
    return;
  }

  const BATCH = 200;
  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = changed.slice(i, i + BATCH);
    const encrypted = await Promise.all(
      batch.map(async (r) => ({
        id:               r.syncId,
        entityType:       r.entityType,
        entityId:         r.entityId,
        encryptedPayload: await encryptRecord(r.payload, dek),
        clientUpdatedAt:  r.updatedAt,
        isDeleted:        false,
      })),
    );
    await syncPush(encrypted);
  }

  // Push tombstones (empty payload + isDeleted per the server contract)
  if (pendingDeletes.length > 0) {
    for (let i = 0; i < pendingDeletes.length; i += BATCH) {
      const batch = pendingDeletes.slice(i, i + BATCH);
      await syncPush(batch.map((d) => ({
        id:               `${SYNC_PREFIX[d.entityType]}_${d.entityId}`,
        entityType:       d.entityType,
        entityId:         d.entityId,
        encryptedPayload: '',
        clientUpdatedAt:  d.deletedAt,
        isDeleted:        true,
      })));
    }
    // All tombstones accepted — clear the queue
    await writePendingDeletes(db, []);
  }

  // Success — advance the incremental cursor
  useSyncStore.getState().setLastPushAt(pushStartedAt);
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export async function pullAndMerge(since?: string | null): Promise<void> {
  const { dek } = useSyncStore.getState();
  if (!dek) return;

  const { records, pulledAt } = await syncPull(since ?? undefined);

  if (!records || records.length === 0) {
    // Nothing new — still advance the cursor (server-authoritative timestamp)
    // so WS-triggered pulls stay cheap instead of re-fetching the same delta.
    if (pulledAt) useSyncStore.getState().setLastSyncAt(pulledAt);
    return;
  }

  // Track successful pull for app review prompt (fire-and-forget)
  trackReviewEvent().catch(() => {});

  const db = getDatabase();

  for (const rec of records as PulledRecord[]) {
    const serverTs = rec.clientUpdatedAt instanceof Date
      ? rec.clientUpdatedAt.toISOString()
      : String(rec.clientUpdatedAt);

    if (rec.isDeleted) {
      await deleteLocal(db, rec.entityType as EntityType, rec.entityId);
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = decryptRecord<Record<string, unknown>>(rec.encryptedPayload, dek);
    } catch {
      console.warn('[sync] Failed to decrypt record', rec.entityType, rec.entityId);
      continue;
    }

    await upsertLocal(db, rec.entityType as EntityType, payload, serverTs);
  }

  // Advance the pull cursor with the server's own timestamp (immune to
  // device clock skew) — every subsequent pull is a true delta.
  if (pulledAt) useSyncStore.getState().setLastSyncAt(pulledAt);

  // Notify screens that new data is available — they watch syncVersion and
  // silently reload their stores without showing skeleton loaders.
  useSyncStore.getState().bumpSyncVersion();
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function fullSync(): Promise<void> {
  const store = useSyncStore.getState();
  if (store.isSyncing) return; // prevent concurrent syncs
  store.setSyncing(true);
  store.setSyncError(null);
  try {
    await pushAll();
    await pullAndMerge(store.lastSyncAt);
    // lastSyncAt is advanced inside pullAndMerge using the server timestamp
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    store.setSyncError(msg);
    // Non-fatal — local data remains intact
  } finally {
    store.setSyncing(false);
  }
}

// ─── Local upsert helpers ─────────────────────────────────────────────────────

type DB = ReturnType<typeof getDatabase>;

async function upsertLocal(
  db: DB,
  entityType: EntityType,
  payload: Record<string, unknown>,
  serverTs: string,
): Promise<void> {
  try {
    switch (entityType) {
      case 'person': {
        const p = payload as typeof schema.persons.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.persons.updatedAt })
          .from(schema.persons).where(eq(schema.persons.id, p.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.persons).values(p)
          .onConflictDoUpdate({ target: schema.persons.id, set: { ...p, updatedAt: serverTs } });
        break;
      }
      case 'debt': {
        const d = payload as typeof schema.debts.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.debts.updatedAt })
          .from(schema.debts).where(eq(schema.debts.id, d.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.debts).values(d)
          .onConflictDoUpdate({ target: schema.debts.id, set: { ...d, updatedAt: serverTs } });
        break;
      }
      case 'repayment': {
        const r = payload as typeof schema.repayments.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.repayments.updatedAt })
          .from(schema.repayments).where(eq(schema.repayments.id, r.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.repayments).values(r)
          .onConflictDoUpdate({ target: schema.repayments.id, set: { ...r, updatedAt: serverTs } });
        break;
      }
    }
  } catch (err) {
    console.warn('[sync] upsertLocal failed', entityType, err);
  }
}

async function deleteLocal(db: DB, entityType: EntityType, entityId: string): Promise<void> {
  try {
    switch (entityType) {
      case 'person':
        await db.delete(schema.persons).where(eq(schema.persons.id, entityId));
        break;
      case 'debt':
        await db.delete(schema.debts).where(eq(schema.debts.id, entityId));
        break;
      case 'repayment':
        await db.delete(schema.repayments).where(eq(schema.repayments.id, entityId));
        break;
    }
  } catch { /* ignore — row may already be gone */ }
}
