import type { CreationForm, ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';

import {
  useCustomFieldDefinitions,
  visibleDefinitions,
} from '../../../../../shared/custom-fields/queries.js';
import { ProcessTypeGlyph } from '../../../../../shared/workflow/process-type-icon.js';
import { TaskCreateChips } from '../../../../../shared/tasks/task-create-chips.js';
import { TaskCreateFormBody } from '../../../../../shared/tasks/task-create-form-body.js';
import { emptyDraft } from '../../../../../shared/tasks/task-create-draft.js';

/**
 * Живой предпросмотр окна создания (#432, Р12): настоящее тело окна —
 * название и тип зафиксированы, низ перестраивается по форме; отправка
 * недоступна. Рядом с панелью на широком холсте и в «Посмотреть окно».
 */
export function CreationPreview({ type, form }: { type: ProcessType; form: CreationForm }) {
  const { data: definitions } = useCustomFieldDefinitions(type.category);
  const draft = emptyDraft();

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{ui.automation.creation.preview}</p>
      <div className="flex flex-col gap-2">
        <div className="flex h-9 items-center rounded-lg border border-input px-2.5 text-body-lg text-muted-foreground">
          {ui.taskCreate.titlePlaceholder}
        </div>
        <div className="grid grid-cols-[7rem_1fr] items-center gap-x-2">
          <NodeLabel label={ui.taskCreate.typeLabel} />
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <ProcessTypeGlyph icon={type.icon} className="size-3.5 shrink-0" />
            <span className="truncate">{type.name}</span>
          </span>
        </div>
      </div>

      <TaskCreateFormBody
        type={type}
        form={form}
        values={{}}
        definitions={visibleDefinitions(definitions)}
        preview
        onChange={() => {}}
      />

      <TaskCreateChips chips={form.chips} draft={draft} onChange={() => {}} preview />

      <div className="flex h-10 items-center gap-2">
        <Button size="sm" disabled>
          {ui.common.create}
        </Button>
        <Button size="sm" variant="ghost" disabled>
          {ui.common.cancel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ui.automation.creation.previewNote}</p>
    </div>
  );
}
