import type {
  ContactRef,
  CounterpartyRef,
  CustomFieldValues,
  LetterAccess,
  LetterAttachment,
  LetterBody,
  LetterBox,
  LetterDetail,
  LetterDirection,
  LetterListItem,
  LetterRef,
  LetterSource,
  ProjectRef,
  ReceiptMethodRef,
  TaskStage,
  UserRef,
} from '@nodus/contracts';
import { isFinalState, Permission } from '@nodus/contracts';

import { letterProcessTypes } from './letter-catalog.js';

/** Запись письма мок-сервера (#55): поля `LetterDetail` без вычисляемых
 *  (тип-ссылка, счётчик файлов, права зрителя) + участники обсуждения и
 *  автор (ручное создание). Чистые функции — без состояния и актёра. */
export interface DemoLetter {
  id: string;
  typeId: string;
  direction: LetterDirection;
  stage: TaskStage;
  regNumber: string | null;
  regDate: string | null;
  registeredAt: string | null;
  receivedAt: string;
  source: LetterSource;
  subject: string | null;
  counterparty: CounterpartyRef | null;
  theirNumber: string | null;
  theirDate: string | null;
  receiptMethod: ReceiptMethodRef | null;
  project: ProjectRef | null;
  addressee: UserRef | null;
  responseDeadline: string | null;
  signer: ContactRef | null;
  registrar: UserRef | null;
  attachments: LetterAttachment[];
  body: LetterBody;
  customFields: CustomFieldValues;
  /** Присоединившиеся к обсуждению (адресат — участник по роли). */
  participantIds: string[];
  createdById: string | null;
}

/** Актёр мок-сервера: id и права (без импорта стора сессии). */
export interface LetterActor {
  id: string;
  permissions: readonly string[];
}

export function canRegisterLetters(actor: LetterActor): boolean {
  return actor.permissions.includes(Permission.CORRESPONDENCE_REGISTER);
}

/** Видимость (Р7): зарегистрированное — всем, незарегистрированное —
 *  держателям `correspondence.register`; невидимое — 404 без оракула. */
export function canSeeLetter(letter: DemoLetter, actor: LetterActor): boolean {
  return letter.registeredAt !== null || canRegisterLetters(actor);
}

/** Вкладка письма: «Новые» — незарегистрированные в начальной стадии;
 *  закрытые без регистрации не попадают никуда (видны по ссылке). */
export function boxOf(letter: DemoLetter): LetterBox | null {
  if (letter.registeredAt !== null) return letter.direction;
  return letter.stage.systemState === 'backlog' ? 'new' : null;
}

/** Участники обсуждения письма: адресат + присоединившиеся (регистратор — нет, В2). */
export function letterMemberIds(letter: DemoLetter): string[] {
  const ids = letter.addressee ? [letter.addressee.id] : [];
  for (const id of letter.participantIds) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function letterRefOf(letter: DemoLetter): LetterRef {
  return { id: letter.id, regNumber: letter.regNumber, subject: letter.subject };
}

export function letterListItemOf(letter: DemoLetter): LetterListItem {
  return {
    id: letter.id,
    typeId: letter.typeId,
    direction: letter.direction,
    stage: letter.stage,
    regNumber: letter.regNumber,
    regDate: letter.regDate,
    registeredAt: letter.registeredAt,
    receivedAt: letter.receivedAt,
    source: letter.source,
    subject: letter.subject,
    counterparty: letter.counterparty,
    theirNumber: letter.theirNumber,
    theirDate: letter.theirDate,
    receiptMethod: letter.receiptMethod,
    project: letter.project,
    addressee: letter.addressee,
    responseDeadline: letter.responseDeadline,
    attachmentCount: letter.attachments.filter((a) => a.role !== 'source').length,
  };
}

function accessOf(letter: DemoLetter, actor: LetterActor): LetterAccess {
  const register = canRegisterLetters(actor);
  const open = !isFinalState(letter.stage.systemState);
  const isParticipant = letterMemberIds(letter).includes(actor.id);
  return {
    canEdit: register && letter.registeredAt !== null && open,
    canDeleteSpam: register && boxOf(letter) === 'new',
    canJoin: !isParticipant && open,
    isParticipant,
  };
}

export function letterDetailOf(letter: DemoLetter, actor: LetterActor): LetterDetail {
  const type = letterProcessTypes.find((t) => t.id === letter.typeId) ?? letterProcessTypes[0]!;
  return {
    ...letterListItemOf(letter),
    type: { id: type.id, code: type.code, name: type.name, category: type.category },
    signer: letter.signer,
    registrar: letter.registrar,
    attachments: letter.attachments,
    body: letter.body,
    customFields: letter.customFields,
    customFieldRefs: [],
    access: accessOf(letter, actor),
  };
}
