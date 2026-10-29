import { useState, type ReactNode } from 'react';
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
  PeopleMultiField,
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
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={ui.projects.fieldName}
              aria-label={ui.projects.fieldName}
              className="h-9 text-body-lg"
            />

            <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-3">
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

              <FieldLabel>{ui.projects.assistants}</FieldLabel>
              <PeopleMultiField
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
          <div className="flex h-12 shrink-0 items-center justify-end gap-2 px-5">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {ui.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {ui.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
