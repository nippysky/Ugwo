// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'server/**', '.expo/*'],
  },
  {
    rules: {
      // Stylistic — apostrophes in RN <Text> render fine and read better in code.
      'react/no-unescaped-entities': 'off',
      // React Compiler advisories: the compiler safely skips components it
      // can't verify. These fire on the shared Akù-derived UI kit; keep them
      // visible as warnings without failing the lint run.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
]);
