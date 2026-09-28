import { Archive, Download, File, FileText } from 'lucide-react';
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

import { useViewerStore } from '../files/viewer-store.js';
import { formatBytes } from '../lib/format.js';

const iconFor = (mime: string) => {
  if (mime.includes('pdf')) return FileText;
  if (/zip|rar|7z|tar|gz/.test(mime)) return Archive;
  return File;
};

/**
 * Чип файла вложения (канон shadcn: вложения — примитив `Attachment`).
 * Клик по чипу открывает просмотрщик (#138: офис → ONLYOFFICE, PDF → pdf.js,
 * медиа → нативно, прочее → карточка скачивания — реестр shared/files);
 * скачивание — отдельной кнопкой справа (не качаем всё подряд — боль
 * владельца из спеки #138).
 */
export function AttachmentFile({ file }: { file: MessageAttachment }) {
  const Icon = iconFor(file.mime);
  const openViewer = useViewerStore((s) => s.open);
  return (
    <Attachment
      className="w-full cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={file.name}
      onClick={() =>
        openViewer({
          fileId: file.fileId,
          name: file.name,
          mime: file.mime,
          size: file.size,
          url: file.url,
        })
      }
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openViewer({
            fileId: file.fileId,
            name: file.name,
            mime: file.mime,
            size: file.size,
            url: file.url,
          });
        }
      }}
    >
      <AttachmentMedia>
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>
        <AttachmentDescription>{formatBytes(file.size)}</AttachmentDescription>
      </AttachmentContent>
      {file.url ? (
        <AttachmentActions>
          <AttachmentAction
            asChild
            aria-label={ui.chat.download}
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
