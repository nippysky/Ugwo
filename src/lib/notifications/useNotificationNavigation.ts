/**
 * useNotificationNavigation — smart notification deep-link router.
 *
 * Handles three tap scenarios:
 *  1. App foregrounded — notification arrives while user is in the app
 *  2. App backgrounded — user taps OS banner, app comes to foreground
 *  3. Cold start — app was killed, user tapped notification in tray
 *
 * Each notification type maps to the most contextually relevant screen:
 *
 *  debt_reminder   → /person/[id]      (the person's ledger)
 *  debt_nudge      → /person/[id]      (open-ended 30-day nudge)
 *  debt_settled    → /(tabs)/history   (settled story)
 *  monthly_recap   → /(tabs)/history   (recovery recap)
 *
 * Cold-start taps wait for auth to initialise, then land after the tab
 * stack has mounted. Any resolution failure falls back to `/(tabs)`.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../../store/auth.store';

const HOME_HREF = '/(tabs)';

// ─── Notification data payload (shared with server worker) ────────────────────

export interface NotificationData {
  type?:     string;   // 'bill_reminder' | 'goal_milestone' | 'hourly_reminder' | …
  screen?:   string;   // legacy / override: 'bill' | 'goal' | 'home'
  id?:       string;   // entity ID — bill/goal primary key
  action?:   string;   // optional action hint ('log', 'review', 'pay')
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotificationNavigation(): void {
  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener     = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // 1. Foreground — notification arrived while app is open.
    //    The OS banner is shown automatically (setNotificationHandler returns
    //    shouldShowBanner: true). We don't navigate — the user is already in the app.
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Future: show an in-app toast with UIStore here.
      },
    );

    // 2. Background → foreground — user tapped the OS notification banner.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        navigate(router, data);
      },
    );

    // 3. Cold start — app was killed; user tapped notification in the tray.
    //    expo-notifications stores the last tapped notification synchronously.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification.request.content.data) {
      const data = last.notification.request.content.data as NotificationData;
      // The router/nav stack + the root layout's auth redirect aren't settled
      // yet at this point. Wait for auth init (fonts + DB + session resolve)
      // rather than guessing a fixed delay, then give the auth-guard's
      // router.replace() a short buffer to land before we push on top of it.
      // Fails open after a bounded wait so we never hang forever.
      waitUntilAuthReady().then(() => {
        setTimeout(() => navigate(router, data, true), 400);
      });
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);
}

// ─── Readiness gate ─────────────────────────────────────────────────────────

/**
 * Waits for auth init (fonts + DB + session resolution) to complete before
 * the cold-start deep link fires, so it never races the root layout's own
 * router.replace() redirect. Fails open after MAX_WAIT_MS so a stuck init
 * never permanently swallows the notification tap.
 */
function waitUntilAuthReady(): Promise<void> {
  const POLL_MS    = 150;
  const MAX_WAIT_MS = 4000;

  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const { isInitialized } = useAuthStore.getState();
      if (isInitialized || Date.now() - start >= MAX_WAIT_MS) {
        resolve();
        return;
      }
      setTimeout(check, POLL_MS);
    };
    check();
  });
}

// ─── Navigation resolver ──────────────────────────────────────────────────────

/** Pushes a href, and if that somehow throws, always falls back to home. */
function safePush(router: ReturnType<typeof useRouter>, href: string): void {
  try {
    router.push(href as never);
  } catch {
    try {
      router.push(HOME_HREF as never);
    } catch {
      // Nothing more we can safely do — avoid crashing the app over a
      // notification tap.
    }
  }
}

function navigate(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
  isColdStart = false,
): void {
  // On cold start, delay entity-level navigations a bit more to let the tabs
  // stack mount before we try to push a modal/detail screen on top.
  const entityDelay = isColdStart ? 400 : 0;

  let resolved: ResolvedRoute;
  try {
    resolved = resolveRoute(data) ?? { href: HOME_HREF, type: 'tab' };
  } catch {
    resolved = { href: HOME_HREF, type: 'tab' };
  }

  if (resolved.type === 'tab') {
    // Navigate to a tab — safe to do immediately (tabs always exist)
    safePush(router, resolved.href);
    return;
  }

  // Navigate to a detail screen — needs the stack to be ready
  setTimeout(() => safePush(router, resolved.href), entityDelay);
}

interface ResolvedRoute {
  href: string;
  type: 'tab' | 'detail';
}

/**
 * Map a notification data payload to an Expo Router href.
 *
 * Priority order:
 *  1. Explicit `screen` field — the sender says exactly where to land
 *     (server messages reuse one `type` across different target screens,
 *      so `screen` is the most precise signal)
 *  2. `type` mapping (fallback for payloads without a screen)
 *  3. Home tab fallback
 */
function resolveRoute(data: NotificationData): ResolvedRoute | null {
  const { type, screen, id } = data;

  // ── Screen-based routing (preferred — sender-specified target) ──────────

  if (screen) {
    switch (screen) {
      case 'person':
        if (id) return { href: `/person/${id}`, type: 'detail' };
        return { href: HOME_HREF, type: 'tab' };

      case 'history':
        return { href: '/(tabs)/history', type: 'tab' };

      case 'more':
        return { href: '/(tabs)/more', type: 'tab' };

      case 'notifications':
        return { href: '/notifications', type: 'detail' };

      case 'home':
        return { href: HOME_HREF, type: 'tab' };

      // Unknown screen value — fall through to type-based routing below
    }
  }

  // ── Type-based routing (fallback) ───────────────────────────────────────

  switch (type) {
    // Debt due reminders / open-ended nudges — go to the person's ledger
    case 'debt_reminder':
    case 'debt_nudge':
      if (id) return { href: `/person/${id}`, type: 'detail' };
      return { href: HOME_HREF, type: 'tab' };

    // Settlement celebration + monthly recap — the History tab tells the story
    case 'debt_settled':
    case 'monthly_recap':
      return { href: '/(tabs)/history', type: 'tab' };
  }

  // ── Default: home ────────────────────────────────────────────────────────
  return { href: HOME_HREF, type: 'tab' };
}
