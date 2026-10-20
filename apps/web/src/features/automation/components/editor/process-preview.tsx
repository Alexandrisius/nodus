import { useState } from 'react';
import type { WorkflowDraftTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { MoreHorizontal } from 'lucide-react';

import {
  PREVIEW_ROLES,
  groupByDisplay,
  previewForRole,
} from '../../../../shared/workflow/process-buttons.js';

const ROLE_LABEL: Record<string, string> = {
  creator: ui.automation.roles.creator,
  assignee: ui.automation.roles.assignee,
  coexecutor: ui.automation.roles.coexecutor,
  observer: ui.automation.roles.observer,
  creator_assignee: ui.automation.roleCreatorAssignee,
};

/**
 * «Как увидят в карточке задачи» (раздел «Кнопки из статуса»): кнопки
 * статуса глазами выбранной роли — «Смотреть как» — та же грамматика, что у
 * подписей на схеме (главная залита, кнопка — контуром, «Ещё» — пунктиром с
 * числом пунктов). Группировка — та же функция, что у бара карточки
 * (process-buttons.ts). Настройкой «кто видит» это НЕ является — только
 * просмотр.
 */
export function ProcessPreview({
  transitions,
}: {
  transitions: readonly WorkflowDraftTransition[];
}) {
  const [roleId, setRoleId] = useState(PREVIEW_ROLES[1]!.id);
  const role = PREVIEW_ROLES.find((r) => r.id === roleId) ?? PREVIEW_ROLES[1]!;
  const visible = previewForRole(transitions, role.roles);
  const groups = groupByDisplay(visible);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Select value={roleId} onValueChange={setRoleId}>
        <SelectTrigger className="w-full min-w-0" aria-label={ui.automation.panel.previewAs}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">{ui.automation.panel.previewAs}</span>
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" className="nokey">
          {PREVIEW_ROLES.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {ROLE_LABEL[r.id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Бар переносится строками — горизонтальной прокрутки нет. */}
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-background p-2">
        {groups.primary ? (
          <span className="max-w-full rounded-md bg-primary px-2.5 py-1 text-xs break-words text-primary-foreground">
            {groups.primary.name}
          </span>
        ) : null}
        {groups.visible.map((t) => (
          <span
            key={t.id}
            className="max-w-full rounded-md border border-border px-2.5 py-1 text-xs break-words"
          >
            {t.name}
          </span>
        ))}
        {groups.menu.length > 0 ? (
          <span className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
            {groups.menu.length}
          </span>
        ) : null}
        {visible.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">{ui.tasks.processNoActions}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{ui.automation.previewNote}</p>
    </div>
  );
}
