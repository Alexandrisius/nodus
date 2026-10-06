import { memo } from 'react';
import type { LinkPreview } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Карточка-цитата превью ссылки (#212): ПОД текстом пузыря (канон
 * Telegram/Slack — сначала сообщение, затем доп-контекст), модель
 * Telegram — картинка сверху, затем домен/заголовок/описание ≤2 строки;
 * клик — новая вкладка (noopener). pending — скелетон ФИКСИРОВАННОЙ
 * высоты текстовой части (нулевой сдвиг макета при дозревании, спека);
 * failed/blocked — заглушка из домена. Геометрия — по канону
 * медиа-пузыря #187: радиус меньше пузырёвого, max-w по контенту.
 */

function SkeletonLine({ wide }: { wide?: boolean }) {
  return <span className={cn('h-2 rounded-full bg-muted animate-pulse', wide ? 'w-40' : 'w-28')} />;
}

export const LinkPreviewCard = memo(function LinkPreviewCard({
  preview,
  url,
}: {
  preview: LinkPreview;
  url: string;
}) {
  const domain = preview.siteName ?? hostOf(url);

  const body =
    preview.status === 'pending' ? (
      // Скелетон: та же высота, что готовая карточка (без картинки) —
      // дозревание не двигает макет.
      <span className="flex w-64 flex-col gap-1.5 px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">{domain}</span>
        <SkeletonLine wide />
        <SkeletonLine />
      </span>
    ) : (
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
        'mt-1 flex max-w-full flex-col overflow-hidden rounded-lg no-underline',
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

/** Точка вставки в пузырь (#212): карточка первой ссылки ПОД текстом,
 *  null-превью = скелетон (конвейер фоновый, WS дозреет). */
export function MessageLinkPreview({
  text,
  preview,
}: {
  text: string;
  preview: LinkPreview | null;
}) {
  const url = firstHttpUrl(text);
  if (!url) return null;
  return (
    <LinkPreviewCard
      url={url}
      preview={
        preview ?? {
          status: 'pending',
          siteName: null,
          title: null,
          description: null,
          imageUrl: null,
        }
      }
    />
  );
}
