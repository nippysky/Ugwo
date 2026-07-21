/**
 * User profile routes (all protected)
 *
 * GET    /api/user/me       — Get current user's profile
 * PUT    /api/user/me       — Update name
 * PUT    /api/user/currency — Set preferred currency (persists across devices)
 * GET    /api/user/dek      — Fetch the user's DEK (decrypted) — new-device restore
 * POST   /api/user/dek      — Store/update the user's DEK (encrypted at rest)
 * DELETE /api/user/me       — Permanently delete account + all data
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, magicTokens } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { encryptDekForStorage, decryptDekFromStorage } from '../lib/server-crypto.js';
import { notifyUser } from '../lib/ws-registry.js';

const router = new Hono<{ Variables: AuthContext }>();

router.use('*', authMiddleware);

// ─── GET /api/user/me ─────────────────────────────────────────────────────────

router.get('/me', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({
    id:    user.id,
    name:  user.name,
    email: user.email,
    preferredCurrencyCode:   user.preferredCurrencyCode ?? null,
    preferredCurrencySymbol: user.preferredCurrencySymbol ?? null,
    createdAt: user.createdAt,
  });
});

// ─── PUT /api/user/me ─────────────────────────────────────────────────────────

router.put('/me', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name?.trim();
  if (!name || name.length < 1) {
    return c.json({ error: 'Name is required' }, 400);
  }
  if (name.length > 80) {
    return c.json({ error: 'Name is too long (max 80 characters)' }, 400);
  }

  await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Notify other devices so they pull the updated name
  notifyUser(userId);

  return c.json({ success: true, name });
});

// ─── PUT /api/user/currency ───────────────────────────────────────────────────
// Sets the user's preferred currency. Called on onboarding and whenever the
// user changes it in More > Currency. Body: { code: 'NGN', symbol: '₦' }

router.put('/currency', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { code?: string; symbol?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const code   = body.code?.trim().toUpperCase();
  const symbol = body.symbol?.trim();

  if (!code || code.length < 2 || code.length > 8) {
    return c.json({ error: 'code must be a 2-8 character currency code' }, 400);
  }
  if (!symbol || symbol.length > 8) {
    return c.json({ error: 'symbol is required (max 8 characters)' }, 400);
  }

  await db
    .update(users)
    .set({ preferredCurrencyCode: code, preferredCurrencySymbol: symbol, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ success: true, code, symbol });
});

// ─── GET /api/user/dek ───────────────────────────────────────────────────────
// Returns the user's plaintext DEK (hex) so a new device can decrypt its
// data. Auth-gated — only the owner can fetch their own DEK.

router.get('/dek', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const [user] = await db
    .select({ encryptedDek: users.encryptedDek })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!user.encryptedDek) return c.json({ dek: null });

  try {
    const dek = decryptDekFromStorage(user.encryptedDek);
    return c.json({ dek });
  } catch (err) {
    // Decryption failed — most likely the master key was rotated. Treat as
    // "no DEK stored": the client will generate a fresh one.
    console.warn('[dek] Failed to decrypt DEK for user', userId, '— returning null:', (err as Error).message);
    return c.json({ dek: null });
  }
});

// ─── POST /api/user/dek ──────────────────────────────────────────────────────
// Store or update the user's DEK. The server encrypts it before persisting.
// Body: { dek: "<64-char hex string>" }

router.post('/dek', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { dek?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const dek = body.dek;
  if (typeof dek !== 'string' || !/^[0-9a-f]{64}$/i.test(dek)) {
    return c.json({ error: 'dek must be a 64-character hex string' }, 400);
  }

  let encryptedDek: string;
  try {
    encryptedDek = encryptDekForStorage(dek);
  } catch (err) {
    console.error('[dek] Encryption failed — check SERVER_DEK_MASTER_KEY', err);
    return c.json({ error: 'Server encryption misconfigured' }, 500);
  }

  await db
    .update(users)
    .set({ encryptedDek, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ success: true });
});

// ─── DELETE /api/user/me ──────────────────────────────────────────────────────
// Permanently deletes the user's account and ALL associated data.
// PostgreSQL ON DELETE CASCADE handles: sessions, sync_records, push_tokens.
// magic_tokens is keyed by email (not userId), so it's deleted manually first.
// Required for Play Store account-deletion compliance; the marketing site's
// /delete-account page documents this flow for the store listing.

router.delete('/me', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);

  await db.delete(magicTokens).where(eq(magicTokens.email, user.email));
  await db.delete(users).where(eq(users.id, userId));

  return c.json({ success: true });
});

export default router;
