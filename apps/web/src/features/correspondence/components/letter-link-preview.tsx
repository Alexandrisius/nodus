import { Mail } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { registerLinkPreview, type LinkPreviewProps } from '../../../shared/chat/link-previews.js';
import { useLetterDetail } from '../api/letters-queries.js';
import { letterNumber, letterSubject } from '../lib/letter-format.js';

/** Превью письма в чате (#55): ссылка `portal://letter/<id>` или deep-ссылка
 *  стека разворачивается карточкой — тема, корреспондент и статус, номер;
 *  клик — карточка письма в стеке. Нет доступа или письма — объяснение
 *  вместо вечного скелета. Регистрация в реестре link-previews — побочный
 *  эффект модуля: карточка письма (eager-импорт стека) тянет его на старте. */
export function LetterLinkPreview({ id }: LinkPreviewProps) {
  const { data: letter, isLoading, isError } = useLetterDetail(id);
  const openCard = useOpenCard();

  if (isLoading) return <Skeleton className="h-12 w-full max-w-sm" />;
  if (isError || !letter) {
    return (
      <div className="node-panel flex w-full max-w-sm items-center gap-2.5 p-2.5 text-xs text-muted-foreground">
        <Mail className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        {ui.letters.card.notFound}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openCard({ kind: 'letter', id: letter.id })}
      className="node-panel flex w-full max-w-sm items-center gap-2.5 p-2.5 text-left transition-colors hover:border-port/60"
    >
      <span className="node-panel flex size-8 shrink-0 items-center justify-center">
        <Mail className="size-4 text-muted-foreground" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-xs font-medium',
            letter.subject ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {letterSubject(letter)}
        </span>
        <span className="mt-0.5 block truncate text-label-sm text-muted-foreground">
          {[letter.counterparty?.name, letter.stage.name].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
        {letterNumber(letter)}
      </span>
    </button>
  );
}

registerLinkPreview('letter', LetterLinkPreview);
