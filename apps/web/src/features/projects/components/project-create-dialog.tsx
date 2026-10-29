import { useState, type ReactNode } from 'react';
import type { CounterpartyRef, ProjectType, ProjectVisibility } from '@nodus/contracts';
import { createProjectBodySchema, ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Textarea } from '@nodus/ui/components/textarea';

import { ApiError } from '../../../shared/api-client.js';
import { usePortalSettings, useProjectTypes } from '../../../shared/api/projects-list.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { CounterpartyCombobox } from '../../../shared/counterparties/counterparty-combobox.js';
import type { ProjectCreatePrefill } from '../../../shared/projects/project-create-store.js';
import { useCreateProject } from '../api/project-mutations.js';
import {
  AssistantsField,
  ManagerField,
  PortfolioField,
  ProjectDeadlineField,
  VisibilityField,
} from './project-form-fields.js';

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** Звёздочка обязательного поля — тон действия, прижата к метке. */
function RequiredMark() {
  return (
    <span aria-hidden className="text-primary">
      *
    </span>
  );
}

/**
 * Окно «Новый проект» (Р14 #52): тип — ПЕРВЫМ после названия (вердикт
 * владельца 07.11.2026: как в задачах, набор полей зависит от типа и будет
 * настраиваться формой типа в «Автоматизации» — #38/#468), шифр показывается
 * только у типов, где он есть («Договор» — обязателен, «Тема» — нет).
 * Подсказок под полями нет — метки и контролы стоят на одной линии.
 * Окно заполняемое: клик мимо не закрывает, отмена — кнопка или Esc.
 */
export function ProjectCreateDialog({
  prefill,
  onClose,
}: {
  prefill: ProjectCreatePrefill;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const types = useProjectTypes();
  const settings = usePortalSettings();
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState(prefill.typeId ?? '');
  const [managerId, setManagerId] = useState(me?.id ?? '');
  const [assistantIds, setAssistantIds] = useState<string[]>([]);
  const [portfolioId, setPortfolioId] = useState<string | null>(prefill.portfolioId ?? null);
  const [client, setClient] = useState<CounterpartyRef | null>(null);
  const [visibility, setVisibility] = useState<ProjectVisibility | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultVisibility = settings.data?.projects.defaultVisibility ?? 'open';
  const effectiveVisibility = visibility ?? defaultVisibility;
  const liveTypes = types.data ?? [];
  const selectedType: ProjectType | null = liveTypes.find((type) => type.id === typeId) ?? null;
  // Поля типа появляются вместе с типом: до выбора тип неизвестен — шифр не
  // показываем (иначе поле мелькало бы у «Темы», где его нет).
  const codeField = selectedType?.codeField ?? 'hidden';
  const codeShown = selectedType !== null && codeField !== 'hidden';
  const canSubmit =
    name.trim().length > 0 &&
    typeId.length > 0 &&
    !create.isPending &&
    liveTypes.length > 0 &&
    (codeField !== 'required' || code.trim().length > 0);

  function selectType(next: string) {
    setTypeId(next);
    const nextType = liveTypes.find((type) => type.id === next);
    if (nextType?.codeField === 'hidden') setCode('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const parsed = createProjectBodySchema.safeParse({
      name: name.trim(),
      code: codeShown ? code.trim() || undefined : undefined,
      description: description.trim() || undefined,
      typeId,
      portfolioId,
      clientId: client?.id ?? null,
      managerId: managerId || undefined,
      assistantIds,
      visibility: effectiveVisibility,
      endDate,
    });
    if (!parsed.success) {
      setError(errorMessages[ErrorCode.VALIDATION_FAILED]);
      return;
    }
    create.mutate(
      { body: parsed.data, client },
      {
        onSuccess: onClose,
        onError: (failure) =>
          setError(
            failure instanceof ApiError
              ? (errorMessages[failure.code as ErrorCode] ?? ui.common.saveError)
              : ui.common.saveError,
          ),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl gap-0 p-0 sm:max-w-2xl"
        aria-describedby={undefined}
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="px-5 pt-4 text-base font-semibold">
          {ui.projects.createTitle}
        </DialogTitle>
        <form onSubmit={submit} className="flex max-h-[80vh] flex-col">
          <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={ui.projects.fieldName}
              aria-label={ui.projects.fieldName}
              className="h-9 text-body-lg"
            />

            <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-3">
              {/* Тип — ПЕРВОЕ поле формы сразу после названия и обычной
                  строкой сетки (label слева, селект справа — как «Тип задачи»):
                  от типа зависит набор полей (схема типа — #38/#468). */}
              <FieldLabel>{ui.projects.fieldType}</FieldLabel>
              {types.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : liveTypes.length === 0 ? (
                <span className="text-xs text-muted-foreground">{ui.projects.typesEmpty}</span>
              ) : (
                <Select value={typeId} onValueChange={selectType}>
                  <SelectTrigger className="h-8 w-full" aria-label={ui.projects.fieldType}>
                    <SelectValue placeholder={ui.projects.typePlaceholder} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="nokey">
                    {liveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {codeShown ? (
                <>
                  <FieldLabel>
                    {ui.projects.fieldCode}
                    {codeField === 'required' ? <RequiredMark /> : null}
                  </FieldLabel>
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={ui.projects.codePlaceholder}
                    aria-label={ui.projects.fieldCode}
                    aria-required={codeField === 'required'}
                    className="h-8 font-mono text-label-lg tabular-nums"
                  />
                </>
              ) : null}

              <FieldLabel>{ui.projects.manager}</FieldLabel>
              <ManagerField
                value={managerId}
                label={ui.projects.manager}
                onChange={(userId) => {
                  setManagerId(userId);
                  setAssistantIds((prev) => prev.filter((id) => id !== userId));
                }}
              />

              <FieldLabel>{ui.projects.assistants}</FieldLabel>
              <AssistantsField
                value={assistantIds}
                label={ui.projects.assistants}
                excludeIds={[managerId]}
                onChange={setAssistantIds}
              />

              <FieldLabel>{ui.projects.filterPortfolio}</FieldLabel>
              <PortfolioField
                value={portfolioId}
                label={ui.projects.filterPortfolio}
                onChange={setPortfolioId}
              />

              <FieldLabel>{ui.projects.fieldClient}</FieldLabel>
              <CounterpartyCombobox
                value={client}
                onChange={setClient}
                ariaLabel={ui.projects.fieldClient}
                className="h-8"
                openOnFocus={false}
              />

              <FieldLabel>{ui.projects.fieldVisibility}</FieldLabel>
              <VisibilityField
                value={effectiveVisibility}
                label={ui.projects.fieldVisibility}
                canMakeSecret
                onChange={setVisibility}
              />

              <FieldLabel>{ui.projects.deadline}</FieldLabel>
              <ProjectDeadlineField value={endDate} onChange={setEndDate} />
            </div>

            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={ui.projects.fieldDescription}
              aria-label={ui.projects.fieldDescription}
              rows={3}
              className="text-sm"
            />

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
          {/* Кнопки окна — СПРАВА, как во всех окнах портала (вердикт
              владельца 07.11.2026): отмена — тихая, главное действие — primary. */}
          <div className="flex h-12 shrink-0 items-center justify-end gap-2 px-5">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {ui.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {ui.projects.createSubmit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
