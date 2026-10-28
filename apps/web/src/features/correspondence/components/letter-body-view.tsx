import { FileX2, ImageOff } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { LetterAttachment, LetterDetail } from '@nodus/contracts';
import { LETTER_LIMITS, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Spinner } from '@nodus/ui/components/spinner';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { LinkifiedText } from '../../../shared/chat/message-text.js';
import { DownloadCard } from '../../../shared/files/download-card.js';
import { FileViewerBody } from '../../../shared/files/file-viewer-body.js';
import type { ViewerTarget } from '../../../shared/files/viewer-store.js';
import { SandboxedHtml, useEmailSheetColors } from '../../../shared/html/sandboxed-html.js';
import { useLetterBodyText } from '../api/letters-queries.js';

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

/** Только сама часть «тело письма» (role body): обычное вложение с mime
 *  text/plain — это файл, а не тело, и открывается общим просмотрщиком
 *  (вердикт владельца 28.10: .txt должен читаться, а не показывать нули). */
const isTextBody = (a: LetterAttachment) => a.role === 'body';

/** Текстовая часть письма (role body) рядом с главным документом — основа
 *  неснимаемой вкладки «Текст письма» (редизайн #56): есть только когда
 *  главное — документ (скан/PDF), а текст почты — отдельная часть. */
export function letterTextPart(letter: LetterDetail): LetterAttachment | null {
  if (letter.body.kind !== 'document') return null;
  return letter.attachments.find(isTextBody) ?? null;
}

/** contentId → абсолютный URL вложения (Р11): резолв cid: картинок HTML-тела
 *  на показе; ссылка подписанная и того же происхождения (CSP 'self'). */
function cidMapOf(letter: LetterDetail): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of letter.attachments) {
    if (file.contentId) map[file.contentId] = new URL(file.url, window.location.origin).href;
  }
  return map;
}

/**
 * Тело письма и его вложения (#55, Р8; #56 — cid-картинки): главный документ
 * — общим просмотрщиком по ширине панели; HTML — песочница с «Показать
 * изображения» и резолвом inline-картинок; text/plain — читательской
 * колонкой со ссылками. Текстовая часть почты при документе — отдельная
 * вкладка карточки (`letterTextPart`), переключателя здесь нет.
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
  const cidMap = useMemo(() => cidMapOf(letter), [letter]);

  if (attachmentId) {
    const attachment = byId(attachmentId);
    return attachment ? <AttachmentView attachment={attachment} cidMap={cidMap} /> : null;
  }
  if (letter.body.kind === 'none') {
    return <>{empty ?? <BodyEmpty title={ui.letters.body.none} />}</>;
  }
  const main = byId(letter.body.attachmentId);
  if (!main) return <>{empty ?? <BodyEmpty title={ui.letters.body.none} />}</>;
  return <AttachmentView attachment={main} cidMap={cidMap} />;
}

function AttachmentView({
  attachment,
  cidMap,
}: {
  attachment: LetterAttachment;
  cidMap: Record<string, string>;
}) {
  if (isTextBody(attachment)) return <TextBody attachment={attachment} cidMap={cidMap} />;
  return <FileViewerBody key={attachment.fileId} target={viewerTargetOf(attachment)} fit="width" />;
}

function TextBody({
  attachment,
  cidMap,
}: {
  attachment: LetterAttachment;
  cidMap: Record<string, string>;
}) {
  const query = useLetterBodyText(attachment);
  const theme = useShellStore((s) => s.theme);
  const sheet = useEmailSheetColors(theme);
  const [allowImages, setAllowImages] = useState(false);
  const [blocked, setBlocked] = useState(0);

  // Больше 2 МБ — не читаем в память вкладки: карточка скачивания (Р9).
  if (attachment.size > LETTER_LIMITS.bodyPreviewBytes || query.data?.kind === 'too_large') {
    return (
      <DownloadCard
        name={attachment.name}
        size={attachment.size}
        url={attachment.url}
        reason="too_large"
      />
    );
  }
  if (query.isError) return <BodyEmpty title={ui.letters.body.loadError} />;
  if (!query.data) {
    return (
      <div className="grid size-full place-items-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (attachment.mime === 'text/html') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {blocked > 0 && !allowImages ? (
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4 text-xs text-muted-foreground">
            <ImageOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {/* Узкая зона письма: обрезается подпись, счётчик скрытых картинок
                остаётся видимым (число — данные, не текст). */}
            <span
              className="min-w-0 truncate"
              title={`${ui.letters.body.imagesBlocked} ${blocked}`}
            >
              {ui.letters.body.imagesBlocked}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{blocked}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 shrink-0"
              onClick={() => setAllowImages(true)}
            >
              {ui.letters.body.showImages}
            </Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <SandboxedHtml
            html={query.data.text}
            allowRemoteImages={allowImages}
            cidMap={cidMap}
            onBlockedImages={setBlocked}
            title={ui.letters.body.frameTitle}
            theme={theme}
            sheet={sheet}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-3xl text-sm leading-relaxed whitespace-pre-wrap text-foreground wrap-anywhere">
        <LinkifiedText text={query.data.text} />
      </div>
    </div>
  );
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
