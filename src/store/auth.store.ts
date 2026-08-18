import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { eq } from 'drizzle-orm';
import {
  requestMagicLink,
  validateSession,
  revokeSession,
  getMe,
  fetchDek,
  uploadDek,
  deleteAccount as deleteAccountApi,
  updateCurrencyPreference,
  getFriendlyErrorMessage,
  type UserProfile,
} from '../lib/api-client';
import { getDatabase, schema } from '../lib/database/client';
import { generateDEK, encodeDEK, decodeDEK } from '../lib/sync/crypto';
import { useSyncStore } from './sync.store';
import type { User, AuthSession, BiometricConfig } from '../types';

// ─── Cross-store reset helper ─────────────────────────────────────────────────
// Imported lazily to avoid circular dependencies at module parse time.
function resetAllDataStores() {
  const { useLedgerStore } = require('./ledger.store');
  useLedgerStore.setState({
    persons: [], debts: [], repayments: [],
    isLoading: false, isLoaded: false, error: null,
  });
}

// ─── Keys ─────────────────────────────────────────────────────────────────
const KEYS = {
  SESSION:   'ugwo_session',
  BIOMETRIC: 'ugwo_biometric',
  USER:      'ugwo_user',
  ONBOARDED: 'ugwo_onboarded',  // persists across restarts
} as const;

// ─── First-launch sentinel ────────────────────────────────────────────────
// iOS Keychain (backing SecureStore) survives app deletion — the app sandbox
// (including this file) does not. If this file is missing on a cold start,
// it means either (a) truly first-ever launch, or (b) the app was deleted and
// reinstalled, leaving a stale session in the Keychain. Either way, any
// SecureStore auth data at that point is untrustworthy and must be purged so
// "delete the app" behaves like a real sign-out, not a silent auto-login.
const FIRST_LAUNCH_SENTINEL = `${FileSystem.documentDirectory ?? ''}.ugwo_installed`;

async function purgeStaleKeychainSessionIfReinstalled(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(FIRST_LAUNCH_SENTINEL);
    if (info.exists) return;

    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);
    try {
      await useSyncStore.getState().clearDek();
    } catch { /* non-fatal — DEK store may not be ready yet */ }

    await FileSystem.writeAsStringAsync(FIRST_LAUNCH_SENTINEL, String(Date.now()));
  } catch {
    // FileSystem unavailable — fail open rather than block app startup.
  }
}

// ─── State ────────────────────────────────────────────────────────────────

interface AuthState {
  // Data
  user:         User | null;
  session:      AuthSession | null;
  biometric:    BiometricConfig;
  isLocked:     boolean;
  hasOnboarded: boolean;

  // Status
  isLoading:     boolean;
  isInitialized: boolean;
  error:         string | null;

  // Actions — Auth
  initialize:         () => Promise<void>;
  signIn:             (email: string, name?: string, intent?: 'sign-in' | 'sign-up') => Promise<void>;
  handleAuthCallback: (jwt: string, user: UserProfile) => Promise<void>;
  signOut:            () => Promise<void>;
  /**
   * Permanently delete this account on the server (cascades all data via
   * PostgreSQL), then wipe all local SQLite tables and SecureStore.
   */
  deleteAccount:      () => Promise<void>;
  updateUser:         (patch: Partial<User>) => void;
  /**
   * Atomically marks onboarding complete AND unlocks in a single Zustand set().
   * Avoids the nav-guard seeing hasOnboarded:true + isLocked:true as two
   * separate updates — on Android that intermediate state triggers a stray redirect.
   */
  completeOnboardingAndUnlock: () => Promise<void>;
  markOnboardingComplete:      () => Promise<void>;
  /** Pull the latest profile (name) from the server. Called on WS sync push. */
  refreshProfile:     () => Promise<void>;

  // Actions — Device security
  /** Ensures the DEK exists (Keychain → server → generate). Runs during onboarding. */
  setupDeviceSecurity:  () => Promise<void>;
  /** System auth sheet: biometric first, device PIN/pattern fallback. */
  unlockWithDeviceAuth: () => Promise<boolean>;

  // Actions — Biometric
  setupBiometric:   () => Promise<boolean>;
  disableBiometric: () => Promise<void>;

