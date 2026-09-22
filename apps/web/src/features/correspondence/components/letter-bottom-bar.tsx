import { Archive, ScrollText } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { useArchiveLetter } from '../api/letters-api.js';

/** Замоноличенный нижний бар карточки письма (h-16, модель Битрикса):
 *  письмо — «Зарегистрировать»; документ — «Резолюция» (композер) и «В дело»
 *  (только из «исполнено», иначе кнопка выключена с подсказкой); помещённый
 *  в дело документ — чип «В деле». */
export function LetterBottomBar({
  letter,
  onRegister,
  onResolution,
}: {
  letter: LetterDetail;
  onRegister: () => void;
  onResolution: () => void;
}) {
  const archive = useArchiveLetter(letter.id);

  if (!letter.registration) {
    return (
      <>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRegister}>
          {ui.letters.register}
        </Button>
        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
          {ui.letters.needRegistration}
        </span>
      </>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onResolution}>
        <ScrollText data-icon="inline-start" />
        {ui.letters.resolutionCompose}
      </Button>
      {letter.documentStatus === 'executed' ? (
        <Button
          size="sm"
          className="shrink-0"
          disabled={archive.isPending}
          onClick={() => archive.mutate()}
        >
          <Archive data-icon="inline-start" />
          {ui.letters.archive}
        </Button>
      ) : letter.documentStatus === 'in_work' ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled
          title={ui.letters.archiveUnavailable}
        >
          <Archive data-icon="inline-start" />
          {ui.letters.archive}
        </Button>
      ) : (
        <NodeChip tone="success" className="shrink-0">
          <Archive className="size-3" strokeWidth={1.75} />
          {ui.letters.documentStatus.archived}
        </NodeChip>
      )}
    </>
  );
}
