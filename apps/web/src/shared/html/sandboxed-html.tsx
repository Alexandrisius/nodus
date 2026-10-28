import { useEffect, useMemo } from 'react';

import { sanitizeEmailHtml } from './sanitize-email-html.js';

/**
 * Песочница HTML-письма (#55, Р9): очищенный HTML (`sanitizeEmailHtml`) в
 * `<iframe srcdoc>` с жёстким `sandbox` (без скриптов, same-origin, форм и
 * навигации верхнего окна — только всплывающие окна ссылок) и CSP внутри
 * документа: внешнего ничего, картинки — data:/cid:, «Показать изображения»
 * добавляет https:. Лист письма красится ТОКЕНАМИ портала (вердикт владельца
 * 28.10: фон обязан совпадать с фоном продукта — инверсия давала зелёный
 * оттенок и швы): чужие фоны писем гасятся до прозрачного, текст — цвет
 * портала, ссылки — info, картинки остаются как есть. Без переданных цветов
 * (тесты) — светлый лист, как страница PDF. Высоту iframe не читаем (без
 * same-origin нельзя) — лист скроллится сам.
 */

/** Ровно эти разрешения: ссылки открываются новым окном вне песочницы. */
export const EMAIL_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

export function emailCsp(allowRemoteImages: boolean): string {
  // 'self' — резолвнутые cid-картинки (#56): подписанные ссылки того же
  // происхождения; cid: — незнакомые contentId (сломанная картинка, безопасно).
  const images = allowRemoteImages ? "'self' data: cid: https:" : "'self' data: cid:";
  return `default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; font-src data:`;
}

/** Цвета листа из токенов портала (читаются из :root на показе письма). */
export interface EmailSheetColors {
  background: string;
  foreground: string;
  link: string;
  border: string;
}

/** Кэш по теме: объект стабилен между рендерами, иначе srcdoc пересобирался
 *  бы на каждый кадр и iframe перезагружался. */
let sheetCache: { theme: 'light' | 'dark'; colors: EmailSheetColors | undefined } | null = null;

/** Токены текущей темы для листа письма: фон/текст/ссылка/бордюр. Значения
 *  живут в CSS-каскаде (data-theme), поэтому читаются при смене темы. */
export function emailSheetColorsFor(theme: 'light' | 'dark'): EmailSheetColors | undefined {
  if (sheetCache?.theme === theme) return sheetCache.colors;
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue('--background').trim();
  const foreground = style.getPropertyValue('--foreground').trim();
  const colors =
    background && foreground
      ? {
          background,
          foreground,
          link: style.getPropertyValue('--info').trim() || foreground,
          border: style.getPropertyValue('--border').trim() || foreground,
        }
      : undefined;
  sheetCache = { theme, colors };
  return colors;
}

// Общая типографика листа: чужие письма не знают наших классов.
const SHEET_FONT =
  'font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere';
const SHEET_BASE = [
  `body{margin:0;padding:20px 24px;${SHEET_FONT}}`,
  'img{max-width:100%;height:auto}',
  'table{max-width:100%}',
  'pre{white-space:pre-wrap}',
].join('');

// Фолбэк без токенов: светлый «лист», как страница PDF.
const SHEET_CSS = [
  'html{background:#fff;color-scheme:light}',
  `body{margin:0;padding:20px 24px;color:#1f2328;${SHEET_FONT}}`,
  'img{max-width:100%;height:auto}',
  'table{max-width:100%}',
  'pre{white-space:pre-wrap}',
  'img[data-blocked]{background:#eef1f4;outline:1px dashed #b8c0c8;outline-offset:-1px;min-width:24px;min-height:24px}',
  'a{color:#0b5cad}',
].join('');

/** Лист портала: фон/текст токенов, все чужие фоны — прозрачные. */
function portalSheet(colors: EmailSheetColors, theme: 'light' | 'dark'): string {
  return [
    `html,body{background:${colors.background};color:${colors.foreground};color-scheme:${theme}}`,
    SHEET_BASE,
    // Белые подписи Яндекса, фоны таблиц Outlook и цветные плашки писем не
    // должны лежать пятнами на фоне продукта — цвет плиток задаёт портал.
    `body *{background-color:transparent !important;color:inherit !important;border-color:${colors.border} !important}`,
    `a{color:${colors.link} !important;text-decoration:underline}`,
    // Заглушка скрытой картинки остаётся видимой после обнуления фонов.
    `img[data-blocked]{background:${colors.border} !important;outline:1px dashed ${colors.link};outline-offset:-1px;min-width:24px;min-height:24px}`,
  ].join('');
}

export function buildEmailSrcdoc(
  cleanHtml: string,
  allowRemoteImages: boolean,
  theme: 'light' | 'dark' = 'light',
  sheet?: EmailSheetColors,
): string {
  const css = sheet ? portalSheet(sheet, theme) : SHEET_CSS;
  return [
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${emailCsp(allowRemoteImages)}">`,
    '<base target="_blank">',
    `<style>${css}</style>`,
    `</head><body>${cleanHtml}</body></html>`,
  ].join('');
}

export function SandboxedHtml({
  html,
  allowRemoteImages,
  cidMap,
  onBlockedImages,
  title,
  theme = 'light',
  sheet,
}: {
  html: string;
  allowRemoteImages: boolean;
  /** contentId → абсолютный URL вложения письма (#56, Р11). */
  cidMap?: Record<string, string>;
  /** Сколько внешних картинок скрыто — хост показывает строку «Показать изображения». */
  onBlockedImages?: (count: number) => void;
  title: string;
  /** Тема портала: лист красится её токенами (без инверсии). */
  theme?: 'light' | 'dark';
  /** Цвета листа из токенов портала; без них — светлый лист (тесты). */
  sheet?: EmailSheetColors;
}) {
  const sanitized = useMemo(
    () => sanitizeEmailHtml(html, { allowRemoteImages, cidMap }),
    [html, allowRemoteImages, cidMap],
  );
  const srcDoc = useMemo(
    () => buildEmailSrcdoc(sanitized.html, allowRemoteImages, theme, sheet),
    [sanitized.html, allowRemoteImages, theme, sheet],
  );
  // Счётчик — внешнему бару хоста (синхронизация вверх, не производное состояние).
  useEffect(() => {
    onBlockedImages?.(sanitized.blockedImages);
  }, [onBlockedImages, sanitized.blockedImages]);

  return (
    <iframe
      title={title}
      sandbox={EMAIL_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className="block size-full border-0"
    />
  );
}