  // Actions — Lock
  lock:   () => void;
  unlock: () => void;

  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set, get) => ({
  user:          null,
  session:       null,
  biometric:     { enabled: false, type: 'none' },
  isLocked:      true,
  hasOnboarded:  false,
  isLoading:     false,
  isInitialized: false,
  error:         null,

  // ── Initialize: load persisted session + biometric config on app start ──
  initialize: async () => {
    try {
      set({ isLoading: true });

      await purgeStaleKeychainSessionIfReinstalled();

      const [sessionJson, userJson, biometricJson, onboardedStr] = await Promise.all([
        SecureStore.getItemAsync(KEYS.SESSION),
        SecureStore.getItemAsync(KEYS.USER),
        SecureStore.getItemAsync(KEYS.BIOMETRIC),
        SecureStore.getItemAsync(KEYS.ONBOARDED),
      ]);

      const session: AuthSession | null = sessionJson ? JSON.parse(sessionJson) : null;
      let user: User | null = userJson ? JSON.parse(userJson) : null;
      const biometric: BiometricConfig = biometricJson
        ? JSON.parse(biometricJson)
        : { enabled: false, type: 'none' };
      const hasOnboarded = onboardedStr === 'true';

      // Local expiry check first (avoids a network round-trip on cold start)
      const locallyValid = session ? new Date(session.expiresAt) > new Date() : false;

      if (!locallyValid) {
        set({ user: null, session: null, biometric, hasOnboarded, isLocked: false, isInitialized: true });
        return;
      }

      // Validate against the API to catch server-side revocations.
      try {
        const profile = await validateSession();
        if (!profile) {
          await Promise.all([
            SecureStore.deleteItemAsync(KEYS.SESSION),
            SecureStore.deleteItemAsync(KEYS.USER),
          ]);
          set({ user: null, session: null, biometric, hasOnboarded, isLocked: false, isInitialized: true });
          return;
        }
        user = {
          id:        profile.id,
          name:      profile.name,
          email:     profile.email,
          createdAt: user?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Currency preference is server-authoritative once set — keeps this
        // device in sync if it was changed elsewhere.
        if (profile.preferredCurrencyCode && profile.preferredCurrencySymbol) {
          const { useUIStore } = require('./ui.store');
          useUIStore.getState().hydrateCurrencyFromServer(
            profile.preferredCurrencyCode,
            profile.preferredCurrencySymbol,
          );
        }
        // Reconcile Connect-Akù state across devices — see aku-link.store.ts.
        const { useAkuLinkStore } = require('./aku-link.store');
        useAkuLinkStore.getState().hydrateFromServer(profile.akuLinkedEmail ?? null);

        await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
      } catch {
        // Network unavailable — trust the local cache
      }

      // Upsert to SQLite so queries can resolve the user's name.
      if (user) {
        const db  = getDatabase();
        const now = new Date().toISOString();
        try {
          await db.insert(schema.users).values({
            id: user.id, name: user.name, email: user.email,
            createdAt: now, updatedAt: now,
          });
        } catch {
          try {
            await db.update(schema.users)
              .set({ name: user.name, updatedAt: now })
              .where(eq(schema.users.id, user.id));
          } catch { /* ignore */ }
        }
      }

      const willBeLocked = hasOnboarded && locallyValid && biometric.enabled;

      set({
        user,
        session,
        biometric,
        hasOnboarded,
        isLocked:      willBeLocked,
        isInitialized: true,
      });

      // ── Warm the sync layer ────────────────────────────────────────────
      await useSyncStore.getState().loadLastSyncAt();

      // If the app starts UNLOCKED (App Lock off, or no enrolled device
      // security), no unlock flow will ever run — so load the DEK and kick
      // off sync here. Locked starts load the DEK in unlockWithDeviceAuth().
      if (!willBeLocked && hasOnboarded && user) {
        void useSyncStore.getState().loadDek().then((loaded) => {
          if (loaded) {
            import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
          }
        });
      }
    } catch {
      set({ isInitialized: true, isLocked: false });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Sign In: request a magic link email via the server ────────────────
  signIn: async (email: string, name?: string, intent?: 'sign-in' | 'sign-up') => {
    set({ isLoading: true, error: null });
    try {
      await requestMagicLink(email, name, intent);
      // The user checks their email and taps the magic link (or types the
      // OTP). The deep link opens the app and calls handleAuthCallback().
    } catch (err) {
      set({ error: getFriendlyErrorMessage(err, 'Could not send the sign-in email. Please try again.') });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Handle Auth Callback: called when the magic link deep link arrives ─
  handleAuthCallback: async (jwt: string, profile: UserProfile) => {
    const now = new Date();
    // Parse expiry from JWT claims (or default to 30 days)
    let expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const parts  = jwt.split('.');
      const claims = JSON.parse(atob(parts[1])) as { exp?: number };
      if (claims.exp) expiresAt = new Date(claims.exp * 1000).toISOString();
    } catch { /* use default */ }

    const user: User = {
      id:        profile.id,
      name:      profile.name,
      email:     profile.email,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const session: AuthSession = {
      userId:      profile.id,
      accessToken: jwt,
      expiresAt,
    };

    await Promise.all([
      SecureStore.setItemAsync(KEYS.USER,    JSON.stringify(user)),
      SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(session)),
    ]);

    // Upsert to SQLite
    const db  = getDatabase();
    const iso = now.toISOString();
    try {
      await db.insert(schema.users).values({
        id: user.id, name: user.name, email: user.email,
        createdAt: iso, updatedAt: iso,
      });
    } catch {
      try {
        await db.update(schema.users)
          .set({ name: user.name, updatedAt: iso })
          .where(eq(schema.users.id, user.id));
      } catch { /* ignore */ }
    }

    // Locked = true so device-security setup runs before entering the app
    set({ user, session, isLocked: true });

    // ── Currency preference reconciliation ────────────────────────────────
    const { useUIStore } = require('./ui.store');
    if (profile.preferredCurrencyCode && profile.preferredCurrencySymbol) {
      useUIStore.getState().hydrateCurrencyFromServer(
        profile.preferredCurrencyCode,
        profile.preferredCurrencySymbol,
      );
    } else {
      const localCurrency = useUIStore.getState().currency;
      updateCurrencyPreference(localCurrency.code, localCurrency.symbol).catch(() => {});
    }

    // ── Connect-Akù reconciliation ──────────────────────────────────────────
    // A different device may already have connected Akù for this account —
    // surface that here instead of showing a blank "Connect Akù" prompt.
    const { useAkuLinkStore } = require('./aku-link.store');
    useAkuLinkStore.getState().hydrateFromServer(profile.akuLinkedEmail ?? null);
  },

  // ── Sign Out — full wipe so nav guard lands on onboarding ──────────────
  signOut: async () => {
    void revokeSession();

    // Cancel all locally scheduled reminders — they belong to this account
    void (async () => {
      try {
        const { notificationService } = require('../lib/notifications');
        await notificationService.cancelAll();
      } catch { /* non-critical */ }
    })();

    void useSyncStore.getState().clearDek();
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);
    resetAllDataStores();
    set({
      user:         null,
      session:      null,
      isLocked:     false,
      hasOnboarded: false,
      biometric:    { enabled: false, type: 'none' },
      error:        null,
    });
  },

  // ── Delete Account — nuclear: server + local wipe ────────────────────
  deleteAccount: async () => {
    // STEP 1: Delete on server (BLOCKING — must succeed before local wipe)
    await deleteAccountApi();

    // STEP 2: Disconnect WebSocket so no sync fires after wipe
    void (async () => {
      try {
        const { wsClient } = require('../lib/sync/ws-client');
        wsClient.disconnect();
      } catch { /* non-critical */ }
    })();

    // STEP 3: Wipe ALL local SQLite tables — children before parents
    try {
      const db = getDatabase();
      await db.delete(schema.repayments);
      await db.delete(schema.debts);
      await db.delete(schema.persons);
      await db.delete(schema.notifications);
      await db.delete(schema.appState);
      await db.delete(schema.users);
    } catch { /* server already deleted — local wipe is best-effort */ }

    // STEP 4: Cancel local notifications + clear SecureStore + DEK
    void (async () => {
      try {
        const { notificationService } = require('../lib/notifications');
        await notificationService.cancelAll();
      } catch { /* non-critical */ }
    })();
    void useSyncStore.getState().clearDek();
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);

    // STEP 5: Reset data stores + auth state → nav guard routes to onboarding
    resetAllDataStores();
    set({
      user:         null,
      session:      null,
      isLocked:     false,
      hasOnboarded: false,
      biometric:    { enabled: false, type: 'none' },
      error:        null,
    });
  },

  // ── Update User ────────────────────────────────────────────────────────
  updateUser: (patch) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    set({ user: updated });
    SecureStore.setItemAsync(KEYS.USER, JSON.stringify(updated)).catch(() => {});
  },

  // ── Refresh Profile from Server ────────────────────────────────────────
  // Called when a WS "sync" nudge arrives from another device (e.g. the name
  // was changed there). Must write through to SecureStore as well as SQLite —
  // initialize() reads KEYS.USER from SecureStore on cold start, so skipping
  // it here would mean a fully offline relaunch shows the stale cached name
  // even though SQLite already has the fresh one.
  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const profile = await getMe();
      const db  = getDatabase();
      const now = new Date().toISOString();
      await db.update(schema.users)
        .set({ name: profile.name, updatedAt: now })
        .where(eq(schema.users.id, user.id));
      const updated = { ...user, name: profile.name, updatedAt: now };
      set({ user: updated });
      await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(updated));
    } catch { /* Non-fatal — profile refreshes on next app open */ }
  },

  // ── Mark onboarding complete ───────────────────────────────────────────
  markOnboardingComplete: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true });
  },

  completeOnboardingAndUnlock: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true, isLocked: false });
  },

  // ── Setup device security ─────────────────────────────────────────────
  //
  // The app lock is the DEVICE's own security (biometrics / PIN / pattern) —
  // there is no app-specific passcode. The DEK is a random 32-byte key
  // generated once per account and stored on the server (encrypted at rest):
  //   - New device: auth via email → fetch DEK → done.
  //   - New account: no DEK anywhere → generate → upload.
  //
  setupDeviceSecurity: async () => {
    const { user } = get();
    if (!user) throw new Error('setupDeviceSecurity called without a logged-in user');

    const syncStore = useSyncStore.getState();
    const alreadyLoaded = await syncStore.loadDek();

    if (alreadyLoaded) {
      // DEK already in Keychain. Opportunistically ensure it's on the server
      // (covers the edge case where the initial upload failed).
      void uploadDek(encodeDEK(useSyncStore.getState().dek!)).catch(() => {});
      return;
    }

    // No DEK in Keychain — try the server first (returning user, new device).
    let dekHex: string | null = null;
    try {
      dekHex = await fetchDek();
    } catch (err) {
      console.warn('[setupDeviceSecurity] fetchDek failed (will generate fresh):', err);
    }

    if (dekHex) {
      try {
        await syncStore.setDek(decodeDEK(dekHex));
      } catch (err) {
        console.error('[setupDeviceSecurity] Failed to save server DEK to Keychain:', err);
        throw err;
      }
    } else {
      // Brand-new account — generate a random DEK.
      const newDek = await generateDEK();
      try {
        await syncStore.setDek(newDek);
      } catch (err) {
        console.error('[setupDeviceSecurity] Failed to save generated DEK to Keychain:', err);
        throw err;
      }
      try {
        await uploadDek(encodeDEK(newDek));
      } catch (err) {
        console.warn('[setupDeviceSecurity] uploadDek failed (non-fatal):', err);
      }
    }
  },

  // ── Unlock with device auth ───────────────────────────────────────────
  unlockWithDeviceAuth: async () => {
    const finishUnlock = () => {
      set({ isLocked: false });
      void useSyncStore.getState().loadDek().then((loaded) => {
        if (loaded) {
          import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
        }
      });
    };

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = hasHardware && (await LocalAuthentication.isEnrolledAsync());

      if (!isEnrolled) {
        // No device lock set up — open freely (data still E2E encrypted
        // server-side; a device without a lock screen is inherently open).
        finishUnlock();
        return true;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:         'Unlock Ụgwọ',
        cancelLabel:           'Cancel',
        disableDeviceFallback: false, // biometric → device PIN/pattern fallback
      });

      if (result.success) {
        finishUnlock();
        return true;
      }
      return false;
    } catch {
      // Hardware/OS error — never brick the app over the lock screen
      finishUnlock();
      return true;
    }
  },

  // ── Setup Biometric ───────────────────────────────────────────────────
  setupBiometric: async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFaceId = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    );

    const config: BiometricConfig = {
      enabled: true,
      type: hasFaceId ? 'faceId' : 'fingerprint',
    };

    await SecureStore.setItemAsync(KEYS.BIOMETRIC, JSON.stringify(config));
    set({ biometric: config });
    return true;
  },

  // ── Disable Biometric ─────────────────────────────────────────────────
  disableBiometric: async () => {
    const config: BiometricConfig = { enabled: false, type: 'none' };
    await SecureStore.setItemAsync(KEYS.BIOMETRIC, JSON.stringify(config));
    set({ biometric: config });
  },

  // ── Lock / Unlock ─────────────────────────────────────────────────────
  lock:   () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),

  clearError: () => set({ error: null }),
}));
