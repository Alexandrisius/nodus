import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { CustomFieldScope } from '@nodus/contracts';

import { useCustomFieldDefinitions } from '../../../../shared/custom-fields/queries.js';
import { useCanManageFields } from '../../../../shared/custom-fields/use-can-manage-fields.js';
import { FieldCreateDialog } from './field-create-dialog.js';
import { FieldEditor, FieldEditorEmpty } from './field-editor.js';
import { FieldList } from './field-list.js';

/**
 * Вкладка «Поля» (#431, ADR-0029): слева реестр по областям, справа редактор
 * выбранного поля. Маршрут — `/automation?tab=fields[&scope=<область>]
 * [&field=<id>]`: глубокая ссылка из карточки («Настроить») открывает нужную
 * область и поле. Права на правку — `custom_field.manage` (Р13).
 */
export function FieldsTab() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { scope?: CustomFieldScope; field?: string };
  const canManage = useCanManageFields();
  const [createOpen, setCreateOpen] = useState(false);
  const query = useCustomFieldDefinitions();
  const definitions = query.data ?? [];
  const selected = definitions.find((definition) => definition.id === search.field) ?? null;

  const select = (id: string) => {
    void navigate({
      to: '/automation',
      search: (prev) => ({ ...prev, tab: 'fields', field: id }),
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <FieldList
        definitions={definitions}
        isLoading={query.isLoading}
        isError={query.isError}
        selectedId={selected?.id ?? null}
        canManage={canManage}
        onSelect={select}
        onCreate={() => setCreateOpen(true)}
        onRetry={() => void query.refetch()}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <FieldEditor
            key={selected.id}
            definition={selected}
            definitions={definitions}
            canManage={canManage}
          />
        ) : (
          <FieldEditorEmpty />
        )}
      </main>
      {createOpen ? (
        <FieldCreateDialog
          defaultScope={search.scope}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            select(id);
          }}
        />
      ) : null}
    </div>
  );
}
