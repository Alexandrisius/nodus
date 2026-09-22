import { useMemo, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { MailPlus } from 'lucide-react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useLettersList, type LettersFolder } from '../api/letters-api.js';
import {
  mailBuiltinPresets,
  letterSearchText,
  registryBuiltinPresets,
  useLetterFilterDefs,
} from '../lib/letter-filter-fields.js';
import { letterMailFields } from '../lib/letter-fields.js';
import { letterRegistryFields } from '../lib/registry-fields.js';
import { LetterComposeDialog } from '../components/letter-compose-dialog.js';
import { LettersTable } from '../components/letters-table.js';
import { MailboxSwitcher } from '../components/mailbox-switcher.js';
import { RegistryTable } from '../components/registry-table.js';

/** Корреспонденция (модель v2): папки Входящие / Отправленные — почтовый
 *  слой (незарегистрированные входящие — их часть, пресет «К регистрации»);
 *  Журнал — отдельный вид-реестр ТОЛЬКО документов (Вх/Исх). Шапка — ОДНА
 *  строка h-14: заголовок со счётчиком, переключатель ящиков «Общий / Личная»
 *  (задел направления), строка инструментов (поиск + панель фильтра,
 *  пресеты вида), «Написать письмо» и шестерёнка представления. */
export function LettersPage() {
  const search = useSearch({ strict: false }) as { folder?: string };
  const folder: LettersFolder = (['incoming', 'outgoing', 'registry'] as const).includes(
    search.folder as LettersFolder,
  )
    ? (search.folder as LettersFolder)
    : 'incoming';
  const registry = folder === 'registry';

  const { data } = useLettersList(folder);
  const count = data?.items.length ?? 0;
  const [composeOpen, setComposeOpen] = useState(false);

  const viewKey = registry ? 'letters.registry' : 'letters.mail';
  const presets = registry ? registryBuiltinPresets : mailBuiltinPresets;
  const toolbar = useListToolbar(viewKey, presets);
  const defs = useLetterFilterDefs(registry ? 'registry' : 'mail');
  const filter = useMemo<ActiveListFilter<LetterListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: letterSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">
          {ui.letters.title}
          <span className="ml-2 align-middle font-mono text-label-lg font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        </h1>
        <MailboxSwitcher />
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={defs}
          builtinPresets={presets}
          left={
            <Button onClick={() => setComposeOpen(true)}>
              <MailPlus data-icon="inline-start" />
              {ui.letters.compose}
            </Button>
          }
          right={
            <ViewSettings
              viewKey={viewKey}
              defs={registry ? letterRegistryFields : letterMailFields}
            />
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        {registry ? (
          <RegistryTable filter={filter} />
        ) : (
          <LettersTable folder={folder} filter={filter} />
        )}
      </div>
      <LetterComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
