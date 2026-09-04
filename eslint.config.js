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
  // Capas: core no toca DOM, red ni Chrome y no importa io/ui; io no importa ui; ai no importa ui.
  // La valla la hace cumplir el lint, no la disciplina.
  {
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'chrome', 'fetch', 'localStorage', 'sessionStorage', 'navigator', 'location'],
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/io/**', '**/ui/**', '**/ai/**'], message: 'core es puro: sin io, ui ni ai.' }] }],
    },
  },
  {
    files: ['src/io/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/ui/**'], message: 'io no conoce la interfaz.' }] }] },
  },
  {
    files: ['src/ai/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/ui/**'], message: 'ai produce datos y texto; la interfaz los pinta.' }] }] },
  },
  {
    files: ['report.js', 'popup-init.js'],
    languageOptions: { sourceType: 'script' },
  },
];
