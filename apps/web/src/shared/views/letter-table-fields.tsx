import { CalendarClock, Paperclip } from 'lucide-react';
import type { LetterListItem, TaskSystemState } from '@nodus/contracts';
import { isOpenState, ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { projectsAvailable } from '../api/projects-available.js';
import { formatIsoDate, toIsoDate } from '../custom-fields/value-format.js';
import { formatDateTimeShort } from '../lib/format.js';
import { monoCell, PersonCell } from '../ui/person-cell.js';
import { ProjectIdentityIcon } from '../ui/project-identity-icon.js';
import { StageChip } from '../ui/stage-chip.js';
import type { DataTableField } from './data-table.js';

const dash = <span className={monoCell}>—</span>;

/** Реквизиты документа корреспондента: «01-12/345 от 20.10.2026». */
export function theirReference(letter: {
  theirNumber: string | null;
  theirDate: string | null;
}): string {
  const date = letter.theirDate ? formatIsoDate(letter.theirDate) : '';
  if (letter.theirNumber && date) {
    return `${letter.theirNumber} ${ui.letters.fields.dateFrom} ${date}`;
  }
  return letter.theirNumber ?? (date ? `${ui.letters.fields.dateFrom} ${date}` : '');
}

/** Срок ответа истёк: календарный день в прошлом, а письмо ещё в работе
 *  (открытая стадия маршрута; закрытое письмо срок не «жжёт»). */
export function isResponseOverdue(
  letter: { responseDeadline: string | null; stage: { systemState: TaskSystemState } },
  today = toIsoDate(new Date()),
): boolean {
  return (
    letter.responseDeadline !== null &&
    letter.responseDeadline < today &&
    isOpenState(letter.stage.systemState)
  );
}

/** Срок ответа письма — календарный день (не момент): истёк — красный чип,
 *  сегодня — оранжевый, иначе — моно-дата; у закрытого письма — нейтрально. */
export function ResponseDeadline({
  deadline,
  state,
}: {
  deadline: string | null;
  state: TaskSystemState;
}) {
  if (!deadline) return dash;
  const today = toIsoDate(new Date());
  const urgent = isOpenState(state);
  const overdue = urgent && deadline < today;
  if (!overdue && !(urgent && deadline === today)) {
    return <span className={monoCell}>{formatIsoDate(deadline)}</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-label-sm tabular-nums',
        overdue ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
      )}
    >
      <CalendarClock className="size-3.5" aria-hidden />
      {formatIsoDate(deadline)}
      {overdue ? <span className="sr-only">{ui.letters.list.presetOverdue}</span> : null}
    </span>
  );
}

/**
 * ЕДИНЫЙ реестр колонок списка писем (#55; стандарт «модули не отличаются»,
 * образец — `project-table-fields`): журналы «Входящие»/«Исходящие» и
 * вкладка «Письма» карточки контрагента — каждый со своим viewKey, реестр
 * один. Порядок по умолчанию — как в журнале регистрации: №, дата,
 * корреспондент, тема, их № и дата, адресат, статус, срок ответа; редкие
 * поля — в шестерёнке. Сортировка № — по моменту регистрации (порядок
 * выдачи номеров серии; строковая «Вх-2026/99» > «…/108» врала бы).
 * `counterpartyVisible: false` — внутри карточки контрагента контекст очевиден.
 */
