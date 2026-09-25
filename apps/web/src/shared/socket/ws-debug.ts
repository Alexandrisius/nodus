/**
 * Отладочный режим WS-транспорта (#104, раунд 2): включается URL `?wsdebug=1`.
 * Владелец должен видеть состояние сокета без разработчика: точка-индикатор в
 * углу экрана (ws-debug-badge.tsx) + console-журнал переходов и ошибок.
 */

const DEBUG_FLAG = 'wsdebug';

/** Флаг читается один раз за загрузку страницы (URL не наблюдаем). */
export const wsDebugEnabled: boolean =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get(DEBUG_FLAG) === '1';

export function wsDebugLog(...args: unknown[]): void {
  if (wsDebugEnabled) {
    console.log('[ws]', ...args);
  }
}
