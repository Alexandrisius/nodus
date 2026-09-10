import { useSearch } from '@tanstack/react-router';
import { MailPlus } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { plural } from '../../../shared/lib/format.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useLettersList, type LettersFolder } from '../api/letters-api.js';
import { letterJournalFields } from '../lib/letter-fields.js';
import { LetterComposeDialog } from '../components/letter-compose-dialog.js';
import { LettersJournal } from '../components/letters-journal.js';

/** Письма: журнал по канону таблиц (shared/views) + папки-чипы в топбаре
 *  (Входящие / Незарегистрированные / Исходящие — секции каркаса).
 *  Шапка — живая сводка (писем в папке + счётчик очереди регистрации),
 *  «Написать письмо» (создание исходящего — почтовый клиент, вердикт
 *  владельца 2026-09-10, раунд 2) и шестерёнка представления. */
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

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.letters.title}</h1>
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
            <span className="text-foreground tabular-nums">{count}</span>{' '}
            {plural(count, [ui.letters.countOne, ui.letters.countFew, ui.letters.countMany])}
            <span className="mx-2 text-border">·</span>
            {ui.letters.summaryUnregistered}{' '}
            <span
              className={cn('tabular-nums', unregCount > 0 ? 'text-warning' : 'text-foreground')}
            >
              {unregCount}
            </span>
          </p>
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <MailPlus data-icon="inline-start" />
            {ui.letters.compose}
          </Button>
          <ViewSettings viewKey="letters.journal" defs={letterJournalFields} />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <LettersJournal folder={folder} />
      </div>
      <LetterComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
