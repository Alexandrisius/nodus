import { ChevronDown, Pencil, X } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import type { ContactRef, CounterpartyRef, LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../../app/shell/use-card-stack.js';
import { CounterpartyCombobox } from '../../../../shared/counterparties/counterparty-combobox.js';
import { fromIsoDate } from '../../../../shared/custom-fields/value-format.js';
import { DateTimePicker } from '../../../../shared/ui/date-time-picker.js';
import { identityTone } from '../../../../shared/ui/identity-tone.js';
import { ProjectPicker } from '../../../../shared/ui/project-picker.js';
import { useReceiptMethods } from '../../api/letters-queries.js';
import { todayIso } from '../../lib/letter-format.js';
import { SignerField } from '../registration/signer-field.js';

/** Правка полей письма по месту (#55, U7): грамматика полей карточки задачи —
 *  значение строкой, ховер-подложка, без рамок; Esc гасит правку, а не
 *  карточку. Сохранение — оптимистично у хозяина (`useUpdateLetter`). */

const valueButton =
  '-mx-1 inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md px-1 text-left transition-colors hover:bg-accent';

export const notSet = <span className="text-muted-foreground">{ui.common.notSet}</span>;

const editLabel = (label: string) => `${ui.letters.card.editHint}: ${label}`;

/** Карандаш значения-ссылки (клик по самому значению открывает карточку).
 *  Пропсы и ref прокидываются: кнопка бывает триггером поповера (asChild). */
function EditButton({ label, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={editLabel(label)}
      title={editLabel(label)}
      {...props}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-50 transition-opacity group-hover/value:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
    >
      <Pencil className="size-3" strokeWidth={1.75} />
    </button>
  );
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${ui.filters.reset}: ${label}`}
      title={`${ui.filters.reset}: ${label}`}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
    >
      <X className="size-3" strokeWidth={1.75} />
    </button>
  );
}

/** Строка правки: ввод по месту — Enter/уход сохраняют, Esc — отмена;
 *  пустое значение обязательного поля — отмена (сервер его не примет). */
export function TextFieldValue({
  value,
  label,
  maxLength,
  editable,
  onCommit,
}: {
  value: string | null;
  label: string;
  maxLength: number;
  editable: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = value ? (
    <span className="truncate font-mono text-label-sm tabular-nums">{value}</span>
  ) : (
    notSet
  );
  if (!editable) return text;

  function commit() {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== value) onCommit(next);
  }

  return draft !== null ? (
    <input
      autoFocus
      value={draft}
      maxLength={maxLength}
      aria-label={editLabel(label)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
        }
      }}
      className="-mx-1 h-6 w-56 max-w-full rounded-md bg-accent/50 px-1 font-mono text-label-sm outline-none"
    />
  ) : (
    <button
      type="button"
      className={valueButton}
      aria-label={editLabel(label)}
      onClick={() => setDraft(value ?? '')}
    >
      {text}
    </button>
  );
}

/** Календарная дата (без времени): «Их дата» не позже сегодня, срок ответа
 *  не раньше сегодня — та же проверка, что у сервера (`checkLetterDates`),
 *  до отправки; нарушение — подсказка без запроса. */
export function DateFieldValue({
  value,
  label,
  editable,
  rule,
  clearLabel,
  display,
  onCommit,
  onRejected,
}: {
  value: string | null;
  label: string;
  editable: boolean;
  rule: 'not_future' | 'not_past';
  /** Сброс в календаре (необязательное поле). */
  clearLabel?: string;
  display: ReactNode;
  onCommit: (value: string | null) => void;
  onRejected: (reason: 'in_future' | 'in_past') => void;
}) {
  if (!editable) return <>{display}</>;
  return (
    <DateTimePicker
      value={value ? fromIsoDate(value) : null}
      withTime={false}
      ariaLabel={label}
      clearLabel={clearLabel}
      onChange={(date) => {
        const iso = date ? todayIso(date) : null;
        if (iso === value) return;
        const today = todayIso();
        if (iso && rule === 'not_future' && iso > today) return onRejected('in_future');
        if (iso && rule === 'not_past' && iso < today) return onRejected('in_past');
        onCommit(iso);
      }}
    >
      <button type="button" className={valueButton} aria-label={editLabel(label)}>
        {display}
      </button>
    </DateTimePicker>
  );
}

/** Способ поступления — меню действующих элементов справочника (Р14). */
export function ReceiptMethodValue({
  letter,
  editable,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  onCommit: (method: { id: string; name: string }) => void;
}) {
  const { data: methods = [] } = useReceiptMethods();
  const current = letter.receiptMethod;
  const text = current ? <span className="truncate">{current.name}</span> : notSet;
  if (!editable) return text;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={valueButton}
        aria-label={editLabel(ui.letters.fields.receiptMethod)}
      >
        {text}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-max min-w-44">
        {methods
          .filter((method) => method.isActive || method.id === current?.id)
          .map((method) => (
            <DropdownMenuItem
              key={method.id}
              onSelect={() =>
                method.id !== current?.id && onCommit({ id: method.id, name: method.name })
              }
              className={cn(method.id === current?.id && 'text-port')}
            >
              {method.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Корреспондент: имя — ссылка на карточку контрагента (CRM), карандаш —
 *  смена корреспондента комбобоксом по месту (с созданием на лету). */
export function CounterpartyValue({
  letter,
  editable,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  onCommit: (ref: CounterpartyRef) => void;
}) {
  const openCard = useOpenCard();
  const [editing, setEditing] = useState(false);
  const label = ui.letters.fields.counterparty;

  if (editing) {
    return (
      <CounterpartyCombobox
        value={letter.counterparty}
        autoFocus
        ariaLabel={label}
        placeholder={ui.letters.form.counterpartyPlaceholder}
        className="max-w-80"
        onDismiss={() => setEditing(false)}
        onChange={(ref) => {
          setEditing(false);
          if (ref && ref.id !== letter.counterparty?.id) onCommit(ref);
        }}
      />
    );
  }
  return (
    <span className="group/value flex min-w-0 items-center gap-1">
      {letter.counterparty ? (
        <button
          type="button"
          title={letter.counterparty.name}
          onClick={() => openCard({ kind: 'counterparty', id: letter.counterparty?.id ?? '' })}
          className="min-w-0 truncate text-left text-sm text-info hover:underline"
        >
          {letter.counterparty.name}
        </button>
      ) : (
        notSet
      )}
      {editable ? <EditButton label={label} onClick={() => setEditing(true)} /> : null}
    </span>
  );
}

/** Подписант — контакт корреспондента (с «Создать контакт»); сброс — крестик. */
export function SignerValue({
  letter,
  editable,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  onCommit: (signer: ContactRef | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = ui.letters.fields.signer;
  const signer = letter.signer;
  const text = signer ? (
    <span className="min-w-0 truncate">
      {signer.fullName}
      {signer.position ? <span className="text-muted-foreground">, {signer.position}</span> : null}
    </span>
  ) : (
    notSet
  );
  if (!editable || !letter.counterparty) return text;

  if (editing) {
    return (
      <div className="w-80 max-w-full">
        <SignerField
          counterpartyId={letter.counterparty.id}
          value={signer}
          autoFocus
          onDismiss={() => setEditing(false)}
          onChange={(next) => {
            setEditing(false);
            if (next?.id !== signer?.id) onCommit(next);
          }}
        />
      </div>
    );
  }
  return (
    <span className="group/value flex min-w-0 items-center gap-1">
      <button
        type="button"
        className={valueButton}
        aria-label={editLabel(label)}
        onClick={() => setEditing(true)}
      >
        {text}
      </button>
      {signer ? <ClearButton label={label} onClick={() => onCommit(null)} /> : null}
    </span>
  );
}

/** Проект (Р15): ссылка на карточку проекта, карандаш — общий выбор проекта,
 *  крестик — без проекта. */
export function ProjectValue({
  letter,
  editable,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  onCommit: (projectId: string | null) => void;
}) {
  const openCard = useOpenCard();
  const label = ui.letters.fields.project;
  const project = letter.project;
  return (
    <span className="group/value flex min-w-0 items-center gap-1">
      {project ? (
        <button
          type="button"
          title={`${project.code} — ${project.name}`}
          onClick={() => openCard({ kind: 'project', id: project.id })}
          className="flex min-w-0 items-center gap-1.5 text-sm text-info hover:underline"
        >
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', identityTone[project.color].dot)}
          />
          <span className="truncate">{project.name}</span>
        </button>
      ) : (
        notSet
      )}
      {editable ? (
        <>
          <ProjectPicker
            value={project?.id}
            ariaLabel={label}
            onChange={(projectId) => {
              if ((projectId ?? null) !== (project?.id ?? null)) onCommit(projectId ?? null);
            }}
          >
            <EditButton label={label} />
          </ProjectPicker>
          {project ? <ClearButton label={label} onClick={() => onCommit(null)} /> : null}
        </>
      ) : null}
    </span>
  );
}
