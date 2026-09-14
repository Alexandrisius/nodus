import { useState } from 'react';
import type { MessageAttachment } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Раскладка галереи изображений (plan chat-attachments-plan.md; research:
 * rowboat/Slack — равновысотные плитки в ряд, CometChat — коллаж, Битрикс —
 * ряд превью): 1 изображение — одна крупная плитка; 2+ — ряды по 3.
 * Чистая функция — unit-тест.
 */
export function galleryRows(images: MessageAttachment[]): MessageAttachment[][] {
  if (images.length === 0) return [];
  if (images.length === 1) return [images];
  const rows: MessageAttachment[][] = [];
  for (let i = 0; i < images.length; i += 3) rows.push(images.slice(i, i + 3));
  return rows;
}

const ROW_HEIGHT = 150;
const SINGLE_MAX_HEIGHT = 340;

function GalleryTile({
  image,
  single,
  onOpen,
}: {
  image: MessageAttachment;
  single: boolean;
  onOpen: (image: MessageAttachment) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = image.thumbnailUrl ?? image.url ?? '';
  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : undefined;
  return (
    <button
      type="button"
      onClick={() => onOpen(image)}
      aria-label={image.name}
      className={cn(
        'relative min-w-0 cursor-zoom-in overflow-hidden rounded-lg bg-muted',
        single ? 'w-full' : 'flex-1',
        !loaded && 'animate-pulse',
      )}
      style={single ? { aspectRatio: ratio, maxHeight: SINGLE_MAX_HEIGHT } : { height: ROW_HEIGHT }}
    >
      <img
        src={src}
        alt={image.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn('size-full object-cover', !loaded && 'opacity-0')}
      />
    </button>
  );
}

/**
 * Галерея изображений сообщения (грамматика Битрикс24): плитки равной высоты
 * в рядах по 3, одиночное — крупное превью; бокс резервируется по width/height
 * (aspect-ratio / фиксированная высота ряда) — лента не сдвигается при
 * загрузке. `onOpen` — точка подключения будущего лайтбокса (сейчас noop).
 */
export function AttachmentGallery({
  images,
  onOpen = () => undefined,
}: {
  images: MessageAttachment[];
  onOpen?: (image: MessageAttachment) => void;
}) {
  const rows = galleryRows(images);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {rows.map((row, rowIndex) => (
        <span key={rowIndex} className="flex min-w-0 gap-1">
          {row.map((image) => (
            <GalleryTile
              key={image.id}
              image={image}
              single={rows.length === 1 && row.length === 1}
              onOpen={onOpen}
            />
          ))}
        </span>
      ))}
    </span>
  );
}
