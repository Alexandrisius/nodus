/**
 * Фоновый прогрев кэша браузера для движка ONLYOFFICE (#138): первое
 * открытие документа скачивает тяжёлые ассеты DS (~30МБ sdkjs на каждый
 * тип документа + шрифты); после логина на idle качаем их один раз на
 * браузер — первое открытие перестаёт ждать сеть. DS отдаёт их immutable
 * (max-age=31536000), повторные визиты браузер не трогает; saveData/2g и
 * повторные сессии — не греем (флаг в localStorage).
 */
const WARM_FLAG = 'nodus-office-warm-v1';

/** Тяжёлые ассеты по типам документов (стабильные корневые пути DS:
 *  редирект на версионный immutable-ассет кэшируется вместе с ним). */
export const OFFICE_WARM_URLS = [
  '/sdkjs/word/sdk-all.js',
  '/sdkjs/cell/sdk-all.js',
  '/sdkjs/slide/sdk-all.js',
  '/sdkjs/common/AllFonts.js',
] as const;

function warmed(): boolean {
  try {
    return localStorage.getItem(WARM_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Прогрев: idle-пауза, затем последовательная загрузка (не конкурирует
 *  с логином/лентой). Молчит: неудача = просто нет прогрева, следующая
 *  сессия повторит. */
export function warmOfficeAssets(delayMs = 10_000): void {
  if (typeof window === 'undefined' || warmed()) return;
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  window.setTimeout(() => {
    void (async () => {
      if (warmed()) return;
      for (const url of OFFICE_WARM_URLS) {
        try {
          await fetch(url, { cache: 'default' });
        } catch {
          return; // офлайн/DS лежит — без флага, повторим в следующей сессии
        }
      }
      try {
        localStorage.setItem(WARM_FLAG, '1');
      } catch {
        /* private mode — просто прогрели без флага */
      }
    })();
  }, delayMs);
}
