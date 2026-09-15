import type { ChatMessage } from '@nodus/contracts';

import { AttachmentFile } from './attachment-file.js';
import { AttachmentGallery } from './attachment-gallery.js';

/**
 * Вложения сообщения (грамматика Битрикс24, plan chat-attachments-plan.md):
 * галерея изображений СВЕРХУ, затем чипы файлов; вызывающий рендерит блок
 * ВЫШЕ текста пузыря (иначе аватар и хвостик отлипают к строке вложений).
 * Изображения и файлы разделены явно по `kind` контракта (не по mime).
 */
export function MessageAttachments({ message }: { message: ChatMessage }) {
  if (message.attachments.length === 0) return null;
  const images = message.attachments.filter((a) => a.kind === 'image');
  const files = message.attachments.filter((a) => a.kind !== 'image');
  return (
    <>
      {images.length > 0 ? <AttachmentGallery images={images} /> : null}
      {files.length > 0 ? (
        <span className="flex min-w-0 flex-col gap-1">
          {files.map((file) => (
            <AttachmentFile key={file.id} file={file} />
          ))}
        </span>
      ) : null}
    </>
  );
}
