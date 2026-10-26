import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type {
  CreationChip,
  CreationFieldKey,
  ProcessType,
  WorkflowDetail,
  WorkflowProblem,
} from '@nodus/contracts';
import {
  checkWorkflowDocument,
  customFieldIdOfKey,
  effectiveCreationForm,
  slotLabel,
  typeConfigOf,
  typeIdsOf,
  ui,
} from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Switch } from '@nodus/ui/components/switch';
import { Eye } from 'lucide-react';

import {
  useCustomFieldDefinitions,
  visibleDefinitions,
} from '../../../../../shared/custom-fields/queries.js';
import { useRouteDocStore } from '../../../model/route-doc-store.js';
import {
  withChipToggled,
  withSlotAdded,
  withSlotMoved,
  withSlotPatched,
  withSlotRemoved,
} from '../../../model/creation-form.js';
import { CreationFieldPicker } from './creation-field-picker.js';
import { CreationPreview } from './creation-preview.js';
import { CreationSlotRow } from './creation-slot-row.js';

/**
 * Панель «Окно создания» (#432, В1/Р12): узел «Создание» холста маршрута.
 * Упорядоченный список слотов (dnd + клавиатура), «+ Поле», чипы-блоки,
 * живой предпросмотр и «Посмотреть окно». Правки — раздел документа:
 * черновик, история и «Опубликовать» общие с маршрутом.
 */
export function CreationPanel({
  workflow,
  type,
  readOnly,
}: {
  workflow: WorkflowDetail;
  type: ProcessType;
  readOnly: boolean;
}) {
  const doc = useRouteDocStore((s) => s.document);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { data: definitions } = useCustomFieldDefinitions(type.category);
  const defs = useMemo(() => visibleDefinitions(definitions), [definitions]);
  const form = effectiveCreationForm(doc.creation, type.category);

  const problems = useMemo(() => {
    const scoped = (definitions ?? []).filter((entry) => entry.scope === type.category);
    // `workflow` — версия опубликованного маршрута: подсказки пересчитываются
    // после публикации, когда документ сервера обновился.
    void workflow.version;
    return checkWorkflowDocument(doc, {
      category: type.category,
      customFields: {
        active: new Set(scoped.map((entry) => entry.id)),
        hidden: new Set(scoped.filter((entry) => entry.hidden).map((entry) => entry.id)),
        inType: new Set(
          scoped.filter((entry) => typeIdsOf(entry).includes(type.id)).map((entry) => entry.id),
        ),
      },
      definitions: scoped.map((entry) => ({
        id: entry.id,
        type: entry.type,
        settings: entry.settings,
        hidden: entry.hidden,
      })),
      projectsAvailable: true,
    }).filter((problem) => problem.code.startsWith('creation_') || problem.creationField);
  }, [doc, definitions, type.category, type.id, workflow.version]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (next: typeof form) => useRouteDocStore.getState().setCreationForm(next);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = form.fields.findIndex((slot) => slot.key === active.id);
    const to = form.fields.findIndex((slot) => slot.key === over.id);
    if (from < 0 || to < 0) return;
    update(withSlotMoved(form, from, to));
  }

  const problemsOf = (key: string): WorkflowProblem[] =>
    problems.filter((problem) => problem.creationField === key);

  return (
    <>
      {doc.creation === null ? (
        <div className="flex flex-col gap-1 rounded-lg bg-accent/50 px-3 py-2">
          <span className="text-sm">{ui.automation.creation.defaultForm}</span>
          <span className="text-xs text-muted-foreground">
            {ui.automation.creation.defaultFormHint}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          {ui.automation.creation.fieldsTitle}
        </span>
        {form.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">{ui.automation.creation.empty}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={form.fields.map((slot) => slot.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5">
                {form.fields.map((slot) => {
                  const fieldId = customFieldIdOfKey(slot.key);
                  const definition = fieldId ? defs.find((d) => d.id === fieldId) : undefined;
                  const label = slotLabel(slot, {
                    roleLabels: typeConfigOf(type).card.roleLabels,
                    definitions: defs,
                  });
                  const slotProblems = problemsOf(slot.key);
                  return (
                    <CreationSlotRow
                      key={slot.key}
                      slot={slot}
                      label={label}
                      definition={definition}
                      readOnly={readOnly}
                      expanded={expandedKey === slot.key}
                      invalid={slotProblems.length > 0}
                      onToggle={() =>
                        setExpandedKey((current) => (current === slot.key ? null : slot.key))
                      }
                      onChange={(patch) => update(withSlotPatched(form, slot.key, patch))}
                      onRemove={() => update(withSlotRemoved(form, slot.key))}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {readOnly ? null : (
          <CreationFieldPicker
            type={type}
            form={form}
            readOnly={readOnly}
            onPick={(key: CreationFieldKey) => update(withSlotAdded(form, key))}
          />
        )}
        {form.fields.length >= 30 ? (
          <p className="text-xs text-muted-foreground">{ui.automation.creation.fieldsLimit}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          {ui.automation.creation.chipsTitle}
        </span>
        {(
          [
            ['checklist', ui.automation.creation.chipChecklist],
            ['planned', ui.automation.creation.chipPlanned],
          ] as const
        ).map(([chip, label]) => (
          <label key={chip} className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <Switch
              checked={form.chips.includes(chip)}
              disabled={readOnly}
              onCheckedChange={() => update(withChipToggled(form, chip as CreationChip))}
            />
          </label>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setPreviewOpen((open) => !open)}
        aria-expanded={previewOpen}
      >
        <Eye className="size-4" strokeWidth={1.75} />
        {previewOpen ? ui.automation.creation.previewClose : ui.automation.creation.previewOpen}
      </Button>
      {previewOpen ? <CreationPreview type={type} form={form} /> : null}
    </>
  );
}
