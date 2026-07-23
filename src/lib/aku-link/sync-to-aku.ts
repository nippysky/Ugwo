/**
 * sync-to-aku — mirrors Ụgwọ debts/repayments into a connected Akù account
 * as expense/income records, when the user has opted in via Connect Akù.
 *
 * Cash-flow mapping (the direction that matters is which way money moved):
 *   debt 'owed_to_me' logged (you lent money out)      → Akù EXPENSE
 *   debt 'i_owe' logged (you borrowed money)            → Akù INCOME
 *   repayment on an 'owed_to_me' debt (they pay you back) → Akù INCOME
 *   repayment on an 'i_owe' debt (you pay them back)      → Akù EXPENSE
 * Both always use Akù's 'loans' category.
 *
 * Every function here is best-effort and never throws — a failed or skipped
 * mirror (not connected, currency mismatch, offline, DEK missing) must never
 * block or corrupt the primary Ụgwọ ledger write. Callers in ledger.store.ts
 * fire these off after their own local write has already succeeded.
 */
import { encryptRecord } from '../sync/crypto';
import { generateUUID } from '../uuid';
import { pushToAku } from './api-client';
import { useAkuLinkStore } from '../../store/aku-link.store';
import type { AkuEntityType, Debt, DebtDirection, Person, Repayment } from '../../types';

// ─── Direction mapping ────────────────────────────────────────────────────────

function entityTypeForDebt(direction: DebtDirection): AkuEntityType {
  return direction === 'owed_to_me' ? 'expense' : 'income';
}

/** Repayments always flow the opposite way to the debt they settle. */
function entityTypeForRepayment(debtDirection: DebtDirection): AkuEntityType {
  return debtDirection === 'owed_to_me' ? 'income' : 'expense';
}

// ─── Low-level push/delete ────────────────────────────────────────────────────

interface AkuMirrorResult {
  akuEntityId:   string;
  akuEntityType: AkuEntityType;
}

/**
 * The currency check here is deliberately per-entry, not a blanket app-wide
 * flag: Ụgwọ supports logging debts in different currencies, and each debt
 * carries its own `currency` at the time it was entered (independent of
 * whatever the app's current default currency is today). A debt logged in
 * USD must never sync just because the app's default happens to match Akù
 * right now — only entries actually denominated in Akù's currency are safe
 * to mirror. useAkuLinkStore's `currencyMismatch` flag is a separate, coarser
 * signal used only to warn the user in the UI when their *current* default
 * has drifted from Akù's.
 */
async function pushMirror(
  entityType:   AkuEntityType,
  entityId:     string,
  amount:       number,
  category:     'loans',
  description:  string,
  date:         string,
  updatedAt:    string,
  entryCurrency: string,
): Promise<boolean> {
  const { connected, dek, akuUserId, akuCurrencyCode } = useAkuLinkStore.getState();
  if (!connected || !dek || !akuUserId) return false;
  if (!akuCurrencyCode || entryCurrency.toUpperCase() !== akuCurrencyCode.toUpperCase()) return false;

  try {
    const payload = {
      id:          entityId,
      userId:      akuUserId,
      amount,
      category,
      description,
      date,
      createdAt:   updatedAt,
      updatedAt,
    };
    const encryptedPayload = await encryptRecord(payload, dek);
    const prefix = entityType === 'expense' ? 'exp' : 'inc';
    await pushToAku([{
      id:               `${prefix}_${entityId}`,
      entityType,
      entityId,
      encryptedPayload,
      clientUpdatedAt:  updatedAt,
      isDeleted:        false,
    }]);
    return true;
  } catch {
    return false;
  }
}

async function deleteMirror(entityType: AkuEntityType, entityId: string): Promise<void> {
  const { connected, dek } = useAkuLinkStore.getState();
  if (!connected || !dek) return;
  try {
    const prefix = entityType === 'expense' ? 'exp' : 'inc';
    await pushToAku([{
      id:               `${prefix}_${entityId}`,
      entityType,
      entityId,
      encryptedPayload: '',
      clientUpdatedAt:  new Date().toISOString(),
      isDeleted:        true,
    }]);
  } catch { /* best-effort */ }
}

// ─── Debts ────────────────────────────────────────────────────────────────────

/** Push a brand-new Akù mirror for a newly-created debt. */
export async function pushDebtToAku(
  debt: Debt,
  personName: string,
): Promise<AkuMirrorResult | null> {
  const entityType = entityTypeForDebt(debt.direction);
  const akuEntityId = generateUUID();
  const description = debt.direction === 'owed_to_me'
    ? `Loaned to ${personName}`
    : `Borrowed from ${personName}`;

  const ok = await pushMirror(
    entityType, akuEntityId, debt.principal, 'loans', description, debt.incurredOn, debt.updatedAt,
    debt.currency,
  );
  return ok ? { akuEntityId, akuEntityType: entityType } : null;
}

/**
 * Push an edit to an existing debt's Akù mirror. If the direction changed
 * (rare, but the edit form allows it), the entity kind flips — delete the old
 * one and create a fresh one of the opposite type rather than trying to morph
 * an expense into an income in place.
 */
export async function updateAkuEntityForDebt(
  debt: Debt,
  personName: string,
): Promise<AkuMirrorResult | null> {
  const entityType = entityTypeForDebt(debt.direction);

  if (!debt.akuEntityId) {
    // Never synced (created before connecting, or an earlier sync failed) —
    // treat this edit as the first sync attempt.
    return pushDebtToAku(debt, personName);
  }

  if (debt.akuEntityType && debt.akuEntityType !== entityType) {
    // Direction flipped — retire the old mirror, create a new one.
    await deleteMirror(debt.akuEntityType, debt.akuEntityId);
    return pushDebtToAku(debt, personName);
  }

  const description = debt.direction === 'owed_to_me'
    ? `Loaned to ${personName}`
    : `Borrowed from ${personName}`;

  const ok = await pushMirror(
    entityType, debt.akuEntityId, debt.principal, 'loans', description, debt.incurredOn, debt.updatedAt,
    debt.currency,
  );
  return ok ? { akuEntityId: debt.akuEntityId, akuEntityType: entityType } : null;
}

