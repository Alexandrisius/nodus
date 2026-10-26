import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  Hash,
  Inbox,
  Lock,
  Mail,
  ScanLine,
  Shapes,
  Stamp,
  UserCheck,
  UserPen,
  UserRound,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import type { LetterDetail, UpdateLetterBody, UserRef } from '@nodus/contracts';
import { LETTER_LIMITS, isFinalState, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { projectsAvailable } from '../../../../shared/api/projects-available.js';
import { useProjectsList } from '../../../../shared/api/projects-list.js';
import { formatDateTimeShort } from '../../../../shared/lib/format.js';
import { EntityFields, type EntityFieldDef } from '../../../../shared/ui/entity-fields.js';
import { PersonAvatar } from '../../../../shared/ui/person-avatar.js';
import { ResponseDeadline } from '../../../../shared/views/letter-table-fields.js';
import { useUpdateLetter } from '../../api/letters-mutations.js';
import { boxOfLetter } from '../../api/letters-cache.js';
import { formatIsoDate } from '../../lib/letter-format.js';
import { registrationReasonText } from '../../lib/registration-draft.js';
import { CounterpartyValue, ProjectValue, SignerValue } from './letter-entity-values.js';
import { DateFieldValue, ReceiptMethodValue, TextFieldValue } from './letter-field-editors.js';
import { notSet } from './letter-value-bits.js';

const VISIBILITY_KEY = 'nodus-letter-fields-v1';

function Person({ user }: { user: UserRef | null }) {
  if (!user) return notSet;
  return (
    <>
      <PersonAvatar name={user.displayName} avatarUrl={user.avatarUrl} className="size-6" />
      <span className="truncate">{user.displayName}</span>
    </>
  );
}

const mono = (text: string): ReactNode => (
  <span className="font-mono text-label-sm tabular-nums">{text}</span>
);

/**
 * Доска регистрационных данных письма (#55, U7) на общем каркасе
 * `EntityFields` (грамматика полей карточки задачи, «+ Поле» — видимость).
 * Пары в две колонки: корреспондент | подписант, их № | их дата, адресат |
 * срок ответа, способ | проект, дата регистрации | регистратор, поступило |
 * тип. Правка — у `access.canEdit` (канцелярия, зарегистрированное письмо в
 * работе), оптимистично: смена корреспондента тем же PATCH сбрасывает
 * подписанта. Адресат и номер так не меняются (Р11). Новое письмо
 * заполняется окном «Зарегистрировать».
 */
export const LetterFieldsBoard = memo(function LetterFieldsBoard({
  letter,
}: {
  letter: LetterDetail;
}) {
  const update = useUpdateLetter(letter.id);
  const { data: projects } = useProjectsList({ enabled: letter.access.canEdit });
  const editable = letter.access.canEdit;
  const save = (body: UpdateLetterBody, patch: Partial<LetterDetail>) =>
    update.mutate({ body, patch });
  const rejectDate = (reason: 'in_future' | 'in_past') =>
    toast.error(registrationReasonText[reason]);
  const withProject = projectsAvailable('letters') || letter.project !== null;

  const defs: EntityFieldDef[] = [
    {
      key: 'counterparty',
      icon: <Building2 className="size-3.5" />,
      label: ui.letters.fields.counterparty,
      render: () => (
        <CounterpartyValue
          letter={letter}
          editable={editable}
          onCommit={(counterparty) =>
            save(
              { counterpartyId: counterparty.id, signerId: null },
              { counterparty, signer: null },
            )
          }
        />
      ),
    },
    {
      key: 'signer',
      icon: <UserRound className="size-3.5" />,
      label: ui.letters.fields.signer,
      render: () => (
        <SignerValue
          letter={letter}
          editable={editable}
          onCommit={(signer) => save({ signerId: signer?.id ?? null }, { signer })}
        />
      ),
    },
    {
      key: 'theirNumber',
      icon: <Hash className="size-3.5" />,
      label: ui.letters.fields.theirNumber,
      render: () => (
        <TextFieldValue
          value={letter.theirNumber}
          label={ui.letters.fields.theirNumber}
          maxLength={LETTER_LIMITS.theirNumber}
          editable={editable}
          onCommit={(theirNumber) => save({ theirNumber }, { theirNumber })}
        />
      ),
    },
    {
      key: 'theirDate',
      icon: <CalendarDays className="size-3.5" />,
      label: ui.letters.fields.theirDate,
      render: () => (
        <DateFieldValue
          value={letter.theirDate}
          label={ui.letters.fields.theirDate}
          editable={editable}
          rule="not_future"
          display={letter.theirDate ? mono(formatIsoDate(letter.theirDate)) : notSet}
          onRejected={rejectDate}
          onCommit={(theirDate) => theirDate && save({ theirDate }, { theirDate })}
        />
      ),
    },
    {
      key: 'addressee',
      icon: <UserCheck className="size-3.5" />,
      label: ui.letters.fields.addressee,
      render: () => <Person user={letter.addressee} />,
    },
    {
      key: 'responseDeadline',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.letters.fields.responseDeadline,
      render: () => (
        <DateFieldValue
          value={letter.responseDeadline}
          label={ui.letters.fields.responseDeadline}
          editable={editable}
          rule="not_past"
          clearLabel={ui.letters.form.noDeadline}
          display={
            letter.responseDeadline ? (
              <ResponseDeadline
                deadline={letter.responseDeadline}
                state={letter.stage.systemState}
              />
            ) : (
              notSet
            )
          }
          onRejected={rejectDate}
          onCommit={(responseDeadline) => save({ responseDeadline }, { responseDeadline })}
        />
      ),
    },
    {
      key: 'receiptMethod',
      icon: <Inbox className="size-3.5" />,
      label: ui.letters.fields.receiptMethod,
      render: () => (
        <ReceiptMethodValue
          letter={letter}
          editable={editable}
          onCommit={(receiptMethod) =>
            save({ receiptMethodId: receiptMethod.id }, { receiptMethod })
          }
        />
      ),
    },
    ...(withProject
      ? [
          {
            key: 'project',
            icon: <FolderKanban className="size-3.5" />,
            label: ui.letters.fields.project,
            render: () => (
              <ProjectValue
                letter={letter}
                editable={editable && projectsAvailable('letters')}
                onCommit={(projectId) => {
                  const picked = projects?.items.find((p) => p.id === projectId);
                  save(
                    { projectId },
                    {
                      project: picked
                        ? {
                            id: picked.id,
                            code: picked.code,
                            name: picked.name,
                            color: picked.color,
                          }
                        : null,
                    },
                  );
                }}
              />
            ),
          },
        ]
      : []),
    {
      key: 'regDate',
      icon: <CalendarCheck className="size-3.5" />,
      label: ui.letters.fields.regDate,
      render: () => (letter.regDate ? mono(formatIsoDate(letter.regDate)) : notSet),
    },
    {
      key: 'registrar',
      icon: <UserPen className="size-3.5" />,
      label: ui.letters.fields.registrar,
      render: () => <Person user={letter.registrar} />,
    },
    {
      key: 'received',
      icon:
        letter.source === 'manual' ? (
          <ScanLine className="size-3.5" />
        ) : (
          <Mail className="size-3.5" />
        ),
      label: ui.letters.fields.receivedAt,
      render: () => (
        <span className="flex min-w-0 items-baseline gap-2">
          {mono(formatDateTimeShort(letter.receivedAt))}
          <span className="truncate text-xs text-muted-foreground">
            {ui.letters.source[letter.source]}
          </span>
        </span>
      ),
    },
    {
      key: 'type',
      icon: <Shapes className="size-3.5" />,
      label: ui.letters.fields.type,
      render: () => <span className="truncate">{letter.type.name}</span>,
    },
  ];

  // Подсказка, почему поля не правятся: у нового — окно регистрации, у
  // зарегистрированного в работе без права — канцелярия.
  const hint =
    boxOfLetter(letter) === 'new'
      ? { icon: <Stamp className="size-3.5" />, text: ui.letters.card.newHint }
      : !editable && letter.registeredAt !== null && !isFinalState(letter.stage.systemState)
        ? { icon: <Lock className="size-3.5" />, text: ui.letters.card.readOnlyHint }
        : null;

  return (
    <>
      <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />
      {hint ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="shrink-0 opacity-70">
            {hint.icon}
          </span>
          {hint.text}
        </p>
      ) : null}
    </>
  );
});
