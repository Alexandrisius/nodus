import { Mail } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { registerLinkPreview, type LinkPreviewProps } from '../../../shared/chat/link-previews.js';
import { useLetterDetail } from '../api/letters-api.js';

/** Карточка-превью письма в чате (модель v2: пересылка запрещена — вместо
 *  неё ссылка portal://letter/<id> или deep-ссылка стека, брошенная в чат,
 *  разворачивается превью: от кого, кому, тема, рег.№; клик — карточка в
 *  стеке). Регистрация в реестре link-previews — побочный эффект модуля:
 *  letter-card.tsx (eager-импорт стека) тянет этот файл на старте. */
export function LetterLinkPreview({ id }: LinkPreviewProps) {
  const { data: letter, isLoading } = useLetterDetail(id);
  const openCard = useOpenCard();

  if (isLoading || !letter) {
    return <Skeleton className="h-12 w-full max-w-sm" />;
  }

  const from = letter.type === 'outgoing' ? letter.mailbox.address : letter.counterparty.name;
  const to =
    letter.type === 'outgoing'
      ? letter.counterparty.name
      : letter.recipients.map((r) => r.displayName).join(', ') ||
        letter.registration?.addressee?.displayName ||
        ui.common.notSet;

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
        <span className="block truncate text-xs font-medium text-foreground">{letter.subject}</span>
        <span className="mt-0.5 block truncate text-label-sm text-muted-foreground">
          {ui.letters.from}: {from} · {ui.letters.to}: {to}
        </span>
      </span>
      <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
        {letter.registration?.regNumber ?? ui.letters.noRegistration}
      </span>
    </button>
  );
}

registerLinkPreview('letter', LetterLinkPreview);
