/**
 * Ụgwọ API Server
 * Runtime: Node.js 20+ on Ubuntu (DigitalOcean Droplet — same box as aku-api)
 * Framework: Hono — fast, typed, Node-compatible
 * Port: 3001 (aku-api owns 3000)
 *
 * Start dev:  npm run dev
 * Production: npm run build && pm2 start ecosystem.config.cjs --env production
 */
import 'dotenv/config';  // Load .env before anything else

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { verifyJWT, hashToken } from './lib/jwt.js';
import { db } from './db/client.js';
import { sessions } from './db/schema.js';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { registerWs, connectionCount } from './lib/ws-registry.js';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';
import syncRouter from './routes/sync.js';

import {
  globalRateLimit,
  magicLinkRateLimit,
  strictRateLimit,
} from './middleware/rate-limit.js';

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', prettyJSON());

// CORS — mobile apps don't send an Origin header for native requests, so CORS
// is mainly needed for web/browser testing.
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:8081',   // Expo dev server
      'http://localhost:3001',   // Local API (browser testing)
      process.env.API_URL ?? '',
    ].filter(Boolean),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials:  true,
  }),
);

// Global rate limit — unauthenticated traffic only
app.use('*', globalRateLimit());

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/', (c) => c.json({ status: 'ok', service: 'ugwo-api', version: '1.0.0' }));
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────────────────────

// Magic-link send gets its own per-email limit
app.use('/api/auth/magic-link', magicLinkRateLimit());

// Auth verify (token → session) gets a strict per-IP limit
app.use('/api/auth/magic-link/verify', strictRateLimit());
app.use('/api/auth/magic-link/verify-otp', strictRateLimit());

app.route('/api/auth', authRouter);
app.route('/api/user', userRouter);
app.route('/api/sync', syncRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

// ── Error handler ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  // Include method + path so `pm2 logs ugwo-api` pinpoints which route broke.
  console.error(`[server] Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const httpServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🚀 Ụgwọ API running on http://localhost:${info.port}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   API_URL:  ${process.env.API_URL ?? '(not set)'}`);
});

// ── WebSocket server — real-time sync push ────────────────────────────────────
// Mounted on the same HTTP server at path /api/sync/ws.
// Auth: JWT passed as ?token=<jwt> query param (WSS encrypts the URL).
// On push: sync route calls notifyUser(userId) → all connected devices for
// that user receive { type: 'sync' } → client pulls immediately.

const wss = new WebSocketServer({ server: httpServer as never, path: '/api/sync/ws' });

wss.on('connection', async (ws, req) => {
  let userId: string;
  try {
    const url = new URL(req.url ?? '', 'ws://localhost');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(1008, 'Missing token'); return; }

    const jwtPayload = await verifyJWT(token);

    // Verify the session still exists and hasn't been revoked
    const tokenHash = hashToken(token);
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) { ws.close(1008, 'Session revoked'); return; }

    userId = jwtPayload.sub;
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  const unregister = registerWs(userId, () => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: 'sync' }));
    }
  });

  console.log(`[ws] connect  userId=${userId}  total=${connectionCount()}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string };
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch { /* ignore malformed frames */ }
  });

  ws.on('close', () => {
    unregister();
    console.log(`[ws] close    userId=${userId}  total=${connectionCount()}`);
  });

  ws.on('error', () => {
    unregister();
  });

  ws.send(JSON.stringify({ type: 'connected' }));
});

export default app;
