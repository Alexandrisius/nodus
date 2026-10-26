import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { CreationFieldKey, ProcessType } from '@nodus/contracts';
import { ErrorCode, slotLabel, typeConfigOf, typeCreationFormOf, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '../api-client.js';
import { automationKeys } from '../api/automation-keys.js';
import { defaultTaskType, useCreatableProcessTypes } from '../api/process-types-api.js';
import { useCreateTask } from '../api/task-create.js';
import { useCanManageWorkflows } from '../api/use-can-manage-workflows.js';
import { useCustomFieldDefinitions, visibleDefinitions } from '../custom-fields/queries.js';
import { ProcessTypeGlyph } from '../workflow/process-type-icon.js';
import { TaskCreateChips } from './task-create-chips.js';
import {
  buildCreateBody,
  emptyDraft,
  missingFor,
  withTitle,
  withType,
  withValue,
  type TaskCreateDraft,
  type TaskCreatePrefill,
} from './task-create-draft.js';
import { FormSkeleton } from './task-create-skeleton.js';
import { TaskCreateFormBody, TaskCreateTitleField } from './task-create-form-body.js';

/** Форма без типа (типы не загрузились): пустая — низ окна покажет заглушку. */
const EMPTY_FORM = { fields: [], chips: [] };

/**
 * Единое окно создания задачи (#432, В1/Р9): верх зафиксирован — название
 * и тип, низ — форма выбранного типа, перестраивается на лету. Значения
 * живут в черновике по ключу слота: смена типа не стирает совместимое.
 * «Создать» неактивна, пока пусто название или обязательное поле; живая
 * строка «Не хватает: …» — `aria-describedby`. Создание пессимистичное:
 * номер, стадию и скрытые значения назначает сервер.
 */
export function TaskCreateWindow({
  open,
  prefill,
  onClose,
}: {
  open: boolean;
  prefill: TaskCreatePrefill | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCanManageWorkflows();
  const create = useCreateTask();
  const { data: types, isLoading: typesLoading } = useCreatableProcessTypes();
  const { data: definitions } = useCustomFieldDefinitions('task');
  const [draft, setDraft] = useState<TaskCreateDraft>(() => emptyDraft(prefill ?? {}));
  const [invalidKeys, setInvalidKeys] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Чистое окно при каждом открытии (рендер-тайм сброс, канон React, аудит #45).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setDraft(emptyDraft(prefill ?? {}));
      setInvalidKeys(new Set());
      setError(null);
    }
  }
  // Заполнение могло смениться между открытиями (плюсик другой колонки).
  const [prevPrefill, setPrevPrefill] = useState(prefill);
  if (open && prefill !== prevPrefill) {
    setPrevPrefill(prefill);
    setDraft(emptyDraft(prefill ?? {}));
    setInvalidKeys(new Set());
    setError(null);
  }

  const shownType: ProcessType | undefined =
    types?.find((type) => type.id === draft.typeId) ?? defaultTaskType(types);
  // Форма — из типа (эффективная форма опубликованного маршрута, Р2).
  const effectiveForm = shownType ? typeCreationFormOf(shownType) : EMPTY_FORM;

  const missing = shownType ? missingFor(effectiveForm, draft) : [];
  const canSubmit =
    draft.title.trim().length > 0 && missing.length === 0 && shownType !== undefined;
  const fieldDefs = useMemo(() => visibleDefinitions(definitions), [definitions]);
  const missingText = missing
    .map((key) =>
      slotLabel(
        effectiveForm.fields.find((slot) => slot.key === key) ?? {
          key,
          label: null,
          required: true,
          preset: null,
        },
        {
          roleLabels: shownType ? typeConfigOf(shownType).card.roleLabels : undefined,
          definitions: fieldDefs,
        },
      ),
    )
    .join(', ');

  function fail(error: unknown) {
    if (!(error instanceof ApiError)) {
      setError(ui.taskCreate.submitFailed);
      return;
    }
    if (error.code === ErrorCode.PROCESS_TYPE_FORBIDDEN) {
      setError(ui.taskCreate.forbidden);
      void queryClient.invalidateQueries({ queryKey: automationKeys.types('exclude', 'task') });
      return;
    }
    if (error.code === ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED) {
      const fields = (error.details?.fields ?? []) as CreationFieldKey[];
      setInvalidKeys(new Set(fields));
      void queryClient.invalidateQueries({ queryKey: automationKeys.types('exclude', 'task') });
      return;
    }
    if (error.code === ErrorCode.CUSTOM_FIELD_VALUE_INVALID) {
      const issues = (error.details?.issues ?? []) as { fieldId: string }[];
      setInvalidKeys(new Set(issues.map((issue) => `cf.${issue.fieldId}`)));
      return;
    }
    if (error.code === ErrorCode.PROCESS_TYPE_PRESET_INVALID) {
      setError(ui.taskCreate.presetInvalid);
      return;
    }
    setError(ui.taskCreate.submitFailed);
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSubmit || !shownType || create.isPending) return;
    setError(null);
    setInvalidKeys(new Set());
    create.mutate(buildCreateBody(draft, prefill ?? {}, effectiveForm), {
      onSuccess: (task) => {
        prefill?.onCreated?.(task);
        toast.success(ui.tasks.created);
        onClose();
      },
      onError: fail,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Заполненное окно не закрывается кликом мимо (канон 30.09.2026). */}
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{ui.taskCreate.title}</DialogTitle>
        <form onSubmit={submit} className="relative flex max-h-[80vh] min-w-0 flex-col">
          <div className="flex flex-col gap-3 overflow-y-auto p-4 pb-3">
            <TaskCreateTitleField
              value={draft.title}
              onChange={(title) => setDraft(withTitle(draft, title))}
            />

            {prefill?.contextLabel ? (
              <p className="text-xs text-muted-foreground">{prefill.contextLabel}</p>
            ) : null}

            <div className="grid grid-cols-[8rem_1fr] items-center gap-x-3">
              <NodeLabel label={ui.taskCreate.typeLabel} />
              <div className="flex min-w-0 items-center gap-1">
                <Select
                  value={shownType?.id ?? ''}
                  onValueChange={(typeId) => {
                    setDraft(withType(draft, typeId));
                    setInvalidKeys(new Set());
                  }}
                  disabled={typesLoading || (types?.length ?? 0) === 0}
                >
                  <SelectTrigger
                    className="h-8 min-w-0 flex-1"
                    aria-label={ui.taskCreate.typeLabel}
                  >
                    <SelectValue placeholder={ui.taskCreate.noTypes}>
                      {shownType ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <ProcessTypeGlyph icon={shownType.icon} className="size-3.5" />
                          <span className="truncate">{shownType.name}</span>
                        </span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" className="nokey">
                    {(types ?? []).map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <span className="flex items-center gap-2">
                          <ProcessTypeGlyph icon={type.icon} className="size-3.5" />
                          {type.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManage && shownType ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={ui.taskCreate.typeSettings}
                    title={ui.taskCreate.typeSettings}
                    onClick={() => {
                      onClose();
                      void navigate({
                        to: '/automation',
                        search: (prev) => ({ ...prev, tab: 'processes', type: shownType.id }),
                      });
                    }}
                  >
                    <Settings2 className="size-4" strokeWidth={1.75} />
                  </Button>
                ) : null}
              </div>
            </div>

            {typesLoading ? (
              <FormSkeleton />
            ) : shownType ? (
              <TaskCreateFormBody
                type={shownType}
                form={effectiveForm}
                values={draft.values}
                definitions={fieldDefs}
                invalidKeys={invalidKeys}
                onChange={(key, value) => setDraft(withValue(draft, key, value))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{ui.taskCreate.noTypes}</p>
            )}

            <TaskCreateChips chips={effectiveForm.chips} draft={draft} onChange={setDraft} />

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            {missing.length > 0 ? (
              <p
                id="task-create-missing"
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {ui.taskCreate.missing} <span className="text-foreground">{missingText}</span>
              </p>
            ) : null}
          </div>

          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <Button
              size="sm"
              type="submit"
              disabled={!canSubmit || create.isPending}
              aria-describedby={missing.length > 0 ? 'task-create-missing' : undefined}
            >
              {ui.common.create}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              {ui.common.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
