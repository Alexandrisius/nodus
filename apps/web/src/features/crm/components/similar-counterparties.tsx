import type { CounterpartyMatch } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useSimilarCounterparties } from '../../../shared/counterparties/queries.js';

/** Строка совпадения: название, УНП, пометка «в архиве». */
function MatchRow({ match, onOpen }: { match: CounterpartyMatch; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(match.id)}
      title={match.fullName}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/60"
    >
      <span className="min-w-0 flex-1 truncate">{match.shortName}</span>
      {match.unp ? (
        <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
          {match.unp}
        </span>
      ) : null}
      {match.archivedAt ? (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-label-sm text-muted-foreground">
          {ui.counterparties.similarArchived}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Панель «Похожие в справочнике» в окне создания контрагента (#460):
 * показывается, пока пользователь набирает название или УНП — чтобы дубль не
 * появился («Сложнее: дубли» ADR-0033). Клик открывает существующую карточку.
 */
export function SimilarCounterparties({
  name,
  unp,
  onOpen,
}: {
  name: string;
  unp: string;
  onOpen: (id: string) => void;
}) {
  const { data = [] } = useSimilarCounterparties({ name, unp });
  if (data.length === 0) return null;

  return (
    <div className="node-panel flex flex-col gap-1 p-2" aria-live="polite">
      <div className="px-1.5 text-label-sm font-medium text-muted-foreground uppercase">
        {ui.counterparties.similarTitle}
      </div>
      {data.map((match) => (
        <MatchRow key={match.id} match={match} onOpen={onOpen} />
      ))}
      <p className="px-1.5 text-xs text-muted-foreground">{ui.counterparties.similarHint}</p>
    </div>
  );
}
