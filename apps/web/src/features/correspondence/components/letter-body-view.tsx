import { FileX2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LetterAttachment, LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { FileViewerBody } from '../../../shared/files/file-viewer-body.js';
import type { ViewerTarget } from '../../../shared/files/viewer-store.js';

/** Цель общего просмотрщика по вложению письма. */
export function viewerTargetOf(attachment: LetterAttachment): ViewerTarget {
  return {
    fileId: attachment.fileId,
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    url: attachment.url,
    pdfUrl: attachment.pdfUrl,
  };
}

/**
 * Вкладка «Письмо» (#55, Р8; «Основной документ письма» #56): документ во
 * вьювере по ширине панели — выбор канцелярии (звезда) или PDF-копия текста
 * письма. Текст почты сам по себе НЕ показывается нигде — только PDF-копией
 * (вердикт владельца 28.10: «текст письма только pdf всегда»); конвертация
 * в полёте или отказала — пусто, отказ подсвечен флагом в полях карточки.
 * `attachmentId` — конкретное вложение (вкладка карточки).
 */
export function LetterBodyView({
  letter,
  attachmentId,
  empty,
}: {
  letter: LetterDetail;
  attachmentId?: string;
  /** Пустое тело: карточка — своё. */
  empty?: ReactNode;
}) {
  const byId = (id: string) => letter.attachments.find((a) => a.id === id);

  if (attachmentId) {
    const attachment = byId(attachmentId);
    return attachment ? <AttachmentView attachment={attachment} /> : null;
  }
  if (letter.body.kind === 'none') {
    return <>{empty ?? <BodyEmpty title={ui.letters.body.none} />}</>;
  }
  const main = byId(letter.body.attachmentId);
  if (!main) return <>{empty ?? <BodyEmpty title={ui.letters.body.none} />}</>;
  return <AttachmentView attachment={main} />;
}

function AttachmentView({ attachment }: { attachment: LetterAttachment }) {
  return <FileViewerBody key={attachment.fileId} target={viewerTargetOf(attachment)} fit="width" />;
}

export function BodyEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid size-full place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <span className="grid size-11 place-items-center rounded-[10px] bg-muted text-muted-foreground">
          <FileX2 className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
