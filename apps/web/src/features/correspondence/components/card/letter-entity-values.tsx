import { useState, type ReactNode } from 'react';
import type { ContactRef, CounterpartyRef, LetterDetail, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../../app/shell/use-card-stack.js';
import { CounterpartyCombobox } from '../../../../shared/counterparties/counterparty-combobox.js';
import { identityTone } from '../../../../shared/ui/identity-tone.js';
import { PersonAvatar } from '../../../../shared/ui/person-avatar.js';
import { ProjectPicker } from '../../../../shared/ui/project-picker.js';
import { AddresseeField } from '../registration/addressee-field.js';
import { SignerField } from '../registration/signer-field.js';
import { ClearButton, EditButton, editLabel, notSet, valueButton } from './letter-value-bits.js';

/** Корреспондент: имя — ссылка на карточку контрагента (CRM), карандаш —
 *  смена корреспондента комбобоксом по месту (с созданием на лету). */
export function CounterpartyValue({
  letter,
  editable,
  empty = notSet,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  /** Пустое значение (обязательное поле — предупреждающий тон). */
  empty?: ReactNode;
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
  // Пустое значение — кнопка-подложка, как у прочих редакторов доски (карандаш
  // нужен только там, где само значение — ссылка на карточку: без него клик
  // по имени ушёл бы в CRM вместо правки).
  if (!letter.counterparty) {
    if (!editable) return empty;
    return (
      <button
        type="button"
        className={valueButton}
        aria-label={editLabel(label)}
        onClick={() => setEditing(true)}
      >
        {empty}
      </button>
    );
  }
  return (
    <span className="group/value flex min-w-0 items-center gap-1">
      <button
        type="button"
        title={letter.counterparty.name}
        onClick={() => openCard({ kind: 'counterparty', id: letter.counterparty?.id ?? '' })}
        className="min-w-0 truncate text-left text-sm text-info hover:underline"
      >
        {letter.counterparty.name}
      </button>
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

/** Адресат незарегистрированного письма (редизайн #56): один сотрудник —
 *  тот же селектор, что в форме регистрации (сверху «Принимают решения»);
 *  выбор и сброс — оптимистичный PATCH `addresseeId` у хозяина доски. */
export function AddresseeValue({
  letter,
  editable,
  empty = notSet,
  onCommit,
}: {
  letter: LetterDetail;
  editable: boolean;
  /** Пустое значение (обязательное поле — предупреждающий тон). */
  empty?: ReactNode;
  onCommit: (addressee: UserRef | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = ui.letters.fields.addressee;
  const addressee = letter.addressee;
  const text = addressee ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <PersonAvatar
        name={addressee.displayName}
        avatarUrl={addressee.avatarUrl}
        className="size-6 shrink-0"
      />
      <span className="truncate">{addressee.displayName}</span>
    </span>
  ) : (
    empty
  );
  if (!editable) return text;

  if (editing) {
    return (
      <div className="w-80 max-w-full">
        <AddresseeField
          value={addressee}
          autoFocus
          onChange={(user) => {
            setEditing(false);
            if ((user?.id ?? null) !== (addressee?.id ?? null)) onCommit(user);
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
      {addressee ? <ClearButton label={label} onClick={() => onCommit(null)} /> : null}
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
