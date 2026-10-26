import { Download } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@nodus/ui/components/attachment';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { FileTypeIcon } from '../../../../shared/files/file-type-icon.js';
import { formatBytes } from '../../../../shared/lib/format.js';

/** Файлы письма для показа: исходник почты (.eml, #56) — служебный. */
export function visibleLetterFiles(letter: LetterDetail) {
  return letter.attachments.filter((file) => file.role !== 'source');
}

/**
 * Блок «Файлы» карточки письма (#55): главный документ, текст письма и
 * приложения плитками. Клик — файл во вкладке правой панели (тело письма —
 * вкладка «Тело»), открытый сейчас — с контуром порта; скачивание — кнопкой
 * плитки. Нет файлов — блока нет (пустых заделов не держим).
 */
export function LetterFilesBlock({
  letter,
  activeId,
  onOpen,
}: {
  letter: LetterDetail;
  /** Вложение активной вкладки панели (подсветка плитки). */
  activeId: string | null;
  onOpen: (attachmentId: string) => void;
}) {
  const files = visibleLetterFiles(letter);
  if (files.length === 0) return null;

  return (
    <section className="mt-7">
      <NodeLabel label={ui.letters.card.files} count={files.length} />
      <AttachmentGroup className="mt-2 flex-wrap overflow-visible">
        {files.map((file) => {
          const role =
            file.role === 'main' || file.role === 'body'
              ? ui.letters.card.fileRoles[file.role]
              : null;
          return (
            <Attachment
              key={file.id}
              size="sm"
              className={cn('w-64', activeId === file.id && 'border-port/60')}
            >
              <AttachmentMedia>
                <FileTypeIcon mime={file.mime} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {role ? `${role} · ` : null}
                  <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentTrigger
                aria-label={`${ui.letters.card.openFile}: ${file.name}`}
                title={ui.letters.card.openFile}
                onClick={() => onOpen(file.id)}
              />
              <AttachmentActions>
                <AttachmentAction asChild>
                  <a
                    href={file.url}
                    download={file.name}
                    aria-label={`${ui.letters.body.download}: ${file.name}`}
                    title={ui.letters.body.download}
                  >
                    <Download />
                  </a>
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          );
        })}
      </AttachmentGroup>
    </section>
  );
}
