/**
 * Shared helpers for ledger components.
 */
import { todayStr } from '../../lib/debt-math';
import { friendlyDate } from '../../lib/reminder-message';

export { todayStr };

/** '2026-07-20' → 'Today' | '14 June' — for compact date buttons. */
export function friendlyDateInput(dateStr: string): string {
  if (dateStr === todayStr()) return 'Today';
  return friendlyDate(dateStr);
}
