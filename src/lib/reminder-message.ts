/**
 * reminder-message.ts — the face-saving reminder composer.
 *
 * Ụgwọ's growth loop: every reminder is a polite, dignified message shared
 * through the OS share sheet, signed "via Ụgwọ". It protects the
 * relationship first and the money second.
 *
 * Craft notes (WhatsApp-first, since that's where these messages live):
 *   · *asterisks* render as bold in WhatsApp — used ONLY around the amount,
 *     so the key fact pops without the message shouting.
 *   · Short lines, one warm opener, one plain fact, one soft close.
 *     Never "you owe me" — always "the ₦X from June" (the debt is the
 *     subject, not the person).
 *   · Variants are picked by a stable hash of the debt id: the same debt
 *     always produces the same message (safe to re-send), different debts
 *     feel personally written.
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

// ─── Variant selection ────────────────────────────────────────────────────────

function pick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
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
  const amount    = `*${formatAmount(debt.outstanding, currencySymbol)}*`;
  const from      = friendlyDate(debt.incurredOn);
  const due       = debt.dueOn ? friendlyDate(debt.dueOn) : null;

  const opener = pick(debt.id, [
    `Hey ${firstName}, hope you're doing great! 😊`,
    `Hi ${firstName}, hope you're good 🙂`,
    `Hey ${firstName} ✋, hope all's well with you`,
    `Hi ${firstName}, hope things are good on your end 😊`,
  ]);

  const fact = due
    ? pick(debt.id + 'f', [
        `Just a quick one — the ${amount} from ${from} is due ${due}.`,
        `Small reminder: that ${amount} from ${from} is due ${due}.`,
        `Quick heads-up — the ${amount} from ${from} is due around ${due}.`,
      ])
    : pick(debt.id + 'f', [
        `Just a quick one about the ${amount} from ${from} — still outstanding on my end.`,
        `Small reminder about the ${amount} from ${from}, whenever you get a chance.`,
        `Quick heads-up — the ${amount} from ${from} is still open.`,
      ]);

  const partPaid = debt.repaid > 0
    ? `(Thanks again for the ${formatAmount(debt.repaid, currencySymbol)} you already sent 🙌)`
    : null;

  const close = pick(debt.id + 'c', [
    `Whenever you're able to sort it, no pressure at all — thank you 🙏`,
    `No rush, just didn't want it to slip either of our minds. Thanks a lot 🙏`,
    `Take your time — just a friendly heads-up. Really appreciate you 🙏`,
    `Would mean a lot if we could close this out whenever you can. Thank you 🙏`,
  ]);

  return [opener, '', fact, partPaid, '', close]
    .filter((l) => l !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Compose a heads-up message for money the user OWES — honouring the debt
 * before being asked. The classiest message in the app.
 */
export function composeIOweMessage(
  personName: string,
  debt: DebtWithBalance,
  currencySymbol: string,
): string {
  const firstName = personName.trim().split(/\s+/)[0];
  const amount    = `*${formatAmount(debt.outstanding, currencySymbol)}*`;
  const from      = friendlyDate(debt.incurredOn);

  return pick(debt.id, [
    `Hey ${firstName} 😊\n\nI haven't forgotten the ${amount} from ${from} — still very much on my mind, and I'll settle it as soon as I can.\n\nThanks so much for your patience 🙏`,
    `Hi ${firstName}, hope you're well 🙂\n\nJust wanted to say — the ${amount} from ${from} hasn't slipped my mind. I'll get it sorted soon.\n\nReally appreciate you bearing with me 🙏`,
    `Hey ${firstName} ✋\n\nQuick one — I still owe you the ${amount} from ${from}, and I'm on it. Should have you sorted soon.\n\nThanks for being patient with me 🙏`,
  ]);
}

// ─── Share sheet ──────────────────────────────────────────────────────────────

/**
 * Open the OS share sheet with the composed message.
 * The "via Ụgwọ" signature is the growth loop — quiet, not pushy.
 */
export async function shareReminder(message: string): Promise<boolean> {
  try {
    const result = await Share.share({
      message: `${message}\n\n_sent via Ụgwọ · ugwo.nippysky.com_`,
    });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
