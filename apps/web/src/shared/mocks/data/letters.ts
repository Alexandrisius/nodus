import type { LetterDetail, LetterListItem, UserRef } from '@nodus/contracts';

import { cid, demoConversations } from './chat.js';
import {
  counterpartyIds,
  counterpartyRefById,
  defaultDocumentKind,
  sharedMailbox,
} from './counterparties.js';
import { isoAgo, isoDateIn } from './dates.js';
import { demoLetterExtras, lid, type LetterExtras } from './letter-bodies.js';
import { demoTasks, projectRefs, tid } from './tasks.js';
import { userIds, userRef } from './users.js';

export { lid };

/** Демо-набор корреспонденции v2 (вердикты владельца 22.09.2026): живая
 *  история компании — письма заказчика и подрядчика (почта), госоргана
 *  (СМДО), скан исходящего (бумага), незарегистрированные входящие (пресет
 *  «К регистрации»), документы «в работе» (в т.ч. просроченный с резолюцией
 *  из 3 поручений), «исполнено» и «в деле», ответ-цепочка (inReplyToId).
 *  Нумерация серий непрерывна: Вх — …115/116/117 (следующий 118),
 *  Исх — …40/41 (следующий 42). */

function cp(id: string) {
  const ref = counterpartyRefById(id);
  if (!ref) throw new Error(`Неизвестный демо-контрагент: ${id}`);
  return ref;
}

export const demoLetters: LetterListItem[] = [
  {
    id: lid(1),
    type: 'incoming',
    receiveChannel: 'email',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.stroyzakazchik),
    subject: 'О согласовании изменений в проектную документацию (корпус Б)',
    recipients: [userRef(userIds.klimovich), userRef(userIds.vinnichek)],
    cc: [],
    date: isoAgo(0, 9, 12),
    registration: null,
    documentStatus: null,
    inReplyToId: null,
  },
  {
    id: lid(2),
    type: 'incoming',
    receiveChannel: 'smdo',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.minstroy),
    subject: 'О проведении плановой проверки проектной организации',
    recipients: [userRef(userIds.shaiderova)],
    cc: [userRef(userIds.karpovich)],
    date: isoAgo(1, 16, 40),
    registration: null,
    documentStatus: null,
    inReplyToId: null,
  },
  {
    id: lid(3),
    type: 'incoming',
    receiveChannel: 'email',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.galurgiya),
    subject: 'Замечания по разделу КЖ главного корпуса (этап 0359)',
    recipients: [userRef(userIds.klimovich)],
    cc: [userRef(userIds.vinnichek), userRef(userIds.matorin)],
    date: isoAgo(3, 11, 20),
    registration: {
      regNumber: 'Вх-2026/115',
      regDate: isoDateIn(-3),
      type: 'incoming',
      documentKind: defaultDocumentKind,
      counterparty: cp(counterpartyIds.galurgiya),
      project: projectRefs.p4,
      addressee: userRef(userIds.klimovich),
      deadline: isoDateIn(-1),
      correspondentNumber: '0359-КЖ/147',
      correspondentDate: isoDateIn(-5),
    },
    documentStatus: 'in_work',
    inReplyToId: null,
  },
  {
    id: lid(4),
    type: 'incoming',
    receiveChannel: 'email',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.tehssnab),
    subject: 'Коммерческое предложение по вентиляционному оборудованию',
    recipients: [userRef(userIds.vinnichek)],
    cc: [userRef(userIds.klimovich)],
    date: isoAgo(1, 10, 5),
    registration: {
      regNumber: 'Вх-2026/116',
      regDate: isoDateIn(-1),
      type: 'incoming',
      documentKind: defaultDocumentKind,
      counterparty: cp(counterpartyIds.tehssnab),
      project: projectRefs.p4,
      addressee: userRef(userIds.vinnichek),
      deadline: isoDateIn(6),
      correspondentNumber: 'ТС-09/214',
      correspondentDate: isoDateIn(-2),
    },
    documentStatus: 'in_work',
    inReplyToId: null,
  },
  {
    id: lid(5),
    type: 'outgoing',
    receiveChannel: 'paper',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.galurgiya),
    subject: 'О готовности раздела АР к передаче заказчику',
    recipients: [],
    cc: [],
    date: isoAgo(6, 15, 0),
    registration: {
      regNumber: 'Исх-2026/41',
      regDate: isoDateIn(-6),
      type: 'outgoing',
      documentKind: defaultDocumentKind,
      counterparty: cp(counterpartyIds.galurgiya),
      project: projectRefs.p4,
      addressee: userRef(userIds.klimovich),
      deadline: null,
      correspondentNumber: null,
      correspondentDate: null,
    },
    documentStatus: 'archived',
    inReplyToId: null,
  },
  {
    id: lid(6),
    type: 'outgoing',
    receiveChannel: 'email',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.tehssnab),
    subject: 'О рассмотрении коммерческого предложения',
    recipients: [],
    cc: [],
    date: isoAgo(1, 17, 20),
    registration: {
      regNumber: 'Исх-2026/40',
      regDate: isoDateIn(-1),
      type: 'outgoing',
      documentKind: defaultDocumentKind,
      counterparty: cp(counterpartyIds.tehssnab),
      project: projectRefs.p4,
      addressee: userRef(userIds.vinnichek),
      deadline: null,
      correspondentNumber: null,
      correspondentDate: null,
    },
    documentStatus: 'executed',
    inReplyToId: lid(4),
  },
  {
    id: lid(7),
    type: 'incoming',
    receiveChannel: 'email',
    mailbox: sharedMailbox,
    counterparty: cp(counterpartyIds.promstroymontazh),
    subject: 'О графике монтажа металлоконструкций (этап 0359)',
    recipients: [userRef(userIds.matorin)],
    cc: [userRef(userIds.klimovich)],
    date: isoAgo(2, 8, 45),
    registration: {
      regNumber: 'Вх-2026/117',
      regDate: isoDateIn(-2),
      type: 'incoming',
      documentKind: defaultDocumentKind,
      counterparty: cp(counterpartyIds.promstroymontazh),
      project: projectRefs.p4,
      addressee: userRef(userIds.matorin),
      deadline: isoDateIn(4),
      correspondentNumber: 'ПСМ-09/77',
      correspondentDate: isoDateIn(-3),
    },
    documentStatus: 'in_work',
    inReplyToId: null,
  },
];

