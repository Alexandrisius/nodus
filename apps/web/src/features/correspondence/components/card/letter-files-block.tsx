import { Download, Star } from 'lucide-react';
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
import { useSetMainDocument } from '../../api/letters-mutations.js';
import { mainDocumentCandidates, mainDocumentOf } from '../../lib/letter-main-document.js';

/** Файлы письма для показа: текст письма (`.txt`/`.html`) чипом НЕ
 *  показывается — материальная форма текста только PDF-копия («Основной
 *  документ письма», вердикт владельца 28.10: «текст письма только pdf
 *  всегда»), сам текст — вкладкой «Текст письма»; исходник (.eml, #56) —
 *  служебный, inline-картинки (#56, Р9) — внутри «Письма». */
export function visibleLetterFiles(letter: LetterDetail) {
  return letter.attachments.filter(
    (file) => file.role !== 'source' && file.role !== 'body' && !file.inline,
  );
}

/**
 * Блок «Файлы» карточки письма (#55): главный документ, PDF-копия текста и
 * приложения плитками. Клик — файл во вкладке правой панели, открытый сейчас
 * — с контуром порта; скачивание — кнопкой
 * плитки. Метки особых вложений почты (#56) — чипом в описании. Нет
 * файлов — блока нет (пустых заделов не держим).
 *
 * «Основной документ письма» (#56): у кандидатов (когда их больше одного и
 * письмо ещё не зарегистрировано) — звезда: золотая = документ открывает
 * вкладку «Письмо» и получит номер; клик по другой звезде меняет выбор
 * мгновенно (оптимистично, I4).
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
  const setMain = useSetMainDocument(letter.id);
  const main = mainDocumentOf(letter);
  const candidates = mainDocumentCandidates(letter);
  // Звезда нужна только для выбора: один кандидат — выбирать не из чего,
  // после регистрации выбор заморожен.
  const canStar = candidates.length > 1 && letter.access.canEdit && letter.registeredAt === null;
  if (files.length === 0) return null;

  return (
    <section className="mt-7">
      <NodeLabel label={ui.letters.card.files} count={files.length} />
      <AttachmentGroup className="mt-2 flex-wrap overflow-visible">
        {files.map((file) => {
          // Подпись под файлом — только размер (приёмка 28.10: метки ролей
          // и особых вложений из чипа убраны; «Текст письма» отличает PDF-копию
          // только звезда и состав, «Электронная подпись» — имя .p7s).
          const isMain = main?.id === file.id;
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
                  <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentTrigger
                aria-label={`${ui.letters.card.openFile}: ${file.name}`}
                title={ui.letters.card.openFile}
                onClick={() => onOpen(file.id)}
              />
              <AttachmentActions>
                {canStar ? (
                  <AttachmentAction asChild>
                    <button
                      type="button"
                      aria-pressed={isMain}
                      aria-label={
                        isMain
                          ? ui.letters.card.mainDocument.starActive
                          : `${ui.letters.card.mainDocument.star}: ${file.name}`
                      }
                      title={
                        isMain
                          ? ui.letters.card.mainDocument.starActive
                          : ui.letters.card.mainDocument.star
                      }
                      disabled={setMain.isPending}
                      onClick={() => {
                        if (!isMain) setMain.mutate(file.id);
                      }}
                    >
                      <Star
                        className={cn(
                          'size-4 transition-colors',
                          isMain ? 'fill-warning text-warning' : 'text-muted-foreground',
                        )}
                        strokeWidth={1.75}
                      />
                    </button>
                  </AttachmentAction>
                ) : null}
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
