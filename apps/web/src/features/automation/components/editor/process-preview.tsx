import { useState } from 'react';
import type { WorkflowDraftTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { MoreHorizontal } from 'lucide-react';

import {
  PREVIEW_ROLES,
  groupByDisplay,
  previewForRole,
} from '../../../../shared/workflow/process-buttons.js';

/**
 * Живой мини-бар «Как увидят панель процесса» (инспектор статуса): главная
 * залита, видимые по порядку, «⋯» — число пунктов меню; переключатель ролей.
 * Группировка — та же функция, что и бар карточки (process-buttons.ts).
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

  const roleLabel: Record<string, string> = {
    creator: ui.automation.roles.creator,
    assignee: ui.automation.roles.assignee,
    coexecutor: ui.automation.roles.coexecutor,
    observer: ui.automation.roles.observer,
    creator_assignee: ui.automation.roleCreatorAssignee,
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap gap-1">
        {PREVIEW_ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={roleId === r.id}
            onClick={() => setRoleId(r.id)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs transition-colors',
              roleId === r.id
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-input',
            )}
          >
            {roleLabel[r.id]}
          </button>
        ))}
      </div>
      {/* Панель переносится строками — горизонтальной прокрутки нет. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-2">
        {groups.primary ? (
          <span className="max-w-full rounded-md bg-primary px-2.5 py-1 text-xs break-words text-primary-foreground">
            {groups.primary.name}
          </span>
        ) : null}
        {groups.visible.map((t) => (
          <span
            key={t.id}
            className="max-w-full rounded-md px-2.5 py-1 text-xs break-words text-muted-foreground"
          >
            {t.name}
          </span>
        ))}
        {groups.menu.length > 0 ? (
          <span className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground">
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
            {groups.menu.length}
          </span>
        ) : null}
        {visible.length === 0 ? (
          <span className="px-1 py-1 text-xs text-muted-foreground">
            {ui.tasks.processNoActions}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{ui.automation.previewNote}</p>
    </div>
  );
}
