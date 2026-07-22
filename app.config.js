/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Ụgwọ',
  slug: 'ugwo',
  owner: 'nippysky',
  version: '1.0.0',
  orientation: 'portrait',
  updates: {
    url: 'https://u.expo.dev/01aa1bb2-2d7d-4f4c-ba19-9450739e0b3a',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  icon: './assets/images/icon.png',
  scheme: 'ugwo',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.nippysky.ugwo',
    supportsTablet: false,
    infoPlist: {
      // Ụgwọ only uses standard, publicly-available encryption (AES-256-GCM
      // for on-device data protection, TLS in transit) — not a custom or
      // proprietary cryptographic implementation. This qualifies for App
      // Store Connect's export-compliance exemption, so `false` skips the
      // "Does your app use encryption?" prompt on every submission.
      ITSAppUsesNonExemptEncryption: false,
      NSFaceIDUsageDescription:
        'Ụgwọ uses Face ID to keep your debt records private and unlock the app instantly.',
    },
  },
  android: {
    package: 'com.nippysky.ugwo',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#1E2A4A',
    },
    permissions: [
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.POST_NOTIFICATIONS',
      // NOTE: SCHEDULE_EXACT_ALARM deliberately NOT requested — Google Play
      // restricts it to alarm/calendar apps. Inexact scheduling is fine for
      // debt reminders and costs nothing in review.
    ],
    predictiveBackGestureEnabled: false,
    // "pan" lets react-native-keyboard-controller own keyboard avoidance.
    // Without this, Android's native adjustResize fights the library and
    // covers inputs on Samsung and other OEM keyboards.
    softwareKeyboardLayoutMode: 'pan',
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-local-authentication',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#1E2A4A',
        sounds: [],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#1E2A4A',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 120,
          backgroundColor: '#1E2A4A',
        },
      },
    ],
    'expo-sharing',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // EAS project ID — auto-injected by EAS cloud builds via Constants.easConfig.projectId.
  // Set explicitly here so local device builds can also register push tokens.
  // Get yours: npx eas project:info  (then paste the ID below)
  extra: {
    eas: {
      projectId: '01aa1bb2-2d7d-4f4c-ba19-9450739e0b3a',
    },
  },
};
