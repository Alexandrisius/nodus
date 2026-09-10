import type { LetterDetail, LetterListItem } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { projectRefs, tid } from './tasks.js';
import { userIds, userRef } from './users.js';

export const lid = (n: number): string => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoLetters: LetterListItem[] = [
  {
    id: lid(1),
    type: 'incoming',
    regNumber: null,
    regDate: null,
    correspondent: 'ООО «СтройЗаказчик»',
    subject: 'О согласовании изменений в проектную документацию (корпус Б)',
    status: 'unregistered',
    addressee: userRef(userIds.shaiderova),
    project: null,
    deadline: null,
    receivedAt: isoAgo(0, 9, 12),
  },
  {
    id: lid(2),
    type: 'incoming',
    regNumber: null,
    regDate: null,
    correspondent: 'Министерство архитектуры и строительства',
    subject: 'О проведении плановой проверки проектной организации',
    status: 'unregistered',
    addressee: userRef(userIds.shaiderova),
    project: null,
    deadline: null,
    receivedAt: isoAgo(1, 16, 40),
  },
  {
    id: lid(3),
    type: 'incoming',
    regNumber: 'Вх-2026/118',
    regDate: isoDateIn(-3),
    correspondent: 'АО «Галургия»',
    subject: 'Замечания по разделу КЖ главного корпуса (этап 0359)',
    status: 'overdue',
    addressee: userRef(userIds.klimovich),
    project: projectRefs.p4,
    deadline: isoDateIn(-1),
    receivedAt: isoAgo(3, 11, 20),
  },
  {
    id: lid(4),
    type: 'incoming',
    regNumber: 'Вх-2026/121',
    regDate: isoDateIn(-1),
    correspondent: 'ООО «ТехСнаб»',
    subject: 'Коммерческое предложение по вентиляционному оборудованию',
    status: 'in_work',
    addressee: userRef(userIds.vinnichek),
    project: projectRefs.p4,
    deadline: isoDateIn(6),
    receivedAt: isoAgo(1, 10, 5),
  },
  {
    id: lid(5),
    type: 'outgoing',
    regNumber: 'Исх-2026/77',
    regDate: isoDateIn(-6),
    correspondent: 'АО «Галургия»',
    subject: 'О готовности раздела АР к передаче заказчику',
    status: 'done',
    addressee: userRef(userIds.klimovich),
    project: projectRefs.p4,
    deadline: null,
    receivedAt: isoAgo(6, 15, 0),
  },
];

/** Дополнительные данные письма (тело, вложения, резолюции). Для писем,
 *  созданных в концепте («Написать письмо»), — рантим-карта по id. */
const composedExtras = new Map<
  string,
  Pick<LetterDetail, 'body' | 'attachments' | 'resolutions'>
>();

export function registerComposedLetter(
  id: string,
  extra: Pick<LetterDetail, 'body' | 'attachments'>,
): void {
  composedExtras.set(id, { ...extra, resolutions: [] });
}

