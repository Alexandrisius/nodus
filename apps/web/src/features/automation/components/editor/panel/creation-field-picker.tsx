import { useMemo, useState } from 'react';
import type {
  CreationFieldKey,
  CreationForm,
  CustomFieldDefinition,
  ProcessType,
} from '@nodus/contracts';
import {
  CREATION_FORM_LIMITS,
  TASK_CREATION_SYSTEM_KEYS,
  customFieldKey,
  slotLabel,
  ui,
} from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { Plus } from 'lucide-react';

import { projectsAvailable } from '../../../../../shared/api/projects-available.js';
import { useCustomFieldDefinitions } from '../../../../../shared/custom-fields/queries.js';
import { useCanManageFields } from '../../../../../shared/custom-fields/use-can-manage-fields.js';
import { useBindFieldType } from '../../../api/custom-fields-api.js';
import { unusedKeys } from '../../../model/creation-form.js';
import { FieldDialog } from '../../fields/field-dialog.js';

/**
 * «+ Поле» панели «Окно создания» (#432, Р12): группы «Системные»,
 * «Атрибуты типа», «Добавить в тип» и «Создать атрибут…». В форму попадают
 * только привязанные к типу атрибуты (Р8): чужой атрибут сначала
 * привязывается (быстрый путь) — иначе публикация отклонила бы форму.
 */
export function CreationFieldPicker({
  type,
  form,
  readOnly,
  onPick,
}: {
  type: ProcessType;
  form: CreationForm;
  readOnly: boolean;
  onPick: (key: CreationFieldKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: definitions } = useCustomFieldDefinitions(type.category);
  const canManageFields = useCanManageFields();

  const inType = useMemo(
    () => (definitions ?? []).filter((d) => d.typeIds.includes(type.id) && !d.hidden),
    [definitions, type.id],
  );
  const notInType = useMemo(
    () => (definitions ?? []).filter((d) => !d.typeIds.includes(type.id) && !d.hidden),
    [definitions, type.id],
  );
  const freeSystem = unusedKeys(
    form,
    TASK_CREATION_SYSTEM_KEYS.filter((key) => key !== 'project' || projectsAvailable()),
  );
  const freeAttributes = unusedKeys(
    form,
    inType.map((definition) => customFieldKey(definition.id)),
  );
  const full = form.fields.length >= CREATION_FORM_LIMITS.fields;
  const empty = freeSystem.length === 0 && freeAttributes.length === 0 && notInType.length === 0;

  function pick(key: CreationFieldKey) {
    onPick(key);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={readOnly || full}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            {ui.automation.creation.addField}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="nokey w-72 p-1.5">
          {empty ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {ui.automation.creation.pickerEmpty}
            </p>
          ) : (
            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto" data-no-scrollbar>
              {freeSystem.length > 0 ? (
                <Group title={ui.automation.creation.groups.system}>
                  {freeSystem.map((key) => (
                    <Row key={key} onClick={() => pick(key)}>
                      {ui.taskCreate.fields[key as keyof typeof ui.taskCreate.fields]}
                    </Row>
                  ))}
                </Group>
              ) : null}

              {freeAttributes.length > 0 ? (
                <Group title={ui.automation.creation.groups.attributes}>
                  {inType
                    .filter((d) => freeAttributes.includes(customFieldKey(d.id)))
                    .map((definition) => (
                      <Row key={definition.id} onClick={() => pick(customFieldKey(definition.id))}>
                        {definition.name}
                      </Row>
                    ))}
                </Group>
              ) : null}

              {canManageFields && notInType.length > 0 ? (
                <Group title={ui.automation.creation.groups.addToType}>
                  {notInType.map((definition) => (
                    <BindRow
                      key={definition.id}
                      definition={definition}
                      typeId={type.id}
                      onBound={() => pick(customFieldKey(definition.id))}
                    />
                  ))}
                </Group>
              ) : null}
            </div>
          )}
          {canManageFields ? (
            <div className="mt-1 border-t border-border pt-1">
              <Row
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                {ui.automation.creation.groups.createAttribute}
              </Row>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {createOpen ? (
        <FieldDialog
          mode={{ kind: 'create', scope: type.category, presetTypeId: type.id }}
          definitions={definitions ?? []}
          canManage={canManageFields}
          onClose={() => setCreateOpen(false)}
          onSaved={(id) => {
            setCreateOpen(false);
            onPick(customFieldKey(id));
          }}
        />
      ) : null}
    </>
  );
}

/** Строка «Добавить в тип»: привязка атрибута к типу и сразу выбор в форму.
 *  Хук привязки — свой на строку (id атрибута известен до клика). */
function BindRow({
  definition,
  typeId,
  onBound,
}: {
  definition: CustomFieldDefinition;
  typeId: string;
  onBound: () => void;
}) {
  const bind = useBindFieldType(definition.id);
  return (
    <Row
      onClick={() => {
        bind.mutate(typeId);
        onBound();
      }}
    >
      {definition.name}
    </Row>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="px-1.5 py-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-accent/60"
    >
      {children}
    </button>
  );
}

/** Подпись поля формы для группы «Системные» (своё название — у слота). */
export function systemFieldLabel(key: CreationFieldKey): string {
  return slotLabel({ key, label: null, required: false, preset: null });
}
