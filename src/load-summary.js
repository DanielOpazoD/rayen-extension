/** The visible completion message keeps only the number users act on. */
export function summarizeLoad(count, result) {
  const fails = result.failedDays + result.historialFailed;
  return { text: `${count} ${count === 1 ? 'atención' : 'atenciones'}`, cls: fails ? 'warn' : 'ok' };
}
