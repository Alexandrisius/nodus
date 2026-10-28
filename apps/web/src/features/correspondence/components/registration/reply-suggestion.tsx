import { CornerDownRight } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { NodeChip } from '@nodus/ui/components/node-chip';

import type { RegistrationDraft } from '../../lib/registration-draft.js';

/**
 * Связь «ответ на» в форме регистрации (#56, Р5): авто-связь по почтовой
 * цепочке — факт с чипом номера; нечёткая подсказка по теме — галочка Вики
 * («Похоже, ответ на Исх-2026/45 — Связать как ответ»). Ошибка сервера
 * (422 LETTER_RELATION_INVALID) подсвечивается под чипом.
 */
export function ReplySuggestion({
  letter,
  value,
  invalid,
  onToggle,
}: {
  letter: LetterDetail;
  value: RegistrationDraft;
  invalid?: string;
  onToggle: (linkReply: boolean) => void;
}) {
  if (letter.replyTo) {
    return (
      <div data-reg-field="replyToLetterId" className="flex items-center gap-1.5 text-xs">
        <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {ui.letters.pipeline.replyBadge}{' '}
        <NodeChip tone="info">{letter.replyTo.regNumber ?? letter.replyTo.subject}</NodeChip>
      </div>
    );
  }
  if (!value.suggestedReply) return null;
  return (
    <div
      data-reg-field="replyToLetterId"
      className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-muted/50 px-3 py-2"
    >
      <label className="flex min-w-0 items-center gap-2 text-xs text-foreground">
        <Checkbox
          checked={value.linkReply}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={ui.letters.form.replyConfirm}
        />
        <span className="min-w-0 truncate">
          {ui.letters.form.replyChip}{' '}
          <NodeChip tone="info">{value.suggestedReply.regNumber}</NodeChip>
          <span className="text-muted-foreground"> — {ui.letters.form.replyConfirm}</span>
        </span>
      </label>
      {invalid ? <p className="text-xs text-danger">{invalid}</p> : null}
    </div>
  );
}