const aid = (n: number): string => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const letterBodies: Record<string, Pick<LetterDetail, 'body' | 'attachments' | 'resolutions'>> = {
  [lid(1)]: {
    body: `Уважаемые коллеги!

В связи с заменой вентиляционных установок в корпусе Б (решение заказчика от 08.09.2026, протокол совещания прилагается) просим согласовать внесение изменений в проектную документацию по разделам ОВиК и ЭОМ.

Основание: установки марки VX-450, заложенные в проект, сняты с производства; взамен поставщиком предложены VX-460 с иными присоединительными размерами и характеристиками шума. Изменение затрагивает узлы крепления, сечение воздуховодов на участках В1–В4 и нагрузки на электросеть (см. спецификацию и сравнительную таблицу).

Прилагаемые документы:
1. Письмо-обоснование с изменениями по листам (состав изменений — в приложении 1).
2. Скорректированные схемы разделов ОВиК (листы 24–31) и ЭОМ (листы 12–14).
3. Спецификация оборудования с заменами (сравнение «было/стало»).
4. Протокол совещания с заказчиком от 08.09.2026.

Просим рассмотреть и дать заключение о возможности внесения изменений без корректировки стадии Р в части конструктива. Срок ответа прошу подтвердить — по договору у нас 5 рабочих дней.

С уважением,
главный инженер проекта ООО «СтройЗаказчик»
Н.П. Савельев`,
    attachments: [
      {
        id: aid(11),
        name: 'письмо_о_согласовании_корпус-Б.pdf',
        size: 240_000,
        mime: 'application/pdf',
      },
      {
        id: aid(12),
        name: 'приложение_1_состав_изменений.pdf',
        size: 186_000,
        mime: 'application/pdf',
      },
      { id: aid(13), name: 'ОВиК_листы_24-31_изм3.dwg', size: 4_812_000, mime: 'application/acad' },
      { id: aid(14), name: 'ЭОМ_листы_12-14_изм1.dwg', size: 3_150_000, mime: 'application/acad' },
      {
        id: aid(15),
        name: 'спецификация_было-стало.xlsx',
        size: 96_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { id: aid(16), name: 'протокол_совещания_08.09.pdf', size: 118_000, mime: 'application/pdf' },
      { id: aid(17), name: 'подпись_Савельев.sig', size: 4_000, mime: 'application/octet-stream' },
    ],
    resolutions: [],
  },
  [lid(2)]: {
    body: `Уважаемые руководители!

Министерством архитектуры и строительства в период с 15 по 25 число текущего месяца проводится плановая проверка деятельности проектных организаций, выполняющих работы по государственным контрактам.

Просим к началу проверки подготовить документы по прилагаемому перечню (приложение 1, всего 47 позиций), в том числе: действующие лицензии и аттестаты, реестры выполненных работ за два года, внутренние регламенты качества, штатное расписание и документы по охране труда.

Документы принимаются в электронном виде (PDF с подписью) либо на бумажном носителе в двух экземплярах. Ответственного за взаимодействие с комиссией просим назначить и сообщить его контакты не позднее 12 числа.

Приложение: перечень запрашиваемых документов (47 позиций, 6 листов).

Председатель комиссии
В.А. Гордон`,
    attachments: [
      { id: aid(18), name: 'уведомление_о_проверке.pdf', size: 96_000, mime: 'application/pdf' },
      {
        id: aid(19),
        name: 'перечень_документов_47_позиций.pdf',
        size: 412_000,
        mime: 'application/pdf',
      },
      {
        id: aid(20),
        name: 'форма_реестра_документов.xlsx',
        size: 44_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { id: aid(21), name: 'контакты_комиссии.vcf', size: 2_000, mime: 'text/vcard' },
    ],
    resolutions: [],
  },
  [lid(3)]: {
    body: `Направляем замечания по комплекту рабочей документации раздела КЖ главного корпуса (этап 0359, передан 05.09.2026, шифр 0359-КЖ-02):

1. Плиты перекрытия в осях 4–7/А–Д: армирование нижней зоны не соответствует расчетной схеме (см. расчет в SCAD, прилагается) — требуется усиление либо обоснование.
2. Узлы примыкания балок к колоннам КЖ-14, КЖ-18: уточнить анкеровку арматуры, в проекте не раскрыта длина заделки.
3. Маркировка закладных изделий на листах 9 и 11 расходится со спецификацией (позиции МН-12…МН-15).
4. Не представлена ведомость расхода стали по маркам — прилагаемый файл пуст.

Просим устранить замечания и представить скорректированный комплект в срок до 12.09.2026. О встрече по спорным позициям (п.1) готовы договориться на этой неделе.

Начальник отдела экспертизы АО «Галургия»
Р.Т. Малевич`,
    attachments: [
      { id: aid(22), name: 'замечания_КЖ_0359-02.pdf', size: 512_000, mime: 'application/pdf' },
      {
        id: aid(23),
        name: 'расчет_SCAD_плиты_4-7.spr',
        size: 8_400_000,
        mime: 'application/octet-stream',
      },
      { id: aid(24), name: 'узлы_КЖ-14_КЖ-18.dwg', size: 2_940_000, mime: 'application/acad' },
      {
        id: aid(25),
        name: 'расхождения_спецификации.xlsx',
        size: 66_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { id: aid(26), name: 'фото_площадки.zip', size: 18_700_000, mime: 'application/zip' },
    ],
    resolutions: [
      {
        id: '90000000-0000-4000-8000-000000000001',
        text: 'Александру: подготовить ответ заказчику по замечаниям, срок — до конца недели.',
        author: userRef(userIds.klimovich),
        taskId: tid(5),
        createdAt: isoAgo(2, 9, 0),
      },
    ],
  },
  [lid(4)]: {
    body: `Уважаемые коллеги!

Направляем коммерческое предложение на поставку вентиляционного оборудования для объекта «Главный корпус галургической фабрики» (этап 0359): установки приточные и вытяжные, шумоглушители, клапаны — всего 34 позиции.

Цены действительны в течение 30 календарных дней. Срок поставки — 6–8 недель со склада в Минске, по позициям 12–17 (приточные установки большой производительности) — 12 недель с завода. Условия оплаты и график поставок — в приложении.

Готовы приехать на объект для замеров и уточнения спецификации совместно с вашими специалистами — сообщите удобную дату.

Коммерческий директор ООО «ТехСнаб»
И.Л. Прудникова`,
    attachments: [
      { id: aid(27), name: 'КП_вентиляция_0359.pdf', size: 388_000, mime: 'application/pdf' },
      {
        id: aid(28),
        name: 'прайс_34_позиции.xlsx',
        size: 58_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { id: aid(29), name: 'условия_оплаты_и_график.pdf', size: 92_000, mime: 'application/pdf' },
      {
        id: aid(30),
        name: 'сертификаты_оборудования.zip',
        size: 6_200_000,
        mime: 'application/zip',
      },
    ],
    resolutions: [],
  },
  [lid(5)]: {
    body: `Уважаемые коллеги!

Сообщаем о готовности к передаче раздела АР (архитектурные решения) главного корпуса в составе, согласованном протоколом от 02.09.2026.

Комплект подготовлен в электронном виде (PDF + DWG, контрольные суммы — в реестре) и на бумажном носителе в трёх экземплярах. Просим организовать передачу по акту приёма-передачи на этой неделе; представитель для подписания — Александр Климович.

Приложения: реестр комплекта, акт приёма-передачи (форма), ведомость листов.

Директор ООО «ПассатПроект»
В.А. Шайдерова`,
    attachments: [
      { id: aid(31), name: 'реестр_комплекта_АР.pdf', size: 144_000, mime: 'application/pdf' },
      {
        id: aid(32),
        name: 'акт_приема-передачи_форма.docx',
        size: 36_000,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        id: aid(33),
        name: 'ведомость_листов_АР.xlsx',
        size: 52_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    resolutions: [],
  },
};

export function letterDetailOf(letter: LetterListItem): LetterDetail {
  const composed = composedExtras.get(letter.id);
  if (composed) return { ...letter, ...composed };
  const extra = letterBodies[letter.id] ?? { body: '', attachments: [], resolutions: [] };
  return { ...letter, ...extra };
}
