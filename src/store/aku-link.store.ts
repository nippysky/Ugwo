/**
 * Akù-link store
 *
 * Tracks the optional, opt-in connection between this Ụgwọ account and the
 * user's own Akù account. When connected, new debts/repayments are mirrored
 * to Akù as expense/income records (see src/lib/aku-link/sync-to-aku.ts).
 *
 * Nothing here touches Ụgwọ's own auth/session/DEK — this is a second,
 * independent identity held entirely in its own SecureStore keys, exactly
 * mirroring how Ụgwọ holds its own JWT + DEK (see auth.store.ts / sync.store.ts).
 *
 * Currency-match gate: syncing only ever runs when Ụgwọ's and Akù's currency
 * codes match. If they diverge (user changes one after connecting), pushes
 * are skipped and `currencyMismatch` flips true so the UI can prompt the user
 * to realign rather than silently writing wrong-currency amounts.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import {
  requestAkuMagicLink,
  verifyAkuOTP,
  getAkuMe,
  fetchAkuDek,
  clearAkuSession,
  revokeAkuSession,
  setAkuSession,
  type AkuUserProfile,
} from '../lib/aku-link/api-client';
import { decodeDEK } from '../lib/sync/crypto';
import { useUIStore } from './ui.store';

// ─── SecureStore keys ─────────────────────────────────────────────────────────

const PROFILE_KEY = 'ugwo_aku_link_profile';
const DEK_KEY      = 'ugwo_aku_link_dek';

interface StoredProfile {
  akuUserId:            string;
  akuName:               string;
  akuEmail:              string;
  akuCurrencyCode:       string | null;
  akuCurrencySymbol:     string | null;
  /** When this connection was established. See connectedAt below. */
  connectedAt:           string;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface AkuLinkState {
  isLoaded:  boolean;
  connected: boolean;

  akuUserId:         string | null;
  akuName:           string | null;
  akuEmail:          string | null;
  akuCurrencyCode:   string | null;
  akuCurrencySymbol: string | null;
  /**
   * When this connection was established. Only debts/repayments touched at
   * or after this moment are eligible for automatic background retry — older
   * history is deliberately left alone unless the user explicitly runs a
   * one-time backfill (see sync-to-aku.ts / the Connect Akù screen).
   */
  connectedAt: string | null;

  /** 32-byte AES key for the Akù account — in memory only. */
  dek: Uint8Array | null;

  /** True when Ụgwọ's and Akù's currencies have diverged since connecting. */
  currencyMismatch: boolean;

  isConnecting: boolean;
  error:        string | null;

  // Actions
  /** Load any previously-connected state from SecureStore. Call at app init. */
  init: () => Promise<void>;
  /** Step 1 of connecting — send the OTP email via Akù's own API. */
  requestOtp: (email: string) => Promise<void>;
  /** Step 2 — verify the OTP, fetch the Akù DEK, and complete the connection. */
  confirmOtp: (email: string, otp: string) => Promise<void>;
  /** Disconnect — wipes the Akù session/DEK from this device. Akù account itself is untouched. */
  disconnect: () => Promise<void>;
  /** Re-check currency alignment against Ụgwọ's current currency. */
  refreshCurrencyMatch: () => void;
  clearError: () => void;
}

function currenciesMatch(ugwoCode: string, akuCode: string | null): boolean {
  if (!akuCode) return false; // Akù has no currency set yet — treat as incompatible
  return ugwoCode.toUpperCase() === akuCode.toUpperCase();
}