export function makeLetterTableFields({
  counterpartyVisible = true,
}: { counterpartyVisible?: boolean } = {}): DataTableField<LetterListItem>[] {
  const fields: DataTableField<LetterListItem>[] = [
    {
      id: 'regNumber',
      label: ui.letters.fields.regNumber,
      defaultVisible: true,
      defaultWidth: 124,
      minWidth: 96,
      maxWidth: 200,
      render: (letter) => (
        <span className="truncate font-mono text-label-sm text-foreground tabular-nums">
          {letter.regNumber ?? ui.letters.noNumber}
        </span>
      ),
      sortValue: (letter) => letter.registeredAt,
    },
    {
      id: 'regDate',
      label: ui.letters.fields.regDate,
      defaultVisible: true,
      defaultWidth: 140,
      minWidth: 104,
      render: (letter) =>
        letter.regDate ? <span className={monoCell}>{formatIsoDate(letter.regDate)}</span> : dash,
      sortValue: (letter) => letter.registeredAt,
    },
    {
      id: 'counterparty',
      label: ui.letters.fields.counterparty,
      defaultVisible: counterpartyVisible,
      defaultWidth: 220,
      minWidth: 140,
      maxWidth: 420,
      render: (letter) =>
        letter.counterparty ? (
          <span className="truncate text-sm" title={letter.counterparty.name}>
            {letter.counterparty.name}
          </span>
        ) : (
          dash
        ),
      sortValue: (letter) => letter.counterparty?.name ?? null,
    },
    {
      id: 'subject',
      label: ui.letters.fields.subject,
      defaultVisible: true,
      defaultWidth: 360,
      minWidth: 180,
      maxWidth: 640,
      locked: true,
      render: (letter) => (
        <span
          className={cn(
            'truncate text-sm',
            letter.subject ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {letter.subject ?? ui.letters.noSubject}
        </span>
      ),
      sortValue: (letter) => letter.subject,
    },
    {
      id: 'theirNumber',
      label: ui.letters.fields.theirNumberAndDate,
      defaultVisible: true,
      defaultWidth: 188,
      minWidth: 128,
      maxWidth: 300,
      render: (letter) => {
        const reference = theirReference(letter);
        return reference ? (
          <span className={cn(monoCell, 'truncate')} title={reference}>
            {reference}
          </span>
        ) : (
          dash
        );
      },
      sortValue: (letter) => letter.theirDate,
    },
    {
      id: 'addressee',
      label: ui.letters.fields.addressee,
      defaultVisible: true,
      defaultWidth: 184,
      minWidth: 120,
      render: (letter) => <PersonCell user={letter.addressee} />,
      sortValue: (letter) => letter.addressee?.displayName ?? null,
    },
    {
      id: 'stage',
      label: ui.letters.fields.stage,
      defaultVisible: true,
      defaultWidth: 172,
      minWidth: 120,
      render: (letter) => <StageChip name={letter.stage.name} color={letter.stage.color} />,
      // order стадии — по ходу маршрута, а не по алфавиту.
      sortValue: (letter) => letter.stage.order,
    },
    {
      id: 'responseDeadline',
      label: ui.letters.fields.responseDeadline,
      defaultVisible: true,
      defaultWidth: 136,
      minWidth: 112,
      render: (letter) => (
        <ResponseDeadline deadline={letter.responseDeadline} state={letter.stage.systemState} />
      ),
      sortValue: (letter) => letter.responseDeadline,
    },
    {
      id: 'receiptMethod',
      label: ui.letters.fields.receiptMethod,
      defaultVisible: false,
      defaultWidth: 168,
      minWidth: 120,
      render: (letter) =>
        letter.receiptMethod ? (
          <span className="truncate text-sm">{letter.receiptMethod.name}</span>
        ) : (
          dash
        ),
      sortValue: (letter) => letter.receiptMethod?.name ?? null,
    },
    {
      id: 'receivedAt',
      label: ui.letters.fields.receivedAt,
      defaultVisible: false,
      defaultWidth: 156,
      minWidth: 128,
      render: (letter) => (
        <span className={monoCell}>{formatDateTimeShort(letter.receivedAt)}</span>
      ),
      sortValue: (letter) => letter.receivedAt,
    },
    {
      id: 'files',
      label: ui.letters.fields.files,
      defaultVisible: false,
      defaultWidth: 88,
      minWidth: 72,
      render: (letter) =>
        letter.attachmentCount > 0 ? (
          <>
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className={monoCell}>{letter.attachmentCount}</span>
          </>
        ) : (
          dash
        ),
      sortValue: (letter) => letter.attachmentCount,
    },
  ];
  if (projectsAvailable('letters')) {
    fields.splice(fields.length - 3, 0, {
      id: 'project',
      label: ui.letters.fields.project,
      defaultVisible: false,
      defaultWidth: 220,
      minWidth: 140,
      maxWidth: 420,
      render: (letter) =>
        letter.project ? (
          <>
            <ProjectIdentityIcon color={letter.project.color} className="size-5" />
            <span className="truncate text-sm">
              <span className={cn(monoCell, 'mr-1.5')}>{letter.project.code}</span>
              {letter.project.name}
            </span>
          </>
        ) : (
          dash
        ),
      sortValue: (letter) => letter.project?.code ?? null,
    });
  }
  return fields;
}
