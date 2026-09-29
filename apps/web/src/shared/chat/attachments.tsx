import { useState } from 'react';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';

import { AttachmentCard } from './attachment-card.js';
import { AttachmentGallery, fitSingleBox, MEDIA_MAX_W } from './attachment-gallery.js';
import { ImageLightbox } from './image-lightbox.js';
import { uiPx } from '../ui/ui-scale.js';

export type AttachmentLayout =
  | { mode: 'single'; image: MessageAttachment }
  | { mode: 'gallery'; images: MessageAttachment[] }
  | { mode: 'list'; items: MessageAttachment[] };

/** Ширина карточного списка (#150, вердикт владельца: «пузырь узкий, как в
 *  Битриксе, когда прикреплено хоть какое-то вложение»): узкая карточка
 *  задаёт ширину ВСЕГО пузыря, текст пишется узким с переносами, кнопка
 *  скачивания — у правого края. */
export const CARD_LIST_W = uiPx(300);
/** Пол колонки текста: карточка/медиа могут быть уже (маленькая картинка,
 *  микро-файл) — текст не должен сжиматься в иглу (Telegram msgMinWidth). */
const TEXT_COL_MIN = uiPx(240);

/**
 * Режим показа вложений (#150, канон Telegram/Битрикс): галерея — ТОЛЬКО
 * когда вложения исключительно изображения (1 — крупная плитка, 2+ — сетка);
 * любой файл в наборе «разбивает» галерею — весь набор (и картинки, и файлы)
 * рендерится карточным списком друг под другом, картинка в нём — карточка с
 * квадратной миниатюрой. Чистая функция — unit-тест.
 */
export function attachmentsLayout(list: MessageAttachment[]): AttachmentLayout {
  // Стикер (#143) рендерится собственной веткой сообщения (без пузыря) —
  // из блока вложений исключён полностью.
  const items = list.filter((a) => a.kind !== 'sticker');
  const images = items.filter((a) => a.kind === 'image');
  if (items.length > 0 && images.length === items.length) {
    return images.length === 1
      ? { mode: 'single', image: images[0]! }
      : { mode: 'gallery', images };
  }
  return { mode: 'list', items };
}

/**
 * Ширина колонки содержимого пузыря С вложениями (#150, вердикт владельца
 * 29.09: «ширина всего пузыря задаётся карточкой вложения, а текст не
 * управляет шириной»; механика Telegram: у документа captionw = _maxw −
 * padding, у фото подпись переносится по ширине фото): карточка/медиа
 * определяют ширину колонки, текст ПЕРЕНОСИТСЯ внутри неё; кнопка скачивания
 * — у правого края карточки (= край пузыря). Без вложений — null: пузырь
 * по-прежнему w-fit от текста. Чистая функция — unit-тест.
 */
export function attachmentsContentWidth(list: MessageAttachment[]): number | null {
  const visible = list.filter((a) => a.kind !== 'sticker'); // стикер — без пузыря (#143)
  if (visible.length === 0) return null;
  const layout = attachmentsLayout(visible);
  const mediaW =
    layout.mode === 'single'
      ? fitSingleBox(layout.image.width, layout.image.height).width
      : layout.mode === 'gallery'
        ? MEDIA_MAX_W
        : CARD_LIST_W;
  return Math.max(mediaW, TEXT_COL_MIN);
}

/**
 * Вложения сообщения (грамматика Битрикс24, plan chat-attachments-plan.md):
 * блок ВЫШЕ текста пузыря (иначе аватар и хвостик отлипают к строке
 * вложений). Режим — `attachmentsLayout` (галерея только для «одних
 * картинок», микс — карточный список, #150); ширина колонки пузыря —
 * `attachmentsContentWidth` (карточка задаёт ширину, не текст). Изображения
 * и файлы разделены явно по `kind` контракта (не по mime).
 */
export function MessageAttachments({
  message,
  mine = false,
}: {
  message: ChatMessage;
  /** Чья поверхность сообщения (пузырь/пост) — тон вторичного текста карточек. */
  mine?: boolean;
}) {
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  if (message.attachments.length === 0) return null;
  const layout = attachmentsLayout(message.attachments);
  const listImages = layout.mode === 'list' ? layout.items.filter((a) => a.kind === 'image') : [];
  const openIndex = openImageId ? listImages.findIndex((a) => a.id === openImageId) : -1;
  return (
    <>
      {layout.mode === 'list' ? (
        <span className="flex w-full min-w-0 flex-col gap-1">
          {layout.items.map((item) => (
            <AttachmentCard
              key={item.id}
              attachment={item}
              mine={mine}
              onOpenImage={item.kind === 'image' ? () => setOpenImageId(item.id) : undefined}
            />
          ))}
        </span>
      ) : layout.mode === 'single' ? (
        <AttachmentGallery images={[layout.image]} />
      ) : (
        <AttachmentGallery images={layout.images} />
      )}
      {openIndex >= 0 ? (
        <ImageLightbox
          images={listImages}
          index={openIndex}
          onIndex={(index) => setOpenImageId(listImages[index]!.id)}
          onClose={() => setOpenImageId(null)}
        />
      ) : null}
    </>
  );
}