/** Задачи-поручения по письмам (резолюции): пересчёт статуса документа и
 *  снапшотов стадий при закрытии задачи (пополняется хендлером резолюций). */
export const letterTaskIds: Record<string, string[]> = {
  [lid(3)]: [tid(5), tid(12), tid(13)],
};

/** Содержимое письма, созданного в концепте («Написать письмо»): тело,
 *  вложения, резолюции + своя беседа (у демо-писем беседа — cid(100+n)). */
const composedExtras = new Map<string, LetterExtras & { conversationId: string }>();

export function registerComposedLetter(
  id: string,
  extras: LetterExtras,
  conversationId: string,
): void {
  composedExtras.set(id, { ...extras, conversationId });
}

function lcidOf(letterId: string): string {
  return cid(100 + Number(letterId.slice(-12)));
}

export function letterExtrasOf(letterId: string): LetterExtras {
  const composed = composedExtras.get(letterId);
  if (composed) return composed;
  const seeded = demoLetterExtras[letterId];
  if (seeded) return seeded;
  const fresh: LetterExtras = { body: '', attachments: [], resolutions: [] };
  demoLetterExtras[letterId] = fresh;
  return fresh;
}

export function letterDetailOf(letter: LetterListItem): LetterDetail {
  const composed = composedExtras.get(letter.id);
  const extras = letterExtrasOf(letter.id);
  return {
    ...letter,
    ...extras,
    conversationId: composed?.conversationId ?? lcidOf(letter.id),
  };
}

/** Беседа чата письма (type 'letter'): создаётся для каждого письма,
 *  участники — ТОЛЬКО внутренние сотрудники (обсуждение наружу не уходит). */
export function createLetterConversation(letter: LetterListItem, members: UserRef[]): string {
  const id = crypto.randomUUID();
  demoConversations.push({
    id,
    type: 'letter',
    title: null,
    avatarUrl: null,
    draft: null,
    visibility: null,
    description: null,
    project: null,
    task: null,
    letter: {
      id: letter.id,
      regNumber: letter.registration?.regNumber ?? null,
      subject: letter.subject,
    },
    membersPreview: members,
    lastMessage: null,
    unreadCount: 0,
    pinned: false,
    muted: false,
    snoozed: false,
  });
  return id;
}

/** Синхронизация документа с его поручениями-задачами: снапшоты стадий в
 *  строках поручений + статус «исполнено», когда все задачи завершены
 *  («в дело» — только вручную, архив не трогаем). Вызывается из моков задач
 *  при смене стадии задачи с source 'letter'. */
export function syncLetterWithTasks(letterId: string): void {
  const letter = demoLetters.find((l) => l.id === letterId);
  if (!letter || letter.documentStatus === null || letter.documentStatus === 'archived') return;
  const extras = letterExtrasOf(letterId);
  const taskIds = letterTaskIds[letterId] ?? [];
  let allDone = taskIds.length > 0;
  for (const taskId of taskIds) {
    const stage = demoTasks.find((t) => t.id === taskId)?.stage ?? null;
    for (const resolution of extras.resolutions) {
      for (const instruction of resolution.instructions) {
        if (instruction.task?.id === taskId) instruction.taskStage = stage;
      }
    }
    if (!stage || (stage.systemState !== 'done' && stage.systemState !== 'closed')) {
      allDone = false;
    }
  }
  letter.documentStatus = allDone ? 'executed' : 'in_work';
}

/** Письмо-владелец задачи-поручения (для моков задач: closed → пересчёт). */
export function letterIdByTaskId(taskId: string): string | undefined {
  return Object.keys(letterTaskIds).find((letterId) => letterTaskIds[letterId]?.includes(taskId));
}