export const useAkuLinkStore = create<AkuLinkState>()((set, get) => ({
  isLoaded:  false,
  connected: false,

  akuUserId:         null,
  akuName:           null,
  akuEmail:          null,
  akuCurrencyCode:   null,
  akuCurrencySymbol: null,
  connectedAt:       null,

  dek: null,

  currencyMismatch: false,
  isConnecting:     false,
  error:            null,

  init: async () => {
    try {
      const [profileJson, dekHex] = await Promise.all([
        SecureStore.getItemAsync(PROFILE_KEY),
        SecureStore.getItemAsync(DEK_KEY),
      ]);

      if (!profileJson || !dekHex) {
        set({ isLoaded: true });
        return;
      }

      const profile = JSON.parse(profileJson) as StoredProfile;
      const ugwoCode = useUIStore.getState().currency.code;

      set({
        connected:         true,
        akuUserId:         profile.akuUserId,
        akuName:           profile.akuName,
        akuEmail:          profile.akuEmail,
        akuCurrencyCode:   profile.akuCurrencyCode,
        akuCurrencySymbol: profile.akuCurrencySymbol,
        // Older connections created before this field existed won't have it —
        // fall back to "now" so they don't retroactively unlock auto-retry
        // over their entire history.
        connectedAt:       profile.connectedAt ?? new Date().toISOString(),
        dek:               decodeDEK(dekHex),
        currencyMismatch:  !currenciesMatch(ugwoCode, profile.akuCurrencyCode),
        isLoaded:          true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  requestOtp: async (email: string) => {
    set({ isConnecting: true, error: null });
    try {
      await requestAkuMagicLink(email.trim().toLowerCase());
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Couldn't reach Akù. Please try again." });
      throw err;
    } finally {
      set({ isConnecting: false });
    }
  },

  confirmOtp: async (email: string, otp: string) => {
    set({ isConnecting: true, error: null });
    try {
      const { jwt, user } = await verifyAkuOTP(email.trim().toLowerCase(), otp.trim());
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await setAkuSession({ accessToken: jwt, expiresAt });

      // Fetch (or wait for) the Akù DEK. A brand-new Akù account may not have
      // completed PIN setup yet, in which case there's no DEK to fetch — in
      // that case we can't encrypt anything for it yet, so surface a clear
      // message rather than connecting in a half-working state.
      const dekHex = await fetchAkuDek();
      if (!dekHex) {
        await clearAkuSession();
        throw new Error(
          'Your Akù account needs a PIN set up first — open Akù, finish setup, then try connecting again.',
        );
      }

      const profile: StoredProfile = {
        akuUserId:         user.id,
        akuName:           user.name,
        akuEmail:          user.email,
        akuCurrencyCode:   user.preferredCurrencyCode ?? null,
        akuCurrencySymbol: user.preferredCurrencySymbol ?? null,
        connectedAt:       new Date().toISOString(),
      };

      await Promise.all([
        SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile)),
        SecureStore.setItemAsync(DEK_KEY, dekHex),
      ]);

      const ugwoCode = useUIStore.getState().currency.code;

      set({
        connected:         true,
        akuUserId:         profile.akuUserId,
        akuName:           profile.akuName,
        akuEmail:          profile.akuEmail,
        akuCurrencyCode:   profile.akuCurrencyCode,
        akuCurrencySymbol: profile.akuCurrencySymbol,
        connectedAt:       profile.connectedAt,
        dek:               decodeDEK(dekHex),
        currencyMismatch:  !currenciesMatch(ugwoCode, profile.akuCurrencyCode),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Could not verify that code. Please try again.' });
      throw err;
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: async () => {
    void revokeAkuSession();
    await clearAkuSession();
    try {
      await SecureStore.deleteItemAsync(PROFILE_KEY);
      await SecureStore.deleteItemAsync(DEK_KEY);
    } catch { /* ignore */ }
    set({
      connected:         false,
      akuUserId:         null,
      akuName:           null,
      akuEmail:          null,
      akuCurrencyCode:   null,
      akuCurrencySymbol: null,
      connectedAt:       null,
      dek:               null,
      currencyMismatch:  false,
      error:             null,
    });
  },

  refreshCurrencyMatch: () => {
    const { connected, akuCurrencyCode } = get();
    if (!connected) return;
    const ugwoCode = useUIStore.getState().currency.code;
    set({ currencyMismatch: !currenciesMatch(ugwoCode, akuCurrencyCode) });
  },

  clearError: () => set({ error: null }),
}));

/**
 * Best-effort refresh of the connected Akù account's profile (name/currency),
 * e.g. if the user changed their currency inside Akù itself. Safe to call
 * fire-and-forget; never throws.
 */
export async function refreshAkuProfile(): Promise<void> {
  const { connected, connectedAt } = useAkuLinkStore.getState();
  if (!connected) return;
  try {
    const profile = await getAkuMe();
    const stored: StoredProfile = {
      akuUserId:         profile.id,
      akuName:           profile.name,
      akuEmail:          profile.email,
      akuCurrencyCode:   profile.preferredCurrencyCode ?? null,
      akuCurrencySymbol: profile.preferredCurrencySymbol ?? null,
      // Refreshing the profile must never reset the retry-eligibility
      // boundary — fall back to "now" only in the pathological case where
      // it was somehow missing (shouldn't happen while connected is true).
      connectedAt:       connectedAt ?? new Date().toISOString(),
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(stored));
    const ugwoCode = useUIStore.getState().currency.code;
    useAkuLinkStore.setState({
      akuName:           stored.akuName,
      akuEmail:          stored.akuEmail,
      akuCurrencyCode:   stored.akuCurrencyCode,
      akuCurrencySymbol: stored.akuCurrencySymbol,
      currencyMismatch:  !currenciesMatch(ugwoCode, stored.akuCurrencyCode),
    });
  } catch { /* non-fatal — retried on next app open */ }
}
