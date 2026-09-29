import { Download } from 'lucide-react';
import type { MessageAttachment } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';

import { FileTypeIcon } from '../files/file-type-icon.js';
import { useViewerStore } from '../files/viewer-store.js';
import { formatBytes } from '../lib/format.js';
import { messageSurface } from './message-surface.js';

/**
 * Чип файла вложения НА поверхности сообщения (#144, вердикт владельца
 * 29.09.2026: «как в Битриксе» — вложение лежит на тоне пузыря БЕЗ собственной
 * заливки): примитив Attachment surface=flat, цветная иконка типа файла
 * (FileTypeIcon), имя, размер, кнопка скачать. Тон вторичного текста и ховера
 * чипа — от поверхности пузыря (messageSurface). Клик по чипу открывает
 * просмотрщик (#138: офис → ONLYOFFICE, PDF → pdf.js, медиа → нативно, прочее
 * → карточка скачивания — реестр shared/files); скачивание — отдельной
 * кнопкой справа (не качаем всё подряд — боль владельца из спеки #138).
 */
export function AttachmentFile({
  file,
  mine = false,
}: {
  file: MessageAttachment;
  mine?: boolean;
}) {
  const surface = messageSurface(mine);
  const openViewer = useViewerStore((s) => s.open);
  const open = () =>
    openViewer({
      fileId: file.fileId,
      name: file.name,
      mime: file.mime,
      size: file.size,
      url: file.url,
    });
  return (
    <Attachment
      surface="flat"
      /* Плотно к пузырю (вердикт 29.09): flat-поверхность без паддингов и
         плашки, иконка типа компактнее, ряд по центру — вложение не раздувает
         пузырь. */
      className="w-full cursor-pointer items-center gap-2"
      role="button"
      tabIndex={0}
      aria-label={file.name}
      onClick={open}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <AttachmentMedia className="w-6">
        <FileTypeIcon mime={file.mime} className="size-6" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>
        <AttachmentDescription className={surface.stripText}>
          {formatBytes(file.size)}
        </AttachmentDescription>
      </AttachmentContent>
      {file.url ? (
        <AttachmentActions>
          <AttachmentAction
            asChild
            aria-label={ui.chat.download}
            className="text-current hover:bg-current/10 hover:text-current dark:hover:bg-current/10 dark:hover:text-current"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          >
            <a href={file.url} download={file.name}>
              <Download />
            </a>
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
