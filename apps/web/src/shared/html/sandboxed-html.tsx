import { useEffect, useMemo } from 'react';

import { sanitizeEmailHtml } from './sanitize-email-html.js';

/**
 * Песочница HTML-письма (#55, Р9): очищенный HTML (`sanitizeEmailHtml`) в
 * `<iframe srcdoc>` с жёстким `sandbox` (без скриптов, same-origin, форм и
 * навигации верхнего окна — только всплывающие окна ссылок) и CSP внутри
 * документа: внешнего ничего, картинки — data:/cid:, «Показать изображения»
 * добавляет https:. Внутри — светлый «лист» в обеих темах (как страница
 * PDF): письма свёрстаны под белый фон, тема портала их не перекрашивает.
 * Высоту iframe не читаем (без same-origin нельзя) — лист скроллится сам.
 */

/** Ровно эти разрешения: ссылки открываются новым окном вне песочницы. */
export const EMAIL_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

export function emailCsp(allowRemoteImages: boolean): string {
  const images = allowRemoteImages ? 'data: cid: https:' : 'data: cid:';
  return `default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; font-src data:`;
}

// Стили листа живут внутри документа письма (не классы портала): «бумага»
// одинакова в обеих темах, как PDF во вьювере (Р9) — осознанное исключение
// из правила токенов, цвета не участвуют в теме портала.
const SHEET_CSS = [
  'html{background:#fff;color-scheme:light}',
  'body{margin:0;padding:20px 24px;font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2328;overflow-wrap:anywhere}',
  'img{max-width:100%;height:auto}',
  'img[data-blocked]{background:#eef1f4;outline:1px dashed #b8c0c8;outline-offset:-1px;min-width:24px;min-height:24px}',
  'table{max-width:100%}',
  'a{color:#0b5cad}',
  'pre{white-space:pre-wrap}',
].join('');

export function buildEmailSrcdoc(cleanHtml: string, allowRemoteImages: boolean): string {
  return [
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${emailCsp(allowRemoteImages)}">`,
    '<base target="_blank">',
    `<style>${SHEET_CSS}</style>`,
    `</head><body>${cleanHtml}</body></html>`,
  ].join('');
}

export function SandboxedHtml({
  html,
  allowRemoteImages,
  onBlockedImages,
  title,
}: {
  html: string;
  allowRemoteImages: boolean;
  /** Сколько внешних картинок скрыто — хост показывает строку «Показать изображения». */
  onBlockedImages?: (count: number) => void;
  title: string;
}) {
  const sanitized = useMemo(
    () => sanitizeEmailHtml(html, { allowRemoteImages }),
    [html, allowRemoteImages],
  );
  const srcDoc = useMemo(
    () => buildEmailSrcdoc(sanitized.html, allowRemoteImages),
    [sanitized.html, allowRemoteImages],
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
