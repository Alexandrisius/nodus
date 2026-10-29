import { useState } from 'react';
import type { CounterpartyRef, ProjectDetail, ProjectVisibility } from '@nodus/contracts';
import { errorMessages, ErrorCode, ui, updateProjectBodySchema } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { Textarea } from '@nodus/ui/components/textarea';

import { ApiError } from '../../../shared/api-client.js';
import { CounterpartyCombobox } from '../../../shared/counterparties/counterparty-combobox.js';
import { useUpdateProject } from '../api/project-mutations.js';
import {
  AssistantsField,
  PortfolioField,
  ProjectDateFields,
  VisibilityField,
} from './project-form-fields.js';

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

/**
 * «Поля проекта»: правка системных полей руководством (руководитель,
 * помощники, project.manage). Передача руководства и статусы — отдельные
 * действия карточки; смена видимости на секретный доступна только
 * руководителю (сервер — истина, I8).
 */
export function ProjectEditDialog({
  project,
  onClose,
}: {
  project: ProjectDetail;
  onClose: () => void;
}) {
  const update = useUpdateProject(project.id);
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code ?? '');
  const [description, setDescription] = useState(project.description);
  const [portfolioId, setPortfolioId] = useState(project.portfolio?.id ?? null);
  const [client, setClient] = useState<CounterpartyRef | null>(project.client);
  const [assistantIds, setAssistantIds] = useState<string[]>(
    project.assistants.map((assistant) => assistant.id),
  );
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const [startDate, setStartDate] = useState<string | null>(project.startDate);
  const [endDate, setEndDate] = useState<string | null>(project.endDate);
  const [error, setError] = useState<string | null>(null);

  const canMakeSecret = project.access.canTransfer || project.visibility === 'secret';
  const codeField = project.type?.codeField ?? 'optional';
  const codeShown = codeField !== 'hidden';
  const canSubmit =
    name.trim().length > 0 &&
    !update.isPending &&
    (codeField !== 'required' || code.trim().length > 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const parsed = updateProjectBodySchema.safeParse({
      name: name.trim(),
      code: codeShown ? code.trim() || null : undefined,
      description: description.trim() || null,
      portfolioId,
      clientId: client?.id ?? null,
      assistantIds,
      visibility,
      startDate,
      endDate,
    });
    if (!parsed.success) {
      setError(errorMessages[ErrorCode.VALIDATION_FAILED]);
      return;
    }
    update.mutate(
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
          {ui.projects.editTitle}
        </DialogTitle>
        <form onSubmit={submit} className="flex max-h-[80vh] flex-col">
          <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={ui.projects.fieldName}
                aria-label={ui.projects.fieldName}
                className="h-9 text-body-lg"
              />
              {codeShown ? (
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={
                    codeField === 'required'
                      ? ui.projects.codeRequiredPlaceholder
                      : ui.projects.fieldCode
                  }
                  aria-label={ui.projects.fieldCode}
                  aria-required={codeField === 'required'}
                  className="h-8 font-mono text-label-lg tabular-nums"
                />
              ) : null}
            </div>

            <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-3">
              <FieldLabel>{ui.projects.assistants}</FieldLabel>
              <AssistantsField
                value={assistantIds}
                label={ui.projects.assistants}
                excludeIds={project.manager ? [project.manager.id] : []}
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
                value={visibility}
                label={ui.projects.fieldVisibility}
                canMakeSecret={canMakeSecret}
                onChange={setVisibility}
              />

              <FieldLabel>{`${ui.projects.startDate} — ${ui.projects.endDate}`}</FieldLabel>
              <ProjectDateFields
                startDate={startDate}
                endDate={endDate}
                onChange={(patch) => {
                  if (patch.startDate !== undefined) setStartDate(patch.startDate);
                  if (patch.endDate !== undefined) setEndDate(patch.endDate);
                }}
              />
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
          <div className="flex h-12 shrink-0 items-center gap-2 px-5">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {ui.common.save}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {ui.common.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
