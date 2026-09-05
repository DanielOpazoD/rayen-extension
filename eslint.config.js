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
      // Una función de más de 150 líneas útiles o un módulo de más de 500 ya no se leen de una vez: se parten.
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Catálogos de datos, arnés, pruebas y scripts: largos por naturaleza, no por diseño.
    files: ['src/core/*-catalog.js', 'dev/**', 'tests/**', 'scripts/**'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
  // Capas: core no toca DOM, red ni Chrome y no importa io/ui; io no importa ui; ai no importa ui.
  // La valla la hace cumplir el lint, no la disciplina.
  {
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'chrome', 'fetch', 'localStorage', 'sessionStorage', 'navigator', 'location'],
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/io/**', '**/ui/**', '**/ai/**'], message: 'core es puro: sin io, ui ni ai.' }] }],
      'no-restricted-syntax': ['error', { selector: 'ImportExpression', message: 'core no carga módulos en tiempo de ejecución (vendor, pdf.js): eso es io.' }],
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
