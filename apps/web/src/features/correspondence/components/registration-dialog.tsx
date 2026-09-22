import { useState, type ReactNode } from 'react';
import type { CounterpartyRef, LetterListItem, LetterType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { useProjectsList } from '../../../shared/api/projects-list.js';
import { useUsersList } from '../../../shared/api/users-list.js';
import { CounterpartyCombobox } from '../../../shared/counterparties/counterparty-combobox.js';
import { DateTimePicker } from '../../../shared/ui/date-time-picker.js';
import { localDateStr } from '../../../shared/ui/date-time-grid.js';
import { FilterCombobox } from '../../../shared/views/filter-combobox.js';
import { useDocumentKinds, useRegisterLetter } from '../api/letters-api.js';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Карточка регистрации письма (модель v2, вердикты 22.09.2026): тип Вх/Исх
 * подставляется из папки и показывается чипом (сменить можно), контрагент —
 * автокомплит справочника с созданием «на лету», проект — справочник,
 * адресат — дефолт ГИП проекта, срок (опц.), № и дата документа
 * корреспондента, вид документа — справочник с дефолтом «Письмо» (секретарь
 * его не трогает). Результат: рег.№ «Вх-2026/NNN» (присваивает сервер),
 * письмо становится документом «в работе». Мутация пессимистична.
 */
export function RegistrationDialog({
  letter,
  onOpenChange,
}: {
  letter: LetterListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = letter !== null;
  const register = useRegisterLetter(letter?.id ?? '');
  const { data: projects } = useProjectsList();
  const { data: users } = useUsersList();
  const { data: kinds } = useDocumentKinds();

  const [type, setType] = useState<LetterType>('incoming');
  const [counterparty, setCounterparty] = useState<CounterpartyRef | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [addresseeId, setAddresseeId] = useState<string | undefined>(undefined);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [correspondentNumber, setCorrespondentNumber] = useState('');
  const [correspondentDate, setCorrespondentDate] = useState<Date | null>(null);

  // Сброс формы при каждом открытии под новое письмо (рендер-тайм по переходу
  // id, канон React, аудит #45).
  const [prevLetterId, setPrevLetterId] = useState<string | null>(null);
  if ((letter?.id ?? null) !== prevLetterId) {
    setPrevLetterId(letter?.id ?? null);
    if (letter) {
      setType(letter.type);
      setCounterparty(letter.counterparty);
      setProjectId(undefined);
      setAddresseeId(undefined);
      setDeadline(null);
      setCorrespondentNumber('');
      setCorrespondentDate(null);
    }
  }

  // Вид документа — дефолт словаря «Письмо» (первый сид, #54).
  const defaultKind = kinds?.[0];

  function onProjectChange(v: string | undefined) {
    setProjectId(v);
    // Адресат по умолчанию — ГИП (руководитель) выбранного проекта.
    const manager = projects?.items.find((p) => p.id === v)?.manager;
    setAddresseeId(manager?.id);
  }

  function submit() {
    if (!letter || !counterparty || !defaultKind || register.isPending) return;
    register.mutate(
      {
        type,
        counterpartyId: counterparty.id,
        projectId: projectId ?? null,
        addresseeId: addresseeId ?? null,
        deadline: deadline ? localDateStr(deadline) : null,
        correspondentNumber: correspondentNumber.trim() || null,
        correspondentDate: correspondentDate ? localDateStr(correspondentDate) : null,
        documentKindId: defaultKind.id,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const projectOptions = (projects?.items ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} · ${p.name}`,
  }));
  const userOptions = (users?.items ?? []).map((u) => ({
    value: u.id,
    label: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-xl bg-card">
        <DialogTitle className="text-base font-semibold text-foreground">
          {ui.letters.registerTitle}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-3">
          {/* Тип — чипом (подставлен из папки, сменить можно) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.letters.registerType}
            </span>
            <div className="flex gap-1.5">
              {(['incoming', 'outgoing'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className="rounded transition-opacity hover:opacity-80"
                >
                  <NodeChip tone={type === t ? 'info' : 'muted'}>
                    {t === 'incoming' ? ui.letters.typeIncoming : ui.letters.typeOutgoing}
                  </NodeChip>
                </button>
              ))}
            </div>
          </div>

          <Field label={ui.letters.counterparty}>
            <CounterpartyCombobox
              value={counterparty}
              onChange={setCounterparty}
              ariaLabel={ui.letters.counterparty}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.letters.project}>
              <FilterCombobox
                options={projectOptions}
                value={projectId}
                onChange={onProjectChange}
                ariaLabel={ui.letters.project}
                placeholder={ui.tasks.noProject}
              />
            </Field>
            <Field label={ui.letters.addressee}>
              <FilterCombobox
                options={userOptions}
                value={addresseeId}
                onChange={setAddresseeId}
                ariaLabel={ui.letters.addressee}
                placeholder={ui.common.notSet}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.letters.deadline}>
              <DateTimePicker
                value={deadline}
                onChange={setDeadline}
                ariaLabel={ui.letters.deadline}
              />
            </Field>
            <Field label={ui.letters.documentKind}>
              {/* Справочник, секретарь не трогает — значение, не контрол */}
              <div className="flex h-8 items-center rounded-md border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground">
                {defaultKind?.name ?? ui.common.notSet}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.letters.correspondentNumber}>
              <Input
                value={correspondentNumber}
                onChange={(e) => setCorrespondentNumber(e.target.value)}
                placeholder={ui.common.notSet}
                className="h-8 font-mono text-label-sm"
              />
            </Field>
            <Field label={ui.letters.correspondentDate}>
              <DateTimePicker
                value={correspondentDate}
                onChange={setCorrespondentDate}
                ariaLabel={ui.letters.correspondentDate}
                placeholder={ui.common.notSet}
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {ui.common.cancel}
          </Button>
          <Button
            size="sm"
            disabled={!counterparty || !defaultKind || register.isPending}
            onClick={submit}
          >
            {ui.letters.register}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
