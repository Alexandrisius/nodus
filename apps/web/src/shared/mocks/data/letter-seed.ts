// I5-обоснование: плоский мок-набор писем (данные, не god-object) — одна
// ответственность «демо-мир корреспонденции»; журнал — letter-history-seed.ts.
import type { ContactRef, CounterpartyRef, ReceiptMethodRef, TaskStage } from '@nodus/contracts';

import { contactIds, counterpartyIds, demoCounterpartyById } from './counterparties.js';
import { fieldIds } from './custom-fields.js';
import { isoAgo, isoDateIn } from './dates.js';
import { itemById, receiptMethodIds } from './dictionaries.js';
import { incomingLetterType, letterStages } from './letter-catalog.js';
import { kzh147Extra, newLetterFiles as f, registeredMain } from './letter-files.js';
import { lid } from './letter-ids.js';
import type { DemoLetter } from './letters-model.js';
import { projectRefs } from './task-item-factory.js';
import { userIds, userRef } from './users.js';

/** Мир писем (#55, §7.6): «Новые» — шесть видов поступления (HTML с
 *  внешними картинками и скриптом, PDF + текст, docx, скан без темы, только
 *  текст, многостраничный PDF); зарегистрированные входящие Вх-2026/108…117
 *  (следующий — 118), одно «Ошибочно зарегистрировано» с причиной в чате;
 *  исходящих нет. Даты документов — даты ассетов, регистрация — от «сейчас». */

function cp(id: string): CounterpartyRef {
  const found = demoCounterpartyById(id);
  if (!found) throw new Error(`Неизвестный демо-контрагент: ${id}`);
  return { id: found.id, name: found.shortName };
}

function signer(counterpartyId: string, contactId: string): ContactRef {
  const person = demoCounterpartyById(counterpartyId)?.contactPersons.find(
    (c) => c.id === contactId,
  );
  if (!person) throw new Error(`Неизвестный контакт: ${contactId}`);
  return { id: person.id, fullName: person.fullName, position: person.position };
}

function method(id: string): ReceiptMethodRef {
  const item = itemById(id);
  if (!item) throw new Error(`Неизвестный способ поступления: ${id}`);
  return { id: item.id, name: item.name };
}

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

const base = {
  typeId: incomingLetterType.id,
  direction: 'incoming' as const,
  signer: null,
  registrar: null,
  regNumber: null,
  regDate: null,
  registeredAt: null,
  counterparty: null,
  theirNumber: null,
  theirDate: null,
  receiptMethod: null,
  project: null,
  addressee: null,
  responseDeadline: null,
  customFields: {},
  participantIds: [],
  createdById: null,
};

function fresh(
  n: number,
  receivedAt: string,
  source: DemoLetter['source'],
  subject: string | null,
  attachments: DemoLetter['attachments'],
): DemoLetter {
  const main = attachments.find((a) => a.role === 'main');
  const body = attachments.find((a) => a.role === 'body');
  return {
    ...base,
    id: lid(n),
    stage: letterStages.new,
    receivedAt,
    source,
    subject,
    attachments,
    body: main
      ? { kind: 'document', attachmentId: main.id }
      : body
        ? { kind: body.mime === 'text/html' ? 'html' : 'text', attachmentId: body.id }
        : { kind: 'none' },
    createdById: source === 'manual' ? userIds.karpovich : null,
  };
}

interface Registered {
  n: number;
  seq: number;
  days: number;
  at: [number, number];
  counterparty: string;
  signer?: string;
  theirNumber: string;
  theirDate: string;
  subject: string;
  method: string;
  project?: boolean;
  addressee: string;
  deadline?: number;
  participants?: string[];
  customFields?: DemoLetter['customFields'];
  stage?: TaskStage;
}

function registered(o: Registered): DemoLetter {
  const main = registeredMain[o.n];
  if (!main) throw new Error(`Нет документа письма lid(${o.n})`);
  const attachments = o.n === 3 ? [main, ...kzh147Extra] : [main];
  return {
    ...base,
    id: lid(o.n),
    stage: o.stage ?? letterStages.onResolution,
    regNumber: `Вх-2026/${o.seq}`,
    regDate: isoDateIn(-o.days),
    registeredAt: isoAgo(o.days, o.at[0], o.at[1]),
    receivedAt: isoAgo(o.days, o.at[0] - 1, o.at[1]),
    source: 'mail',
    subject: o.subject,
    counterparty: cp(o.counterparty),
    signer: o.signer ? signer(o.counterparty, o.signer) : null,
    theirNumber: o.theirNumber,
    theirDate: o.theirDate,
    receiptMethod: method(o.method),
    project: o.project ? projectRefs.p4 : null,
    addressee: userRef(o.addressee),
    responseDeadline: o.deadline === undefined ? null : isoDateIn(o.deadline),
    registrar: userRef(userIds.karpovich),
    attachments,
    body: { kind: 'document', attachmentId: main.id },
    customFields: o.customFields ?? {},
    participantIds: o.participants ?? [],
  };
}

const { galurgiya, stroyzakazchik, minstroy, tehssnab, promstroymontazh } = counterpartyIds;
const replyRequired = { [fieldIds.letterReplyRequired]: true };

