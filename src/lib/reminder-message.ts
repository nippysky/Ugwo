/**
 * reminder-message.ts — the face-saving reminder composer.
 *
 * Ụgwọ's growth loop: every reminder is a polite, dignified message shared
 * through the OS share sheet, signed "via Ụgwọ". It protects the
 * relationship first and the money second.
 */
import { Share } from 'react-native';
import { formatAmount } from './format';
import type { DebtWithBalance } from '../types';

// ─── Date formatting ──────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-06-14' → '14 June' (year appended only when it isn't this year). */
export function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const thisYear = new Date().getFullYear();
  const base = `${d} ${MONTHS[(m ?? 1) - 1]}`;
  return y === thisYear ? base : `${base} ${y}`;
}

// ─── Message composition ──────────────────────────────────────────────────────

/**
 * Compose a polite reminder for money owed TO the user.
 * First name only — the message goes straight to the person.
 */
export function composeReminder(
  personName: string,
  debt: DebtWithBalance,
  currencySymbol: string,
): string {
  const firstName = personName.trim().split(/\s+/)[0];
  const amount    = formatAmount(debt.outstanding, currencySymbol);
  const from      = friendlyDate(debt.incurredOn);

  const lines = [
    `Hi ${firstName}, gentle reminder about the outstanding ${amount} from ${from}.`,
  ];

  if (debt.dueOn) {
    lines[0] = `Hi ${firstName}, gentle reminder about the outstanding ${amount} from ${from}, due ${friendlyDate(debt.dueOn)}.`;
  }

  if (debt.repaid > 0) {
    lines.push(`(${formatAmount(debt.repaid, currencySymbol)} already repaid — thank you!)`);
  }

  lines.push('Thank you 🙏');
  return lines.join(' ');
}

/**
 * Compose a heads-up message for money the user OWES — offering to settle.
 */
export function composeIOweMessage(
  personName: string,
  debt: DebtWithBalance,
  currencySymbol: string,
): string {
  const firstName = personName.trim().split(/\s+/)[0];
  const amount    = formatAmount(debt.outstanding, currencySymbol);
  const from      = friendlyDate(debt.incurredOn);

  return (
    `Hi ${firstName}, I haven't forgotten the ${amount} from ${from}. ` +
    `I'll settle it as soon as I can — thank you for your patience 🙏`
  );
}

// ─── Share sheet ──────────────────────────────────────────────────────────────

/**
 * Open the OS share sheet with the composed message.
 * The "via Ụgwọ" signature is the growth loop — quiet, not pushy.
 */
export async function shareReminder(message: string): Promise<boolean> {
  try {
    const result = await Share.share({
      message: `${message}\n\n— sent via Ụgwọ · ugwo.nippysky.com`,
    });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