export async function deleteAkuEntityForDebt(debt: Debt): Promise<void> {
  if (!debt.akuEntityId || !debt.akuEntityType) return;
  await deleteMirror(debt.akuEntityType, debt.akuEntityId);
}

// ─── Repayments ───────────────────────────────────────────────────────────────

export async function pushRepaymentToAku(
  repayment: Repayment,
  debt: Debt,
  personName: string,
): Promise<AkuMirrorResult | null> {
  const entityType = entityTypeForRepayment(debt.direction);
  const akuEntityId = generateUUID();
  const description = debt.direction === 'owed_to_me'
    ? `Loan repaid by ${personName}`
    : `Repaid ${personName}`;

  // Repayments don't carry their own currency — they always settle in the
  // same currency the parent debt was logged in.
  const ok = await pushMirror(
    entityType, akuEntityId, repayment.amount, 'loans', description, repayment.paidOn, repayment.updatedAt,
    debt.currency,
  );
  return ok ? { akuEntityId, akuEntityType: entityType } : null;
}

export async function deleteAkuEntityForRepayment(repayment: Repayment): Promise<void> {
  if (!repayment.akuEntityId || !repayment.akuEntityType) return;
  await deleteMirror(repayment.akuEntityType, repayment.akuEntityId);
}

// ─── Bulk sync (retry + backfill share this) ───────────────────────────────────
//
// Both "retry anything that should have synced but didn't" and "backfill my
// existing history" boil down to the same operation: find debts/repayments
// with no Akù mirror yet (akuEntityId is null) and try to push each one. The
// only difference is *which* unlinked rows are eligible:
//   - Retry only considers rows touched at-or-after the connection was made —
//     things Ụgwọ already should have synced as part of normal operation, but
//     which may have failed (offline, transient error, currency mismatch that
//     has since been fixed).
//   - Backfill has no time filter — it deliberately reaches back through all
//     of history, and is only ever run once, explicitly, when the user opts
//     in at connect time (see connect-aku.tsx). Silently backfilling on every
//     retry pass would risk duplicate entries for anyone who already logged
//     these same loans in Akù by hand before connecting.

export interface AkuSyncedLink {
  kind:          'debt' | 'repayment';
  id:            string;
  akuEntityId:   string;
  akuEntityType: AkuEntityType;
}

export interface AkuBulkSyncResult {
  debtsSynced:        number;
  debtsSkipped:       number;
  repaymentsSynced:   number;
  repaymentsSkipped:  number;
  links:              AkuSyncedLink[];
}

const EMPTY_RESULT: AkuBulkSyncResult = {
  debtsSynced: 0, debtsSkipped: 0, repaymentsSynced: 0, repaymentsSkipped: 0, links: [],
};

async function syncUnlinkedEntries(
  debts:       Debt[],
  repayments:  Repayment[],
  persons:     Person[],
  since?:      string,
): Promise<AkuBulkSyncResult> {
  const { connected } = useAkuLinkStore.getState();
  if (!connected) return EMPTY_RESULT;

  const result: AkuBulkSyncResult = { ...EMPTY_RESULT, links: [] };
  const personName = (personId: string) => persons.find((p) => p.id === personId)?.name ?? 'Someone';

  const eligibleDebts = debts.filter((d) => !d.akuEntityId && (!since || d.updatedAt >= since));
  for (const debt of eligibleDebts) {
    const linked = await pushDebtToAku(debt, personName(debt.personId));
    if (linked) {
      result.debtsSynced++;
      result.links.push({ kind: 'debt', id: debt.id, ...linked });
    } else {
      result.debtsSkipped++;
    }
  }

  const eligibleRepayments = repayments.filter((r) => !r.akuEntityId && (!since || r.updatedAt >= since));
  for (const repayment of eligibleRepayments) {
    const debt = debts.find((d) => d.id === repayment.debtId);
    if (!debt) { result.repaymentsSkipped++; continue; }
    const linked = await pushRepaymentToAku(repayment, debt, personName(debt.personId));
    if (linked) {
      result.repaymentsSynced++;
      result.links.push({ kind: 'repayment', id: repayment.id, ...linked });
    } else {
      result.repaymentsSkipped++;
    }
  }

  return result;
}

/**
 * Retry any debt/repayment that should already be synced (created or edited
 * since Connect Akù was turned on) but isn't yet — e.g. it was logged while
 * offline. Safe to call often; already-linked rows are skipped instantly.
 */
export async function retryUnsyncedAkuMirrors(
  debts: Debt[],
  repayments: Repayment[],
  persons: Person[],
): Promise<AkuBulkSyncResult> {
  const { connectedAt } = useAkuLinkStore.getState();
  if (!connectedAt) return EMPTY_RESULT;
  return syncUnlinkedEntries(debts, repayments, persons, connectedAt);
}

/**
 * One-time, explicit backfill of every existing debt/repayment that predates
 * (or was never picked up by) the connection — no time filter. Only ever
 * called when the user opts in, since it can double-count anything they
 * already logged manually in Akù before connecting.
 */
export async function backfillHistoryToAku(
  debts: Debt[],
  repayments: Repayment[],
  persons: Person[],
): Promise<AkuBulkSyncResult> {
  return syncUnlinkedEntries(debts, repayments, persons);
}