export function seedLetters(): DemoLetter[] {
  return [
    fresh(21, minutesAgo(18), 'mail', 'О корректировке сроков выдачи раздела КЖ (этап 0359)', [
      f.galurgiyaPdf,
      f.galurgiyaText,
    ]),
    fresh(22, minutesAgo(47), 'mail', 'Приглашение на техническое совещание по корпусу Б', [
      f.inviteHtml,
      f.invitePlan,
    ]),
    fresh(
      23,
      isoAgo(1, 16, 40),
      'mail',
      'Запрос сведений о ходе проектирования объектов 2026 года',
      [f.minstroyDocx, f.minstroyText],
    ),
    fresh(24, isoAgo(1, 11, 5), 'manual', null, [f.scanJpg]),
    fresh(
      25,
      isoAgo(2, 15, 20),
      'mail',
      'Уточнение по договору поставки вентиляционного оборудования',
      [f.tehsnabText],
    ),
    fresh(
      26,
      isoAgo(3, 10, 0),
      'mail',
      'График монтажа металлоконструкций, редакция 2 (этап 0359)',
      [f.psmPdf],
    ),
    registered({
      n: 10,
      seq: 117,
      days: 1,
      at: [16, 5],
      counterparty: galurgiya,
      theirNumber: '0359/203',
      theirDate: '2026-10-24',
      subject: 'Приглашение на приёмку этапа 0359-1',
      method: receiptMethodIds.email,
      project: true,
      addressee: userIds.klimovich,
      deadline: 6,
      customFields: { [fieldIds.letterObjectCode]: '0359-1' },
    }),
    registered({
      n: 9,
      seq: 116,
      days: 2,
      at: [10, 30],
      counterparty: stroyzakazchik,
      signer: contactIds.sidorenko,
      theirNumber: '131/10',
      theirDate: '2026-10-23',
      subject: 'О продлении срока действия договора № 14/2026',
      method: receiptMethodIds.courier,
      addressee: userIds.shaiderova,
      deadline: 10,
      customFields: replyRequired,
    }),
    registered({
      n: 3,
      seq: 115,
      days: 4,
      at: [11, 45],
      counterparty: galurgiya,
      signer: contactIds.petrov,
      theirNumber: '0359-КЖ/147',
      theirDate: '2026-10-20',
      subject: 'Замечания по разделу КЖ главного корпуса (этап 0359)',
      method: receiptMethodIds.email,
      project: true,
      addressee: userIds.klimovich,
      deadline: -1,
      participants: [userIds.vinnichek, userIds.matorin],
      customFields: { [fieldIds.letterObjectCode]: '0359', ...replyRequired },
    }),
    registered({
      n: 8,
      seq: 114,
      days: 4,
      at: [9, 10],
      counterparty: minstroy,
      theirNumber: '04-3-15/3790',
      theirDate: '2026-10-21',
      subject: 'О применении технических нормативных правовых актов с 01.01.2027',
      method: receiptMethodIds.smdo,
      addressee: userIds.shaiderova,
    }),
    registered({
      n: 7,
      seq: 113,
      days: 5,
      at: [15, 30],
      counterparty: promstroymontazh,
      signer: contactIds.melnik,
      theirNumber: 'ПСМ-09/77',
      theirDate: '2026-10-20',
      subject: 'О графике монтажа металлоконструкций (этап 0359)',
      method: receiptMethodIds.email,
      project: true,
      addressee: userIds.matorin,
      deadline: 4,
      participants: [userIds.klimovich],
      customFields: { [fieldIds.letterObjectCode]: '0359' },
    }),
    registered({
      n: 6,
      seq: 112,
      days: 5,
      at: [10, 0],
      counterparty: promstroymontazh,
      theirNumber: '418',
      theirDate: '2026-10-20',
      subject: 'Счёт-фактура № 418 за сентябрь 2026 года',
      method: receiptMethodIds.post,
      addressee: userIds.klimovich,
      stage: letterStages.registeredByMistake,
    }),
    registered({
      n: 5,
      seq: 111,
      days: 6,
      at: [14, 20],
      counterparty: galurgiya,
      signer: contactIds.petrov,
      theirNumber: '0359-ОВ/61',
      theirDate: '2026-10-19',
      subject: 'О предоставлении исходных данных для раздела ОВ',
      method: receiptMethodIds.post,
      project: true,
      addressee: userIds.vinnichek,
      deadline: 2,
      customFields: { [fieldIds.letterObjectCode]: '0359', ...replyRequired },
    }),
    registered({
      n: 4,
      seq: 110,
      days: 7,
      at: [11, 15],
      counterparty: tehssnab,
      signer: contactIds.zhukov,
      theirNumber: 'ТС-09/214',
      theirDate: '2026-10-18',
      subject: 'Коммерческое предложение по вентиляционному оборудованию',
      method: receiptMethodIds.email,
      project: true,
      addressee: userIds.vinnichek,
    }),
    registered({
      n: 2,
      seq: 109,
      days: 7,
      at: [9, 40],
      counterparty: stroyzakazchik,
      signer: contactIds.sidorenko,
      theirNumber: '118/09',
      theirDate: '2026-10-18',
      subject: 'О согласовании изменений в проектную документацию (корпус Б)',
      method: receiptMethodIds.email,
      addressee: userIds.klimovich,
      deadline: 3,
      participants: [userIds.vinnichek],
      customFields: replyRequired,
    }),
    registered({
      n: 1,
      seq: 108,
      days: 8,
      at: [10, 5],
      counterparty: minstroy,
      theirNumber: '04-1-09/3512',
      theirDate: '2026-10-17',
      subject: 'О проведении плановой проверки проектной организации',
      method: receiptMethodIds.smdo,
      addressee: userIds.shaiderova,
      deadline: 5,
      customFields: replyRequired,
    }),
  ];
}
