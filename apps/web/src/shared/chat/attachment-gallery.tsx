import { useState } from 'react';
import type { MessageAttachment } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { ImageLightbox } from './image-lightbox.js';
import { uiPx } from '../ui/ui-scale.js';

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

/** Бокс медиа (#150): вписывается ratio из DTO; явные px дают вклад в
 *  fit-content-ширину пузыря — бокс стабилен ДО загрузки картинки (канон
 *  Telegram tdesktop/FB Messenger: «inline width from upload dims, иначе
 *  layout shift»). До капов дорастают и галерея, и одиночная плитка. */
export const MEDIA_MAX_W = uiPx(480);
export const MEDIA_MAX_H = uiPx(340);
const ROW_HEIGHT = uiPx(150);
/** Пол читаемости микро-картинок (Telegram minPhotoSize): сырые CSS-px БЕЗ
 *  uiPx — картинки ≥100px не должны подтягиваться масштабом интерфейса. */
const SINGLE_MIN_W = 100;
const FALLBACK_W = uiPx(320);

/**
 * Одиночная плитка из сохранённых габаритов. Модель FB Messenger (ishadeed,
 * разбор компонента: «if the image is smaller than the maximum values, we
 * display it as it is»): НЕ апскейлим — бокс не шире/выше природных px
 * картинки (низкое разрешение остаётся маленьким и резким, а не большим и
 * мыльным, как при фиксированном боксе Telegram); капы MAX_W×MAX_H режут
 * только крупное. Микро (<100px) поднимается до пола читаемости. Без
 * габаритов (клиент не прочитал / старые строки) — фолбэк 4:3: бокс
 * фиксируется и НЕ меняется после загрузки. Целые px — дробные при
 * --ui-scale округляются врозь (урок Switch, #96). Чистая — unit-тест.
 */
export function fitSingleBox(
  width?: number | null,
  height?: number | null,
): { width: number; height: number } {
  if (!width || width <= 0 || !height || height <= 0) {
    return { width: Math.round(FALLBACK_W), height: Math.round(FALLBACK_W * 0.75) };
  }
  const ratio = width / height;
  let w = Math.min(MEDIA_MAX_W, width);
  let h = w / ratio;
  if (h > MEDIA_MAX_H) {
    h = MEDIA_MAX_H;
    w = h * ratio;
  }
  if (w < SINGLE_MIN_W || h < SINGLE_MIN_W) {
    if (ratio >= 1) {
      w = SINGLE_MIN_W;
      h = w / ratio;
    } else {
      h = SINGLE_MIN_W;
      w = h * ratio;
    }
  }
  return { width: Math.round(w), height: Math.round(h) };
}

function GalleryTile({
  image,
  single,
  onOpen,
}: {
  image: MessageAttachment;
  single: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = image.thumbnailUrl ?? image.url ?? '';
  const box = fitSingleBox(image.width, image.height);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={image.name}
      className={cn(
        // Одиночная плитка — full-bleed: БЕЗ собственного скругления (углы
        // пузыря/карточки режет контейнер) и БЕЗ фиксации высоты. Ширина —
        // 100% пузыря (ширина изображения = ширина пузыря, #187; проценты
        // безопасны: пузырь/карточка несут ЯВНЫЙ px из mediaBubbleWidth —
        // gotcha «fit-content + проценты» не применяется), высота — из
        // aspect-ratio по габаритам: пропорции держатся при сужении панели.
        'relative min-w-0 cursor-zoom-in overflow-hidden bg-muted',
        single ? 'w-full shrink-0 rounded-none' : 'flex-1 rounded-none',
        !loaded && 'animate-pulse',
      )}
      style={single ? { aspectRatio: `${box.width} / ${box.height}` } : { height: ROW_HEIGHT }}
    >
      <img
        src={src}
        alt={image.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          'size-full object-cover transition-opacity duration-150',
          !loaded && 'opacity-0',
        )}
      />
    </button>
  );
}

/**
 * Галерея изображений сообщения (грамматика Битрикс24 + медиа-стиль #187):
 * плитки равной высоты в рядах по 3, одиночное — full-bleed превью на всю
 * ширину пузыря. Геометрия — ЯВНЫЕ px из сохранённых width/height (#150):
 * габариты задают ЯВНУЮ ширину пузыря/карточки (mediaBubbleWidth), поэтому
 * проценты внутри безопасны (gotcha «fit-content + проценты» о схлопе до
 * загрузки не применяется) — бокс обязанателен до первого байта картинки.
 * Клик по плитке — лайтбокс (`image-lightbox.tsx`: Esc/стрелки, счётчик,
 * возврат фокуса на плитку; добро владельца 14.09.2026).
 */
export function AttachmentGallery({ images }: { images: MessageAttachment[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const rows = galleryRows(images);
  let offset = 0;
  return (
    <span
      className="flex min-w-0 max-w-full flex-col gap-0.5"
      style={rows.length > 1 || (rows[0]?.length ?? 0) > 1 ? { width: MEDIA_MAX_W } : undefined}
    >
      {rows.map((row, rowIndex) => {
        const start = offset;
        offset += row.length;
        return (
          <span key={rowIndex} className="flex min-w-0 gap-0.5">
            {row.map((image, i) => (
              <GalleryTile
                key={image.id}
                image={image}
                single={rows.length === 1 && row.length === 1}
                onOpen={() => setOpenAt(start + i)}
              />
            ))}
          </span>
        );
      })}
      {openAt !== null ? (
        <ImageLightbox
          images={images}
          index={openAt}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </span>
  );
}
