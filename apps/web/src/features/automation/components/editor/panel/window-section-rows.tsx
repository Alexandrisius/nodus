import type {
  TransitionFormSectionKind,
  WorkflowDraftDocument,
  WorkflowDraftTransition,
  WorkflowTransition,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { cn } from '@nodus/ui/lib/utils';

import { useRouteDocStore } from '../../../model/route-doc-store.js';
import { toggleValidator, validatorOf } from '../../../model/transition-rules.js';

/** Подписи разделов окна — фиксированный порядок редактора (#380). */
export const SECTION_TITLES: Record<TransitionFormSectionKind, string> = {
  fields: ui.automation.window.sections.fields,
  time: ui.automation.window.sections.time,
  result: ui.automation.window.sections.result,
  result_files: ui.automation.window.sections.result_files,
  result_messages: ui.automation.window.sections.result_messages,
  comment: ui.automation.window.sections.comment,
};

/** Флажок раздела: включён — настройки раздела видны под ним. */
export function SectionToggle({
  kind,
  transition,
  readOnly,
  onToggle,
  children,
}: {
  kind: TransitionFormSectionKind;
  transition: WorkflowDraftTransition;
  readOnly: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const enabled = transition.form.sections.some((s) => s.kind === kind);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="flex items-start gap-2.5">
        <Checkbox
          className="mt-0.5"
          checked={enabled}
          disabled={readOnly}
          onCheckedChange={onToggle}
          aria-label={SECTION_TITLES[kind]}
        />
        <span className="text-sm">{SECTION_TITLES[kind]}</span>
      </label>
      {enabled ? <div className="flex flex-col gap-2 pl-6.5">{children}</div> : null}
    </div>
  );
}

/** «Обязательно» у времени/итога — это гейт кнопки (Р3), не свойство раздела. */
export function GateCheck({
  transition,
  kind,
  disabled,
}: {
  transition: WorkflowDraftTransition;
  kind: 'time_logged' | 'result_present';
  disabled: boolean;
}) {
  const checked = validatorOf(transition.rules, kind) !== undefined;
  return (
    <RequiredCheck
      checked={checked}
      disabled={disabled}
      onChange={() =>
        useRouteDocStore.getState().patchTransition(transition.id, {
          rules: toggleValidator(transition.rules, kind),
        })
      }
    />
  );
}

export function RequiredCheck({
  checked,
  disabled,
  onChange,
  title = ui.automation.window.required,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {title}
    </label>
  );
}

/** Кнопка черновика → DTO превью (id new:* допустим: превью не ходит на сервер). */
export function previewTransition(
  t: WorkflowDraftTransition,
  doc: WorkflowDraftDocument,
): WorkflowTransition {
  const target = doc.stages.find((s) => s.id === t.toStageId);
  return {
    id: t.id,
    name: t.name || ui.automation.window.preview,
    toStageId: t.toStageId,
    toStageName: target?.name ?? '',
    toStageState: target?.systemState ?? 'active',
    toStageOutcome: target?.outcome ?? null,
    toStageColor: target?.color ?? 'neutral',
    toStageOrder: target?.sortOrder ?? 0,
    display: t.display,
    blockedBy: [],
    canOverride: false,
    form: t.form.enabled ? t.form : null,
    validators: t.rules.validators,
  };
}

/** Выбор режима раздела: полные строки, а не сегменты — длинная подпись
 *  «Если ещё не списаны» в сегменте обрезалась (#380, замечание владельца). */
export function ModeChoices<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; hint: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex min-w-0 flex-col gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-w-0 items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
              active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/60',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 size-3.5 shrink-0 rounded-full border',
                active
                  ? 'border-primary bg-primary ring-2 ring-primary/20'
                  : 'border-muted-foreground/50',
              )}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{option.label}</span>
              <span className="text-xs break-words text-muted-foreground">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
