// metro.config.js
// expo-sqlite ships a wa-sqlite.wasm file that doesn't exist on disk during
// EAS Update's web static-render pass. Stub it out so the web bundle succeeds.
// (expo-sqlite is only used on iOS/Android; the stub is never called at runtime.)

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro's strict package.json "exports" resolution (default since RN 0.79) can
// fail to resolve some packages' internal modules — e.g. react-native's own
// setUpIntersectionObserver.js failing to find its sibling webapis file.
// This is a known upstream issue; disabling it is the documented workaround.
// https://github.com/expo/expo/discussions/36551
config.resolver.unstable_enablePackageExports = false;

const { resolver } = config;
config.resolver = {
  ...resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web' && moduleName.endsWith('.wasm')) {
      // Return an empty module — wasm is unreachable on web anyway
      return { type: 'empty' };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};


// Keep Metro out of the server workspace — it has its own node_modules and
// TypeScript config, and must never be bundled into the app.
// Anchored to THIS project's server/ folder specifically — an unanchored
// /server\/.*/ regex would also match unrelated paths like
// node_modules/@expo/server/, silently breaking anything that depends on them.
const serverDirEscaped = path.join(__dirname, 'server').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${serverDirEscaped}/.*`)];

module.exports = config;
