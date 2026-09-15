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

import { formatBytes } from '../lib/format.js';

const iconFor = (mime: string) => {
  if (mime.includes('pdf')) return FileText;
  if (/zip|rar|7z|tar|gz/.test(mime)) return Archive;
  return File;
};

/**
 * Чип файла вложения (канон shadcn: вложения — примитив `Attachment`, не
 * кастомная карточка): иконка по mime, имя (truncate, полное в title), размер,
 * кнопка скачивания справа. Грамматика Битрикс24 (plan chat-attachments-plan).
 */
export function AttachmentFile({ file }: { file: MessageAttachment }) {
  const Icon = iconFor(file.mime);
  return (
    <Attachment className="w-full">
      <AttachmentMedia>
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>
        <AttachmentDescription>{formatBytes(file.size)}</AttachmentDescription>
      </AttachmentContent>
      {file.url ? (
        <AttachmentActions>
          <AttachmentAction asChild aria-label={ui.chat.download}>
            <a href={file.url} download={file.name}>
              <Download />
            </a>
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
