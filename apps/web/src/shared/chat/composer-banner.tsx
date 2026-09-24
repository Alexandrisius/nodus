import { Pencil, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import type { ChatDraft } from './chat-drafts.js';

/** Подпись медийного оригинала без текста (канон Telegram reply_media:
 *  «Фото» / «Файл» в цитате). */
function replySnippet(draft: ChatDraft): string {
  const reply = draft.reply;
  if (!reply) return '';
  if (reply.quoteText) return `«${reply.quoteText}»`;
  if (reply.snippet) return reply.snippet;
  return reply.attachmentKind === 'image' ? ui.chat.quotePhoto : ui.chat.quoteFile;
}

/**
 * Бар режима композера (A2/A4, #87): ответ-цитата ИЛИ правка — одна механика
 * (канон tdesktop: режимы взаимоисключающие, edit-бар замещает reply-бар).
 * Ответ: имя автора (info) + сниппет/фрагмент; клик по телу — прыжок к
 * оригиналу (Ctrl+клик reply-бара tdesktop 4.11.2 — у нас обычный клик:
 * веб-канон Slack/Discord). Правка: метка «Редактирование сообщения» +
 * оригинальный текст. Крестик и Esc отменяют режим (Esc-каскад — канон
 * Discord: сначала режимы композера, потом слайдер).
 * Плоско: ступень тона bg-accent/40, акцентная линия слева (info), без
 * разделителей (канон 24.09: линии — только границы функциональных зон).
 */
export function ComposerBanner({
  draft,
  onCancel,
  onJump,
}: {
  draft: ChatDraft;
  onCancel: () => void;
  onJump?: () => void;
}) {
  const isEdit = draft.edit !== null;
  return (
    <span className="flex items-stretch gap-1.5 rounded-t-[10px] bg-accent/40 py-1.5 pr-1.5 pl-2.5">
      <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-info" />
      {isEdit ? (
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-info">
            <Pencil className="size-3" strokeWidth={1.75} />
            {ui.chat.editBanner}
          </span>
          <span className="truncate text-xs text-muted-foreground">{draft.edit?.originalText}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={onJump}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-1 text-left transition-colors hover:bg-accent/60"
        >
          <span className="truncate text-xs font-semibold text-info">
            {draft.reply?.author.displayName}
          </span>
          <span className="truncate text-xs text-muted-foreground">{replySnippet(draft)}</span>
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 self-center text-muted-foreground"
        onClick={onCancel}
        aria-label={ui.common.cancel}
      >
        <X />
      </Button>
    </span>
  );
}
