/**
 * Notification routes (all protected)
 *
 * Ụgwọ's debt reminders are scheduled LOCALLY on-device — the server can't
 * read due dates, so it can never send them. This push-token layer exists
 * for future silent-sync wakes and product announcements only.
 *
 * POST   /api/notifications/token — Register this device's Expo push token
 * DELETE /api/notifications/token — Deregister on sign-out
 * POST   /api/notifications/test  — Send a test push to all own devices
 */
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushTokens } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { sendExpoPush } from '../lib/expo-push.js';

const router = new Hono<{ Variables: AuthContext }>();

router.use('*', authMiddleware);

// ─── POST /api/notifications/token ────────────────────────────────────────────
// Body: { token: "ExponentPushToken[...]", platform: "ios"|"android", timezone?: string }
// Safe to call on every app launch — upserts by token.

router.post('/token', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { token?: string; platform?: string; timezone?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const token    = body.token?.trim();
  const platform = body.platform?.trim();

  if (!token || !/^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token)) {
    return c.json({ error: 'A valid Expo push token is required' }, 400);
  }
  if (platform !== 'ios' && platform !== 'android') {
    return c.json({ error: "platform must be 'ios' or 'android'" }, 400);
  }

  const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : null;

  await db
    .insert(pushTokens)
    .values({
      id: randomBytes(16).toString('hex'),
      userId,
      token,
      platform,
      timezone,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, platform, timezone, updatedAt: new Date() },
    });

  return c.json({ success: true });
});

// ─── DELETE /api/notifications/token ─────────────────────────────────────────
// Body: { token: string }

router.delete('/token', async (c) => {
  let body: { token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const token = body.token?.trim();
  if (!token) return c.json({ error: 'token is required' }, 400);

  await db.delete(pushTokens).where(eq(pushTokens.token, token));

  return c.json({ success: true });
});

// ─── POST /api/notifications/test ────────────────────────────────────────────
// Sends a test push to every device registered to the authenticated user.
// Useful for verifying the pipeline from dev builds.

router.post('/test', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));

  const tokens = rows.map((r) => r.token);
  if (tokens.length === 0) return c.json({ sent: 0 });

  await sendExpoPush(tokens, {
    title: 'Ụgwọ push works ✅',
    body:  'This device is registered for notifications.',
    data:  { type: 'test', screen: 'home' },
  });

  return c.json({ sent: tokens.length });
});

export default router;
