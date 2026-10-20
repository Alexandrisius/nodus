import { useEffect, useState } from 'react';
import type { StageColor, TaskType, TaskTypeIcon } from '@nodus/contracts';
import { taskTypeIconSchema, ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { useUpdateTaskType } from '../../api/automation-api.js';
import { SidePanel } from '../editor/panel/side-panel.js';
import { stageColorOrder, stageTone } from '../../../../shared/ui/board/stage-tone.js';
import { TaskTypeGlyph } from '../../../../shared/workflow/task-type-icon.js';

/** Настройки типа — та же внутриоконная панель справа, что у статуса и
 *  кнопки (монтирована всегда: открытие плавное и в первый раз); свойства
 *  сохраняются СРАЗУ (оптимистично, PATCH), публикации требует только маршрут. */
export function TypeSettingsPanel({
  open,
  type,
  onClose,
}: {
  open: boolean;
  type: TaskType;
  onClose: () => void;
}) {
  const update = useUpdateTaskType();
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description);

  useEffect(() => {
    setName(type.name);
    setDescription(type.description);
  }, [type.id, type.name, type.description]);

  return (
    <SidePanel open={open} title={ui.automation.typeSettings} onClose={onClose}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{ui.automation.fieldName}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() &&
            name !== type.name &&
            update.mutate({ id: type.id, body: { name: name.trim() } })
          }
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{ui.automation.fieldIcon}</span>
        <div className="grid grid-cols-8 gap-1.5">
          {taskTypeIconSchema.options.map((key: TaskTypeIcon) => (
            <button
              key={key}
              type="button"
              aria-pressed={type.icon === key}
              onClick={() => update.mutate({ id: type.id, body: { icon: key } })}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg border transition-colors',
                type.icon === key
                  ? 'border-ring bg-accent text-foreground'
                  : 'border-border text-muted-foreground hover:border-input',
              )}
            >
              <TaskTypeGlyph icon={key} className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{ui.automation.fieldColor}</span>
        <div className="flex gap-2">
          {stageColorOrder.map((tone: StageColor) => (
            <button
              key={tone}
              type="button"
              aria-pressed={type.color === tone}
              onClick={() => update.mutate({ id: type.id, body: { color: tone } })}
              className={cn(
                'size-6 rounded-full border-2 transition-colors',
                stageTone[tone].swatch,
                type.color === tone ? 'border-foreground' : 'border-transparent',
              )}
            />
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{ui.automation.fieldDescription}</span>
        <Textarea
          value={description}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            description !== type.description &&
            update.mutate({ id: type.id, body: { description } })
          }
        />
      </label>

      <label className="flex cursor-pointer items-center justify-between gap-2">
        <span className="text-sm">{ui.automation.creatableToggle}</span>
        <Switch
          checked={type.creatable}
          onCheckedChange={(checked) =>
            update.mutate({ id: type.id, body: { creatable: checked } })
          }
        />
      </label>
    </SidePanel>
  );
}
