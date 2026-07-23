/**
 * Akù-link API client
 *
 * Ụgwọ becomes an additional authenticated client of Akù's own public API —
 * there is no new server-side code on either backend. This file is a small,
 * self-contained twin of ../api-client.ts, pointed at Akù's server instead of
 * Ụgwọ's, using its own SecureStore session key so the two identities never
 * collide.
 *
 * Flow: magic-link/OTP against Akù's API → Akù JWT → GET /api/user/dek (Akù's
 * own DEK) → POST /api/sync/push new expense/income records, encrypted with
 * that DEK using the exact same AES-256-GCM scheme as ../sync/crypto.ts
 * (byte-for-byte identical between the two apps).
 */
import * as SecureStore from 'expo-secure-store';

// ─── Config ───────────────────────────────────────────────────────────────────

export const AKU_SESSION_KEY = 'ugwo_aku_link_session';

function getAkuBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_AKU_API_URL;
  if (!url) return 'https://aku.nippysky.com';
  return url.replace(/\/$/, '');
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class AkuApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AkuApiError';
  }
}

// ─── Session ──────────────────────────────────────────────────────────────────

interface AkuSession {
  accessToken: string;
  expiresAt:   string;
}

export async function getAkuSession(): Promise<AkuSession | null> {
  try {
    const json = await SecureStore.getItemAsync(AKU_SESSION_KEY);
    if (!json) return null;
    return JSON.parse(json) as AkuSession;
  } catch {
    return null;
  }
}

export async function setAkuSession(session: AkuSession): Promise<void> {
  await SecureStore.setItemAsync(AKU_SESSION_KEY, JSON.stringify(session));
}

export async function clearAkuSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AKU_SESSION_KEY);
  } catch { /* ignore */ }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

type FetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?:   object;
  noAuth?: boolean;
};

async function akuFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, noAuth = false } = opts;

  const headers: Record<string, string> = {};

  if (!noAuth) {
    const session = await getAkuSession();
    if (session?.accessToken) headers['Authorization'] = `Bearer ${session.accessToken}`;
  }

  let fetchBody: BodyInit | undefined;
  if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(`${getAkuBaseUrl()}${path}`, { method, headers, body: fetchBody });

  let data: T;
  try {
    data = await res.json() as T;
  } catch {
    throw new AkuApiError(res.status, `Akù returned a non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Request to Akù failed (${res.status})`;
    throw new AkuApiError(res.status, msg);
  }

  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function requestAkuMagicLink(email: string): Promise<void> {
  await akuFetch('/api/auth/magic-link', { method: 'POST', body: { email }, noAuth: true });
}

export interface AkuUserProfile {
  id:    string;
  name:  string;
  email: string;
  preferredCurrencyCode?:   string | null;
  preferredCurrencySymbol?: string | null;
}

export async function verifyAkuOTP(
  email: string,
  otp:   string,
): Promise<{ jwt: string; user: AkuUserProfile; isNew: boolean }> {
  return akuFetch<{ jwt: string; user: AkuUserProfile; isNew: boolean }>(
    '/api/auth/magic-link/verify-otp',
    { method: 'POST', body: { email, otp }, noAuth: true },
  );
}

export async function getAkuMe(): Promise<AkuUserProfile & { createdAt: string }> {
  return akuFetch('/api/user/me');
}

export async function revokeAkuSession(): Promise<void> {
  try {
    await akuFetch('/api/auth/session', { method: 'DELETE' });
  } catch { /* best-effort */ }
}

// ─── DEK ──────────────────────────────────────────────────────────────────────

/** Fetch the connected Akù account's DEK (hex). Null = no DEK stored yet. */
export async function fetchAkuDek(): Promise<string | null> {
  const res = await akuFetch<{ dek: string | null }>('/api/user/dek');
  return res.dek;
}

// ─── Sync push ────────────────────────────────────────────────────────────────

export type AkuSyncPushRecord = {
  id:               string;
  entityType:       'expense' | 'income';
  entityId:         string;
  encryptedPayload: string;
  clientUpdatedAt:  string;
  isDeleted:        boolean;
};

export async function pushToAku(
  records: AkuSyncPushRecord[],
): Promise<{ pushed: number; serverUpdatedAt: string }> {
  return akuFetch('/api/sync/push', { method: 'POST', body: { records } });
}
