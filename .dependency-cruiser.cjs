/** Reglas de capas y ciclos como grafo verificable (complementa el lint y check-cycles). */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'core-es-puro', severity: 'error', comment: 'core no importa io, ui ni ai',
      from: { path: '^src/core/' }, to: { path: '^src/(io|ui|ai)/' } },
    { name: 'io-no-conoce-ui', severity: 'error', from: { path: '^src/io/' }, to: { path: '^src/ui/' } },
    { name: 'ai-no-conoce-ui', severity: 'error', from: { path: '^src/ai/' }, to: { path: '^src/ui/' } },
    { name: 'sin-huerfanos', severity: 'warn', from: { orphan: true, pathNot: ['\\.d\\.ts$'] }, to: {} },
  ],
  options: {
    doNotFollow: { path: 'node_modules|vendor' },
    exclude: { path: 'vendor' },
    tsPreCompilationDeps: false,
    reporterOptions: { dot: { collapsePattern: 'node_modules/[^/]+' } },
  },
};
