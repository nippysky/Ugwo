import { useEffect, useRef } from 'react';
import { View, StatusBar, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useColorScheme } from 'react-native';
import { initializeDatabase } from '../lib/database/client';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { useAkuLinkStore } from '../store/aku-link.store';
import { useLedgerStore } from '../store/ledger.store';
import { ToastContainer } from '../components/ui/ToastContainer';
import { AppLoader } from '../components/ui/AppLoader';
import { LightColors, DarkColors } from '../theme/colors';
import { notificationService, useNotificationNavigation } from '../lib/notifications';
import { useSyncStore } from '../store/sync.store';
import { wsClient } from '../lib/sync/ws-client';

// Prevent auto-hide while fonts + auth load
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme   = useColorScheme();
  const router   = useRouter();
  const segments = useSegments();

  const { isInitialized, user, session, isLocked, hasOnboarded, initialize } = useAuthStore();
  const { themeMode, loadSettings } = useUIStore();

  // Resolve dark mode: respect in-app preference, then fall back to system
  const isDark =
    themeMode === 'dark'  ? true  :
    themeMode === 'light' ? false :
    scheme === 'dark';

  const colors = isDark ? DarkColors : LightColors;

  // Wire up notification deep-link navigation
  useNotificationNavigation();

  const [fontsLoaded] = useFonts({
    // Fraunces — display serif
    Fraunces_300Light:        require('../../assets/fonts/Fraunces_300Light.ttf'),
    Fraunces_400Regular:      require('../../assets/fonts/Fraunces_400Regular.ttf'),
    Fraunces_300Light_Italic: require('../../assets/fonts/Fraunces_300Light_Italic.ttf'),
    // Plus Jakarta Sans — body
    PlusJakartaSans_300Light:    require('../../assets/fonts/PlusJakartaSans_300Light.ttf'),
    PlusJakartaSans_400Regular:  require('../../assets/fonts/PlusJakartaSans_400Regular.ttf'),
    PlusJakartaSans_500Medium:   require('../../assets/fonts/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('../../assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold:     require('../../assets/fonts/PlusJakartaSans_700Bold.ttf'),
  });

  // ── Database + Auth + Notifications init ─────────────────────────────
  useEffect(() => {
    (async () => {
      await initializeDatabase();
      // Load persisted theme + currency before auth so the correct theme
      // is applied from the very first render after cold start.
      await loadSettings();
      await initialize();
      // Restore any existing Connect-Akù link (independent of Ụgwọ's own auth).
      useAkuLinkStore.getState().init().catch(() => {});

      // Request notification permissions, set up Android channels, and keep
      // the monthly recap pointed at the next month boundary. All idempotent.
      // Reminders are always-on in Ụgwọ — there's no user toggle to check.
      const granted = await notificationService.requestPermissions();
      if (granted) {
        await notificationService.setupNotificationChannels();
        await notificationService.scheduleMonthlyRecap();
        await notificationService.scheduleLogNudges();
      }
    })();
  }, []);

  // ── Hide splash when ready ───────────────────────────────────────────
  useEffect(() => {
    if (fontsLoaded && isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitialized]);

  // ── Foreground: clear badge + pull latest data from server ──────────
  // Re-lock after 5+ minutes in the background (device-auth on return).
  // Quick app switches stay seamless; long absences require an unlock.
  const backgroundedAtRef = useRef<number | null>(null);
  const RELOCK_AFTER_MS = 5 * 60 * 1000;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now();
      }
      if (nextState === 'active') {
        // ── Re-lock check ──
        const away = backgroundedAtRef.current
          ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = null;
        const { biometric, hasOnboarded: onboarded, lock } = useAuthStore.getState();
        if (away >= RELOCK_AFTER_MS && user && onboarded && biometric.enabled) {
          lock();
          return; // locked — skip refresh work until unlocked
        }

        // Clear the notification badge
        notificationService.clearBadge().catch(() => {});

        // Keep the monthly recap scheduled across month boundaries, and top
        // up the rolling "log a debt" nudge queue as older ones get used up
        notificationService.scheduleMonthlyRecap().catch(() => {});
        notificationService.scheduleLogNudges().catch(() => {});

        // Pull delta from server — only fires when DEK is loaded (unlocked)
        const { dek, lastSyncAt } = useSyncStore.getState();
        if (dek && user && !isLocked) {
          import('../lib/sync/engine').then(({ pullAndMerge }) => {
            pullAndMerge(lastSyncAt).catch(() => {});
          });
        }

        // Retry any Akù mirror pushes that may have failed while backgrounded
        // (e.g. no network at the time). Cheap no-op if nothing is pending.
        if (user && !isLocked) {
          useLedgerStore.getState().retryAkuSync().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [user, isLocked]);

  // ── WebSocket — persistent real-time sync connection ────────────────
  useEffect(() => {
    if (user && session && !isLocked) {
      wsClient.connect();
    } else {
      wsClient.disconnect();
    }
  }, [user, session, isLocked]);

  // ── Navigation guard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || !fontsLoaded) return;

    const inAuth       = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inSignIn     = segments[0] === 'sign-in';
    // auth-callback.tsx handles its own routing after processing the deep
    // link — the guard must never redirect mid-callback or the token is lost.
    const inAuthCallback = segments[0] === 'auth-callback';

    if (inAuthCallback) return;

    const hasSession = !!session && !!user;

    if (!hasOnboarded) {
      // First-time user — force onboarding. /sign-in is whitelisted so
      // returning users on a new device can sign in without looping back.
      if (!inOnboarding && !inSignIn) router.replace('/(onboarding)');

    } else if (isLocked) {
      if (!inAuth) router.replace('/(auth)');

    } else if (hasSession) {
      const atRootIndex = !segments[0] || (segments[0] as string) === 'index';
      if (inAuth || inOnboarding || atRootIndex) router.replace('/(tabs)');

    } else {
      // Onboarding complete but no active session — force re-auth
      if (!inAuth && !inOnboarding) router.replace('/(auth)');
    }
  }, [isInitialized, fontsLoaded, user, session, isLocked, hasOnboarded, segments]);

  if (!fontsLoaded || !isInitialized) {
    return <AppLoader />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BottomSheetModalProvider>
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={colors.background}
                translucent={false}
              />
              <Stack screenOptions={{ headerShown: false }} />
              <ToastContainer />
              {/* Status bar shield — only on tab screens where scrollable
                  content can bleed behind the status bar. */}
              <StatusBarShield
                backgroundColor={segments[0] === '(tabs)' ? colors.background : 'transparent'}
              />
            </View>
          </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── StatusBarShield ──────────────────────────────────────────────────────────
// Must be a child component so useSafeAreaInsets runs inside SafeAreaProvider.

function StatusBarShield({ backgroundColor }: { backgroundColor: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        right:         0,
        height:        insets.top,
        backgroundColor,
        zIndex:        999,
        pointerEvents: 'none' as const,
      }}
    />
  );
}
