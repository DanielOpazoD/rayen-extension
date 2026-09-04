import js from '@eslint/js';
import globals from 'globals';

export default [
  // vendor/ son bibliotecas de terceros minificadas; su estilo no es nuestro.
  { ignores: ['node_modules/**', 'dist/**', 'vendor/**', '*.har'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, chrome: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    files: ['report.js', 'popup-init.js'],
    languageOptions: { sourceType: 'script' },
  },
];
