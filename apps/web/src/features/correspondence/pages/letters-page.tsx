import { useMemo, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { MailPlus } from 'lucide-react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useLettersList, type LettersFolder } from '../api/letters-api.js';
import {
  letterBuiltinPresets,
  letterSearchText,
  useLetterFilterDefs,
} from '../lib/letter-filter-fields.js';
import { letterJournalFields } from '../lib/letter-fields.js';
import { LetterComposeDialog } from '../components/letter-compose-dialog.js';
import { LettersJournal } from '../components/letters-journal.js';

/** Письма: журнал по канону таблиц (shared/views) + папки-чипы в топбаре
 *  (Входящие / Незарегистрированные / Исходящие — секции каркаса).
 *  Шапка — ОДНА строка: заголовок со счётчиком, строка инструментов (поиск
 *  с панелью фильтра — модель Битрикс24: пресеты «В работе»/«Просрочено»,
 *  поля статус/адресат/корреспондент/срок), чип очереди регистрации (всегда
 *  на виду у секретаря), «Написать письмо» и шестерёнка представления. */
export function LettersPage() {
  const search = useSearch({ strict: false }) as { folder?: string };
  const folder: LettersFolder = (['unregistered', 'incoming', 'outgoing'] as const).includes(
    search.folder as LettersFolder,
  )
    ? (search.folder as LettersFolder)
    : 'incoming';

  const { data } = useLettersList(folder);
  // Очередь регистрации — всегда на виду у секретаря (тот же query-ключ при
  // folder=unregistered: react-query дедуплицирует).
  const { data: unregistered } = useLettersList('unregistered');
  const count = data?.items.length ?? 0;
  const unregCount = unregistered?.items.length ?? 0;
  const [composeOpen, setComposeOpen] = useState(false);
  const toolbar = useListToolbar('letters.journal', letterBuiltinPresets);
  const defs = useLetterFilterDefs();
  const filter = useMemo<ActiveListFilter<LetterListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: letterSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">
          {ui.letters.title}
          <span className="ml-2 align-middle font-mono text-sm font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        </h1>
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={defs}
          builtinPresets={letterBuiltinPresets}
          right={
            <>
              {unregCount > 0 ? (
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] tracking-[0.12em] uppercase',
                    'bg-warning/15 text-warning',
                  )}
                >
                  <span className="font-semibold tabular-nums">{unregCount}</span>
                  {ui.letters.summaryUnregistered}
                </span>
              ) : null}
              <Button size="sm" onClick={() => setComposeOpen(true)}>
                <MailPlus data-icon="inline-start" />
                {ui.letters.compose}
              </Button>
              <ViewSettings viewKey="letters.journal" defs={letterJournalFields} />
            </>
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        <LettersJournal folder={folder} filter={filter} />
      </div>
      <LetterComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
