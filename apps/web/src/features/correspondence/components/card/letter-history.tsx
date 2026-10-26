import { Cpu } from 'lucide-react';
import { useState } from 'react';
import type {
  CustomFieldDefinition,
  LetterHistoryChange,
  LetterHistoryEntry,
  LetterRegistrationField,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useCustomFieldDefinitions } from '../../../../shared/custom-fields/queries.js';
import { formatDateTimeShort } from '../../../../shared/lib/format.js';
import { PersonAvatar } from '../../../../shared/ui/person-avatar.js';
import { useLetterHistory } from '../../api/letters-queries.js';
import { formatIsoDate } from '../../lib/letter-format.js';
import { registrationFieldLabel } from '../../lib/registration-draft.js';

const events = ui.letters.card.historyEvents;
const DATE_FIELDS = new Set(['theirDate', 'responseDeadline']);

/** Подпись поля изменения: системное — по реестру формы, атрибут `cf.<id>` —
 *  по имени определения (удалённый атрибут — ключом как есть). */
function changeLabel(field: string, definitions: readonly CustomFieldDefinition[]): string {
  if (field.startsWith('cf.')) {
    return definitions.find((d) => d.id === field.slice(3))?.name ?? field;
  }
  return registrationFieldLabel[field as LetterRegistrationField] ?? field;
}

function changeValue(change: LetterHistoryChange, value: string | null): string {
  if (value === null || value === '') return events.empty;
  return DATE_FIELDS.has(change.field) ? formatIsoDate(value) : value;
}

function entryTitle(entry: LetterHistoryEntry): string {
  switch (entry.kind) {
    case 'received':
      return `${events.received} · ${ui.letters.source[entry.source]}`;
    case 'registered':
      return `${events.registered} · ${entry.regNumber}`;
    case 'updated':
      return events.updated;
    case 'stage_changed':
      return `${entry.transitionName}: ${entry.fromStageName} → ${entry.toStageName}`;
    case 'participant_joined':
      return events.participantJoined;
  }
}

function HistoryRow({
  entry,
  definitions,
}: {
  entry: LetterHistoryEntry;
  definitions: readonly CustomFieldDefinition[];
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      {entry.actor ? (
        <PersonAvatar
          name={entry.actor.displayName}
          avatarUrl={entry.actor.avatarUrl}
          className="size-6 shrink-0"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Cpu className="size-3.5" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="leading-6">
          <span className="font-medium">
            {entry.actor?.displayName ?? ui.letters.card.historySystem}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="wrap-anywhere">{entryTitle(entry)}</span>
        </p>
        {entry.kind === 'updated' ? (
          <ul className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {entry.changes.map((change) => (
              <li key={change.field} className="wrap-anywhere">
                <span className="text-secondary-foreground">
                  {changeLabel(change.field, definitions)}:
                </span>{' '}
                {changeValue(change, change.from)} → {changeValue(change, change.to)}
              </li>
            ))}
          </ul>
        ) : null}
        {entry.kind === 'stage_changed' && entry.comment ? (
          <p className="mt-0.5 text-xs whitespace-pre-wrap text-muted-foreground wrap-anywhere">
            {entry.comment}
          </p>
        ) : null}
      </div>
      <time
        dateTime={entry.at}
        className="shrink-0 pt-0.5 font-mono text-label-sm text-muted-foreground tabular-nums"
      >
        {formatDateTimeShort(entry.at)}
      </time>
    </li>
  );
}

/**
 * «История» карточки письма (#55, Р11: журнал событий агрегата `letter`) —
 * свёрнута по умолчанию, запрос — при раскрытии; новые сверху, «Показать
 * ещё» — старые страницы курсором. Изменения данных — построчно «поле:
 * было → стало» (даты — ДД.ММ.ГГГГ, пустое — «пусто»).
 */
export function LetterHistory({ letterId }: { letterId: string }) {
  const [open, setOpen] = useState(false);
  const query = useLetterHistory(letterId, open);
  const { data: definitions = [] } = useCustomFieldDefinitions('letter');
  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="mt-7">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-mx-1 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40"
      >
        <NodeLabel label={ui.letters.card.history} chevron={open ? 'down' : 'right'} />
      </button>
      {open ? (
        <div className="mt-1">
          {query.isLoading ? (
            <div className="flex flex-col gap-2 py-2">
              <Skeleton className="h-6 w-full max-w-lg" />
              <Skeleton className="h-6 w-full max-w-md" />
            </div>
          ) : query.isError && entries.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              {ui.letters.card.historyLoadError}
              <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                {ui.letters.list.retry}
              </Button>
            </p>
          ) : entries.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">{ui.letters.card.historyEmpty}</p>
          ) : (
            <>
              <ol className="flex flex-col">
                {entries.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} definitions={definitions} />
                ))}
              </ol>
              {query.hasNextPage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  className="mt-1 text-muted-foreground"
                >
                  {ui.letters.card.historyMore}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
