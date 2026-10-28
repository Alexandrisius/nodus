import DOMPurify, { type Config } from 'dompurify';

/**
 * Санитайзер HTML-писем (#55, Р9) — единственная точка, через которую чужой
 * HTML попадает в портал. DOMPurify (html-профиль) снимает исполняемое и
 * опасное: `script`, формы и поля, фреймы, `object/embed`, `meta/link/base`,
 * все `on*`-атрибуты, ссылки кроме http(s)/mailto. Внешние картинки
 * (трекеры, утечка «письмо открыто») по умолчанию подменяются заглушкой и
 * считаются — «Показать изображения» пропускает только https. Ссылки
 * открываются в новой вкладке без доступа к порталу (`noopener noreferrer`).
 * Вторая линия обороны — песочница iframe и CSP (`sandboxed-html.tsx`).
 */

const FORBID_TAGS = [
  'script',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'meta',
  'link',
  'base',
];

/** Ссылки и картинки: http(s), mailto, cid (вложения письма, #56), якоря. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|cid):|#)/i;

const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS,
  ALLOWED_URI_REGEXP,
  WHOLE_DOCUMENT: true,
  RETURN_DOM: true,
};

/** Заглушка скрытой картинки: размеры сохраняются атрибутами, вид — CSS листа. */
export const BLOCKED_IMAGE_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface SanitizedEmail {
  /** Стили письма + содержимое body — готово к вставке в лист песочницы. */
  html: string;
  /** Скрыто внешних картинок (строка «Внешние изображения скрыты: N»). */
  blockedImages: number;
}

/** Параметры текущего прохода: `sanitize` не реентерабелен, хук читает их
 *  синхронно в пределах одного вызова. `cidMap` — contentId → абсолютный
 *  URL вложения (#56, Р11): cid: остаётся в HTML как есть, подмена — только
 *  на показе, хранение не искажаем. */
let pass = { allowRemote: false, blocked: 0, cidMap: {} as Record<string, string> };
let instance: ReturnType<typeof DOMPurify> | null = null;

function isRemote(url: string): boolean {
  return /^https?:/i.test(url.trim());
}

function purifier(): ReturnType<typeof DOMPurify> {
  if (instance) return instance;
  // Свой экземпляр: хуки не протекают в другие потребители DOMPurify.
  const purify = DOMPurify(window);
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      node.removeAttribute('srcset');
      const src = node.getAttribute('src') ?? '';
      const cid = src.match(/^cid:(.+)$/i);
      if (cid) {
        // Inline-картинка письма: резолв в подписанную ссылку вложения
        // (same-origin, CSP 'self'); незнакомый cid — сломанная картинка,
        // безопасно.
        const resolved = pass.cidMap[cid[1]!.trim()];
        if (resolved) node.setAttribute('src', resolved);
      } else {
        const allowed = pass.allowRemote && /^https:/i.test(src.trim());
        if (isRemote(src) && !allowed) {
          node.setAttribute('src', BLOCKED_IMAGE_SRC);
          node.setAttribute('data-blocked', '');
          pass.blocked += 1;
        }
      }
    }
    // Устаревший фон таблиц (`<td background>`) — та же утечка, что у картинки.
    const background = node.getAttribute('background');
    const backgroundAllowed = pass.allowRemote && /^https:/i.test(background?.trim() ?? '');
    if (background !== null && isRemote(background) && !backgroundAllowed) {
      node.removeAttribute('background');
      pass.blocked += 1;
    }
  });
  instance = purify;
  return purify;
}

export function sanitizeEmailHtml(
  html: string,
  {
    allowRemoteImages,
    cidMap = {},
  }: { allowRemoteImages: boolean; cidMap?: Record<string, string> },
): SanitizedEmail {
  pass = { allowRemote: allowRemoteImages, blocked: 0, cidMap };
  const root = purifier().sanitize(html, CONFIG) as unknown as HTMLElement;
  const styles = [...root.querySelectorAll('style')]
    .filter((style) => !root.querySelector('body')?.contains(style))
    .map((style) => style.outerHTML)
    .join('');
  const body = root.querySelector('body')?.innerHTML ?? '';
  return { html: `${styles}${body}`, blockedImages: pass.blocked };
}
