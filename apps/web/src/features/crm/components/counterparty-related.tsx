import { useMemo } from 'react';
import type { LetterListItem, ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter, FilterFieldDef } from '../../../shared/views/list-filters.js';
import { projectListFields } from '../../../shared/views/project-table-fields.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { relatedLetterFields } from '../lib/related-letter-fields.js';

const LETTERS_VIEW = 'crm.letters';
const PROJECTS_VIEW = 'crm.projects';
const noLetterDefs: FilterFieldDef<LetterListItem>[] = [];
const noProjectDefs: FilterFieldDef<ProjectListItem>[] = [];

const letterSearchText = (l: LetterListItem) =>
  [l.subject, l.registration?.regNumber].filter(Boolean).join(' ');
const projectSearchText = (p: ProjectListItem) => `${p.code} ${p.name}`;

function useSearch<T>(
  viewKey: string,
  items: T[],
  defs: FilterFieldDef<T>[],
  text: (row: T) => string,
) {
  const toolbar = useListToolbar(viewKey);
  const filter = useMemo<ActiveListFilter<T>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: text }),
    [defs, toolbar.filters, toolbar.query, text],
  );
  return { toolbar, rows: useFilteredList(items, filter) };
}

/**
 * Вкладка «Письма» карточки контрагента (#460) — обратная связь: переписка
 * с организацией списком с колонками (поиск + шестерёнка, «модули не
 * отличаются»). Письма здесь НЕ создаются: письмо рождается в почте/журнале
 * корреспонденции, контрагент в нём — поле (с #55 возможна кнопка «Написать»
 * с подставленным корреспондентом). Клик — карточка письма поверх стека.
 */
export function CounterpartyLettersTab({
  letters,
  isLoading,
}: {
  letters: LetterListItem[];
  isLoading: boolean;
}) {
  const openCard = useOpenCard();
  const { toolbar, rows } = useSearch(LETTERS_VIEW, letters, noLetterDefs, letterSearchText);
  return (
    <div className="flex h-full flex-col">
      <ListToolbar
        toolbar={toolbar}
        defs={noLetterDefs}
        right={<ViewSettings viewKey={LETTERS_VIEW} defs={relatedLetterFields} />}
      />
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey={LETTERS_VIEW}
          defs={relatedLetterFields}
          rows={rows}
          rowKey={(letter) => letter.id}
          isLoading={isLoading}
          emptyTitle={ui.counterparties.noLetters}
          rowMenu={(letter) => makeCardRowMenuItems({ kind: 'letter', id: letter.id }, openCard)}
          onOpenRow={(letter, rowEl) =>
            openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect())
          }
        />
      </div>
    </div>
  );
}

/**
 * Вкладка «Проекты» карточки контрагента (#460) — проекты, где организация —
 * заказчик; единый реестр колонок проектов (`projectListFields`, память
 * колонок — своя). Проекты здесь не создаются: это редкое действие
 * руководителя в модуле «Проекты», заказчик — поле проекта.
 */
export function CounterpartyProjectsTab({
  projects,
  isLoading,
}: {
  projects: ProjectListItem[];
  isLoading: boolean;
}) {
  const openCard = useOpenCard();
  const { toolbar, rows } = useSearch(PROJECTS_VIEW, projects, noProjectDefs, projectSearchText);
  return (
    <div className="flex h-full flex-col">
      <ListToolbar
        toolbar={toolbar}
        defs={noProjectDefs}
        right={<ViewSettings viewKey={PROJECTS_VIEW} defs={projectListFields} />}
      />
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey={PROJECTS_VIEW}
          defs={projectListFields}
          rows={rows}
          rowKey={(project) => project.id}
          isLoading={isLoading}
          emptyTitle={ui.counterparties.noProjects}
          rowMenu={(project) => makeCardRowMenuItems({ kind: 'project', id: project.id }, openCard)}
          onOpenRow={(project, rowEl) =>
            openCard({ kind: 'project', id: project.id }, rowEl.getBoundingClientRect())
          }
        />
      </div>
    </div>
  );
}
