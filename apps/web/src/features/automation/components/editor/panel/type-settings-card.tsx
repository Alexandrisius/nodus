import { useEffect, useState } from 'react';
import type { ProcessType, TaskCardBlock, TaskRoleKey } from '@nodus/contracts';
import { taskCardBlockOrder, taskRoleKeySchema, typeConfigOf, ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';

import { useUpdateProcessTypeConfig } from '../../../api/automation-api.js';

/**
 * Раздел «Карточка» настроек типа (#432, В6/Р7): блоки карточки вкл/выкл и
 * свои названия ролей («Постановщик» → «Заявитель»). Состав карточки —
 * представление, не права: скрытый блок просто не рисуется. Названия
 * сохраняются по уходу фокуса, переключатели — сразу.
 */
export function TypeCardSection({ type, readOnly }: { type: ProcessType; readOnly: boolean }) {
  const update = useUpdateProcessTypeConfig(type.id);
  const { hiddenBlocks, roleLabels } = typeConfigOf(type).card;

  const toggleBlock = (block: TaskCardBlock, on: boolean) =>
    update.mutate({
      card: {
        hiddenBlocks: on
          ? hiddenBlocks.filter((entry) => entry !== block)
          : [...hiddenBlocks, block],
        roleLabels,
      },
    });

  const setRoleLabel = (role: TaskRoleKey, value: string) => {
    const next = { ...roleLabels };
    const trimmed = value.trim();
    if (trimmed) next[role] = trimmed;
    else delete next[role];
    update.mutate({ card: { hiddenBlocks, roleLabels: next } });
  };

  return (
    <section className="flex flex-col gap-3">
      <span className="text-sm font-medium">{ui.automation.typeSettings.card.title}</span>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          {ui.automation.typeSettings.card.blocks}
        </span>
        {taskCardBlockOrder.map((block) => (
          <label key={block} className="flex items-center justify-between gap-3">
            <span className="text-sm">{ui.automation.typeSettings.card.blocksNames[block]}</span>
            <Switch
              checked={!hiddenBlocks.includes(block)}
              disabled={readOnly}
              onCheckedChange={(on) => toggleBlock(block, on)}
            />
          </label>
        ))}
        <span className="text-xs text-muted-foreground">
          {ui.automation.typeSettings.card.blocksHint}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          {ui.automation.typeSettings.card.roleLabels}
        </span>
        {taskRoleKeySchema.options.map((role) => (
          <RoleLabelField
            key={role}
            label={ui.automation.typeSettings.card.roles[role]}
            value={roleLabels[role] ?? ''}
            disabled={readOnly}
            onCommit={(value) => setRoleLabel(role, value)}
          />
        ))}
        <span className="text-xs text-muted-foreground">
          {ui.automation.typeSettings.card.roleLabelsHint}
        </span>
      </div>
    </section>
  );
}

/** Название роли: правится локально, сохраняется по blur/Enter (не на букву). */
function RoleLabelField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = () => {
    if (text.trim() !== value) onCommit(text);
  };

  return (
    <label className="grid grid-cols-[7rem_1fr] items-center gap-2">
      <span className="truncate text-[13px] text-muted-foreground">{label}</span>
      <Input
        value={text}
        maxLength={40}
        readOnly={disabled}
        placeholder={label}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className="h-8 text-sm"
      />
    </label>
  );
}
