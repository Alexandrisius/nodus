import { memo } from 'react';
import type { LinkPreview } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Карточка-цитата превью ссылки (#212): ПОД текстом пузыря (канон
 * Telegram/Slack — сначала сообщение, затем доп-контекст), модель
 * Telegram — картинка сверху, затем домен/заголовок/описание ≤2 строки;
 * клик — новая вкладка (noopener). Показ — ТОЛЬКО по факту готовности
 * (#240, вердикт 07.10 ревизии: «сначала проверить, потом показывать»,
 * как Telegram/Битрикс): pending/null/failed/blocked — карточки нет вовсе
 * (ни скелетона, ни заглушки — WS довезёт готовую, если она будет).
 * Геометрия — по канону медиа-пузыря #187: радиус меньше пузырёвого,
 * max-w по контенту; mb-3 — телегра-зазор до меты времени (#238 ревизии:
 * «4–5 мм как в Telegram», вердикт 07.10).
 */

export const LinkPreviewCard = memo(function LinkPreviewCard({
  preview,
  url,
}: {
  preview: LinkPreview;
  url: string;
}) {
  const domain = preview.siteName ?? hostOf(url);

  const body = (
    <span className="flex w-72 flex-col gap-1 px-3 py-2.5 text-left">
      <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {domain}
      </span>
      {preview.title ? (
        <span className="line-clamp-1 text-sm font-semibold leading-snug">{preview.title}</span>
      ) : null}
      {preview.description ? (
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {preview.description}
        </span>
      ) : null}
    </span>
  );

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={ui.chat.linkPreviewOpen}
      title={url}
      className={cn(
        'mb-3 mt-1 flex max-w-full flex-col overflow-hidden rounded-lg no-underline',
        'bg-muted/60 transition-colors hover:bg-muted',
      )}
    >
      {preview.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt={preview.title ?? domain}
          loading="lazy"
          className="h-36 w-full object-cover"
        />
      ) : null}
      {body}
    </a>
  );
});

/** Первая http(s)-ссылка текста (хвостовая пунктуация — не адрес; канон
 *  линк-экстрактора api, клиентская копия для рендера). */
export function firstHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}'>"]+$/, '');
}

/** Кусок обычного текста либо http(s)-ссылка (автолинк #212 ревизия:
 *  ссылка в пузыре — классический гипертекст, как в Telegram/Битрикс). */
type UrlSegment = { kind: 'text'; value: string } | { kind: 'url'; url: string };

/** Разбить текст на куски «текст / http(s)-ссылка» с тем же правилом
 *  хвостовой пунктуации, что firstHttpUrl (единый канон). Внимание:
 *  `\]` в классе обязателен — голый `]` закрывает класс раньше и трим
 *  молча перестаёт работать (баг находка ревизии #212). */
export function httpUrlSegments(text: string): UrlSegment[] {
  const out: UrlSegment[] = [];
  let rest = text;
  for (;;) {
    const match = rest.match(/https?:\/\/\S+/);
    if (!match || match.index === undefined) break;
    const trimmed = match[0].replace(/[.,;:!?)\]}'>"]+$/, '');
    if (trimmed.length === 0) break;
    if (match.index > 0) out.push({ kind: 'text', value: rest.slice(0, match.index) });
    out.push({ kind: 'url', url: trimmed });
    rest = rest.slice(match.index + trimmed.length);
  }
  if (rest.length > 0 || out.length === 0) out.push({ kind: 'text', value: rest });
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Видима ли карточка превью у сообщения (#240, ревизия вердиктом 07.10:
 *  «сначала проверить, потом показывать», как Telegram/Битрикс): карточка
 *  появляется ТОЛЬКО когда превью дозрело с контентом (ready + заголовок/
 *  описание/картинка). pending/null — ничего (WS довезёт готовую, если она
 *  будет — никаких «нарисовалось и исчезло»); failed/blocked и пустая
 *  ready — тоже ничего (заглушка из домена бесполезна). */
export function linkCardVisible(text: string, preview: LinkPreview | null): boolean {
  if (!firstHttpUrl(text)) return false;
  if (!preview || preview.status !== 'ready') return false;
  return Boolean(preview.title || preview.description || preview.imageUrl);
}

/** Точка вставки в пузырь (#212): карточка первой ссылки ПОД текстом;
 *  показ — только по фактической готовности превью (#240). */
export function MessageLinkPreview({
  text,
  preview,
}: {
  text: string;
  preview: LinkPreview | null;
}) {
  if (!linkCardVisible(text, preview)) return null;
  const url = firstHttpUrl(text);
  if (!url || !preview) return null;
  return <LinkPreviewCard url={url} preview={preview} />;
}
