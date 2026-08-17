/**
 * demo-seed.ts — populates the App Store / Play Store review demo account
 * with a realistic ledger on its very first sign-in, so reviewers land on a
 * working app instead of an empty state.
 *
 * Runs exactly once, ever: the server only reports `isNew: true` for the demo
 * account the very first time it's created (see server/src/routes/auth.ts).
 * Every sign-in after that is treated as a normal returning user and pulls
 * these same records back down via the regular sync engine — no duplicates,
 * no re-seeding, and it survives reinstalls/new devices just like real data.
 *
 * DEMO_EMAIL must match the server's DEMO_EMAIL env var exactly.
 */
import { useLedgerStore } from '../store/ledger.store';

export const DEMO_EMAIL = 'demo@nippysky.com';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds a small, realistic ledger for the demo account. Safe to call even if
 * something goes wrong partway — failures are swallowed so a seed error can
 * never block sign-in (worst case the reviewer just sees an empty ledger,
 * which is still a fully functional app).
 */
export async function seedDemoLedgerIfNeeded(userId: string, email: string): Promise<void> {
  if (email.trim().toLowerCase() !== DEMO_EMAIL) return;

  const { addPerson, addDebt, recordRepayment } = useLedgerStore.getState();

  try {
    // Chidinma owes the user — still open, due soon (shows an active,
    // upcoming-due-date debt on Home).
    const chidinma = await addPerson(userId, 'Chidinma Okafor', 'Colleague from work');
    await addDebt({
      userId,
      personId:   chidinma.id,
      direction:  'owed_to_me',
      principal:  4_500_000, // ₦45,000.00 (kobo)
      currency:   'NGN',
      incurredOn: daysAgo(12),
      dueOn:      daysFromNow(3),
      note:       'Lunch money + transport for the conference',
    });

    // Emeka — the user owes Emeka, partially repaid (shows a live balance +
    // repayment history on the person ledger).
    const emeka = await addPerson(userId, 'Emeka Nwosu', 'Landlord');
    const emekaDebt = await addDebt({
      userId,
      personId:   emeka.id,
      direction:  'i_owe',
      principal:  15_000_000, // ₦150,000.00
      currency:   'NGN',
      incurredOn: daysAgo(30),
      dueOn:      daysFromNow(15),
      note:       'Rent top-up for December',
    });
    await recordRepayment({
      userId,
      debtId: emekaDebt.id,
      amount: 5_000_000, // ₦50,000.00 paid so far
      paidOn: daysAgo(5),
      note:   'Partial payment',
    });

    // Blessing — fully settled (shows the closed/settled state + history).
    const blessing = await addPerson(userId, 'Blessing Adeyemi', 'Friend');
    const blessingDebt = await addDebt({
      userId,
      personId:   blessing.id,
      direction:  'owed_to_me',
      principal:  2_000_000, // ₦20,000.00
      currency:   'NGN',
      incurredOn: daysAgo(20),
      dueOn:      daysAgo(6),
      note:       'Data subscription she borrowed for',
    });
    await recordRepayment({
      userId,
      debtId: blessingDebt.id,
      amount: 2_000_000,
      paidOn: daysAgo(6),
      note:   'Paid back in full',
    });
  } catch (err) {
    console.warn('[demo-seed] Failed to seed demo ledger (non-fatal):', err);
  }
}
