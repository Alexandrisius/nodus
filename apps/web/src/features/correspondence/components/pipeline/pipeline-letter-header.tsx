import { Mail, ScanLine } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { letterSubject, receivedLabel } from '../../lib/letter-format.js';
import { LetterSenderLine } from '../letter-sender-line.js';

/**
 * Шапка письма в конвейере «Новые» (#56, вердикт владельца 28.10) — как в
 * почтовом клиенте: тема, отправитель полным адресом (в списке он
 * обрезается шириной строки), способ поступления и время. Вложения живут
 * отдельной колонкой слева от просмотра (см. PipelineAttachmentsRail).
 */
export function PipelineLetterHeader({
  letter,
  pending,
}: {
  letter: LetterDetail | undefined;
  pending: boolean;
}) {
  return (
    <div className="@container shrink-0 border-b border-border">
      <div className="flex h-12 items-center gap-2 px-4">
        {letter ? (
          <>
            {letter.source === 'manual' ? (
              <ScanLine
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
            ) : (
              <Mail
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm font-medium',
                !letter.subject && 'text-muted-foreground',
              )}
              title={letterSubject(letter)}
            >
              {letterSubject(letter)}
            </span>
            {/* Узкая зона письма: способ поступления дублирует значок строки
                очереди — уступает место теме. */}
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="@max-[600px]:hidden">{ui.letters.source[letter.source]} · </span>
              <span className="font-mono tabular-nums">{receivedLabel(letter.receivedAt)}</span>
            </span>
          </>
        ) : pending ? (
          <Skeleton className="h-4 w-64" />
        ) : null}
      </div>
      {letter ? <LetterSenderLine letter={letter} className="px-4 pb-2.5" /> : null}
    </div>
  );
}
