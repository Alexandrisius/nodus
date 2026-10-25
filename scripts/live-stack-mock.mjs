/**
 * Разбор `--mock` песочницы (#431, ADR-0001): UI-чекпоинт ДО бэкенда —
 * MSW в vite dev. `vite build` всегда non-mock (#171), поэтому список
 * моков допустим только вместе с `--dev`; проверка режима — в live-stack.
 */
export function mockEnvOf(argv) {
  const index = argv.indexOf('--mock');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error('--mock требует список доменов через запятую или all');
    process.exit(1);
  }
  if (!/^(all|[a-z-]+(,[a-z-]+)*)$/.test(value)) {
    console.error(`--mock: неверный список «${value}» (ожидается all или домены через запятую)`);
    process.exit(1);
  }
  return value;
}
