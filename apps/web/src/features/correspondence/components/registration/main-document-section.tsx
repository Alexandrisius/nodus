import { Star } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

import { useSetMainDocument } from '../../api/letters-mutations.js';
import { mainDocumentCandidates, mainDocumentOf } from '../../lib/letter-main-document.js';

/**
 * «Основной документ» в окне регистрации («Основной документ письма» #56):
 * окно — контроль пропусков, пропуск «какой документ регистрируем» — здесь.
 * Кандидаты (файлы + PDF-копия тела) списком со звездой; клик выбирает —
 * карточка и вкладка «Письмо» меняются сразу (мутация оптимистична).
 * После регистрации блок только показывает выбор (заморожен).
 */
export function MainDocumentSection({ letter }: { letter: LetterDetail }) {
  const setMain = useSetMainDocument(letter.id);
  const candidates = mainDocumentCandidates(letter);
  const main = mainDocumentOf(letter);
  const invalid = main === null;
  const editable = letter.access.canEdit && letter.registeredAt === null;
  if (candidates.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border p-3',
        invalid && 'border-danger/60',
      )}
    >
      <p className="text-sm font-medium text-foreground">{ui.letters.card.mainDocument.label}</p>
      <p className="text-xs text-muted-foreground">{ui.letters.card.mainDocument.pick}</p>
      <div className="flex flex-col gap-1">
        {candidates.map((file) => {
          const active = main?.id === file.id;
          return (
            <button
              key={file.id}
              type="button"
              disabled={!editable || setMain.isPending}
              aria-pressed={active}
              aria-label={
                active
                  ? ui.letters.card.mainDocument.starActive
                  : `${ui.letters.card.mainDocument.star}: ${file.name}`
              }
              onClick={() => {
                if (!active) setMain.mutate(file.id);
              }}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                editable && 'hover:bg-accent',
                active && 'bg-accent/60',
              )}
            >
              <Star
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active ? 'fill-warning text-warning' : 'text-muted-foreground',
                )}
                strokeWidth={1.75}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
              {file.role === 'body_pdf' ? (
                <NodeChip tone="muted">{ui.letters.card.fileRoles.body_pdf}</NodeChip>
              ) : null}
            </button>
          );
        })}
      </div>
      {invalid ? (
        <p className="text-xs text-danger">{ui.letters.card.mainDocument.required}</p>
      ) : null}
    </div>
  );
}
