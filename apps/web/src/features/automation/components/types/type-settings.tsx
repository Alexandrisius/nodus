import { useEffect, useState } from 'react';
import type { StageColor, ProcessType, ProcessTypeIcon } from '@nodus/contracts';
import { processTypeIconSchema, ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { useUpdateProcessType, useUpdateProcessTypeConfig } from '../../api/automation-api.js';
import { SidePanel } from '../editor/panel/side-panel.js';
import { TypeAccessSection } from '../editor/panel/type-settings-access.js';
import { TypeCardSection } from '../editor/panel/type-settings-card.js';
import { stageColorOrder, stageTone } from '../../../../shared/ui/board/stage-tone.js';
import { ProcessTypeGlyph } from '../../../../shared/workflow/process-type-icon.js';

/**
 * Настройки типа — та же внутриоконная панель справа, что у статуса и
 * кнопки (монтирована всегда: открытие плавное и в первый раз). Разделы
 * (#432, В6): «Основное» (название, значок, цвет, описание), «Доступ»,
 * «Карточка», «Пульс». Всё сохраняется СРАЗУ (оптимистично); публикации
 * требует только маршрут. Тумблера `creatable` здесь нет — «Создают: никто,
 * кроме администратора» живёт в разделе «Доступ».
 */
export function TypeSettingsPanel({
  open,
  type,
  readOnly = false,
  onClose,
}: {
  open: boolean;
  type: ProcessType;
  /** Нет права `workflow.manage` — только просмотр. */
  readOnly?: boolean;
  onClose: () => void;
}) {
  const update = useUpdateProcessType();
  const updateConfig = useUpdateProcessTypeConfig(type.id);
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description);

  useEffect(() => {
    setName(type.name);
    setDescription(type.description);
  }, [type.id, type.name, type.description]);

  return (
    <SidePanel open={open} title={ui.automation.typeSettings.title} onClose={onClose}>
      <section className="flex flex-col gap-3">
        <span className="text-sm font-medium">{ui.automation.typeSettings.basic}</span>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">{ui.automation.fieldName}</span>
          <Input
            value={name}
            readOnly={readOnly}
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
            {processTypeIconSchema.options.map((key: ProcessTypeIcon) => (
              <button
                key={key}
                type="button"
                aria-pressed={type.icon === key}
                disabled={readOnly}
                onClick={() => update.mutate({ id: type.id, body: { icon: key } })}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg border transition-colors',
                  type.icon === key
                    ? 'border-ring bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:border-input',
                )}
              >
                <ProcessTypeGlyph icon={key} className="size-4" />
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
                disabled={readOnly}
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
          <span className="text-[13px] text-muted-foreground">
            {ui.automation.fieldDescription}
          </span>
          <Textarea
            value={description}
            rows={3}
            readOnly={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description !== type.description &&
              update.mutate({ id: type.id, body: { description } })
            }
          />
        </label>
      </section>

      <TypeAccessSection type={type} readOnly={readOnly} />
      <TypeCardSection type={type} readOnly={readOnly} />

      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium">{ui.automation.typeSettings.pulse.title}</span>
        {type.category === 'task' ? (
          <label className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{ui.automation.typeSettings.pulse.toggle}</span>
              <span className="text-xs text-muted-foreground">
                {ui.automation.typeSettings.pulse.hint}
              </span>
            </span>
            <Switch
              checked={type.config.pulse}
              disabled={readOnly}
              onCheckedChange={(pulse) => updateConfig.mutate({ pulse })}
            />
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            {ui.automation.typeSettings.onlyTaskCategory}
          </p>
        )}
      </section>
    </SidePanel>
  );
}
