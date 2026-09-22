import { z } from 'zod';

import { counterpartyRefSchema } from '../counterparties/counterparty.schemas.js';
import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';
import { projectRefSchema, taskRefSchema, taskStageSchema } from '../tasks/task.schemas.js';

/**
 * Контракты модуля корреспонденции (correspondence.Letter), модель v2
 * (вердикты владельца 22.09.2026):
 * - письмо и документ — РАЗНЫЕ вещи: почтовый клиент — базовый слой,
 *   регистрация — действие поверх; не вся почта становится документом;
 * - у письма статуса нет; статус появляется у ДОКУМЕНТА (registration ≠ null):
 *   в работе → исполнено → в дело; «просрочено» — производное (срок < сегодня),
 *   не значение статуса;
 * - резолюция порождает 1..N поручений; поручение = задача (source 'letter'),
 *   отдельной сущности нет;
 * - канал поступления (почта / СМДО / бумага) — у каждого письма с первого дня
 *   (коннектора СМДО нет, канал в модели есть).
 */

/** Направление: входящее / исходящее. */
export const letterTypeSchema = z.enum(['incoming', 'outgoing']);
export type LetterType = z.infer<typeof letterTypeSchema>;

/** Канал поступления (входящие) или отправки (исходящие). */
export const receiveChannelSchema = z.enum(['email', 'smdo', 'paper']);
export type ReceiveChannel = z.infer<typeof receiveChannelSchema>;

/** Почтовый ящик портала: общий ящик компании сейчас, личные — фаза 2 продукта
 *  (переключатель «Общий / Личная» в списке — задел направления). */
export const mailboxSchema = z.object({
  id: z.uuid(),
  address: z.string().min(1),
  kind: z.enum(['shared', 'personal']),
});
export type Mailbox = z.infer<typeof mailboxSchema>;

/** Статус ДОКУМЕНТА (зарегистрированного письма). «Просрочено» — производное:
 *  in_work + registration.deadline < сегодня (журнал-фильтр, чип в списках). */
export const documentStatusSchema = z.enum(['in_work', 'executed', 'archived']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Вид документа — справочник (dictionaries, сид #54); дефолт «Письмо»,
 *  секретарь его не меняет. */
export const documentKindSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const letterAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
});

export type LetterAttachment = z.infer<typeof letterAttachmentSchema>;

/** Регистрационная карточка (РКК): результат действия «Зарегистрировать».
 *  Рег.№ «Вх-2026/NNN» / «Исх-2026/NNN» — счётчик серии без щелей и дублей. */
export const letterRegistrationSchema = z.object({
  regNumber: z.string().min(1),
  regDate: z.iso.date(),
  /** Тип подставляется из папки, в карточке регистрации сменить можно. */
  type: letterTypeSchema,
  documentKind: documentKindSchema,
  counterparty: counterpartyRefSchema,
  project: projectRefSchema.nullable(),
  /** Адресат-сотрудник (дефолт — ГИП проекта); письмо «у адресата». */
  addressee: userRefSchema.nullable(),
  deadline: z.iso.date().nullable(),
  /** Номер и дата документа корреспондента (реквизиты входящего по инструкции). */
  correspondentNumber: z.string().nullable(),
  correspondentDate: z.iso.date().nullable(),
});

export type LetterRegistration = z.infer<typeof letterRegistrationSchema>;

/** Строка поручения резолюции: поручение = задача (отдельной сущности нет),
 *  task — связь с созданной задачей (source 'letter', цепочка в карточке);
 *  taskStage — денормализованный снапшот стадии (образец: userRef/projectRef),
 *  блок резолюций показывает статус поручения живьём. */
export const resolutionInstructionSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1),
  assignee: userRefSchema,
  deadline: z.iso.date().nullable(),
  task: taskRefSchema.nullable(),
  taskStage: taskStageSchema.nullable(),
});

export type ResolutionInstruction = z.infer<typeof resolutionInstructionSchema>;

/** Резолюция руководителя: текст + 0..N поручений (без поручения допустима —
 *  «для сведения»). */
export const resolutionSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1),
  author: userRefSchema,
  createdAt: z.iso.datetime(),
  instructions: z.array(resolutionInstructionSchema),
});

export type Resolution = z.infer<typeof resolutionSchema>;

/** Короткая ссылка на письмо (образец: taskRef) — беседы чата писем,
 *  превью portal://-ссылок. */
export const letterRefSchema = z.object({
  id: z.uuid(),
  regNumber: z.string().nullable(),
  subject: z.string().min(1),
});

export type LetterRef = z.infer<typeof letterRefSchema>;

export const letterListItemSchema = z.object({
  id: z.uuid(),
  type: letterTypeSchema,
  receiveChannel: receiveChannelSchema,
  mailbox: mailboxSchema,
  /** Корреспондент: отправитель (входящее) или получатель (исходящее) —
   *  ссылка на справочник контрагентов, не строка (I15). */
  counterparty: counterpartyRefSchema,
  subject: z.string().min(1),
  /** Внутренние получатели «Кому» / «Копия» — ТОЛЬКО сотрудники компании;
   *  внешние адресаты исходящего — counterparty. Участники чата письма. */
  recipients: z.array(userRefSchema),
  cc: z.array(userRefSchema),
  /** Получено (входящее) / отправлено (исходящее). */
  date: z.iso.datetime(),
  /** null — письмо (не документ): незарегистрированное входящее или
   *  исходящее «просто письмо». */
  registration: letterRegistrationSchema.nullable(),
  /** Статус документа; у письма (registration = null) — null. */
  documentStatus: documentStatusSchema.nullable(),
  /** Связь «ответ на» (пересылка запрещена концептуально — только ответы
   *  и portal://-ссылки). */
  inReplyToId: z.uuid().nullable(),
});

export type LetterListItem = z.infer<typeof letterListItemSchema>;

export const letterDetailSchema = letterListItemSchema.extend({
  body: z.string(),
  attachments: z.array(letterAttachmentSchema),
  resolutions: z.array(resolutionSchema),
  /** Чат письма — беседа type 'letter' (единый механизм обсуждений);
   *  участники — только внутренние сотрудники. */
  conversationId: z.uuid(),
});

export type LetterDetail = z.infer<typeof letterDetailSchema>;

/** Папки списка: входящие / отправленные / журнал. «Незарегистрированные» —
 *  НЕ папка (вердикт владельца): это входящие с пустым рег.№, секретарю —
 *  пресет-фильтр «К регистрации». Журнал — реестр ТОЛЬКО документов (Вх/Исх).
 *  Без folder — все письма (связанные письма в карточке контрагента). */
export const listLettersQuerySchema = cursorQuerySchema.extend({
  folder: z.enum(['incoming', 'outgoing', 'registry']).optional(),
  /** Письма контрагента (карточка контрагента — связанные письма). */
  counterpartyId: z.uuid().optional(),
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListLettersQuery = z.infer<typeof listLettersQuerySchema>;

/** Тело регистрации (POST /letters/:id/register): рег.№ присваивает сервер
 *  (счётчик серии). Повторная регистрация — 409 LETTER_ALREADY_REGISTERED. */
export const registerLetterBodySchema = z.object({
  type: letterTypeSchema,
  counterpartyId: z.uuid(),
  projectId: z.uuid().nullable(),
  addresseeId: z.uuid().nullable(),
  deadline: z.iso.date().nullable(),
  correspondentNumber: z.string().trim().max(64).nullable(),
  correspondentDate: z.iso.date().nullable(),
  documentKindId: z.uuid(),
});

export type RegisterLetterBody = z.infer<typeof registerLetterBodySchema>;

/** Тело резолюции (POST /letters/:id/resolutions): поручения становятся
 *  задачами (source 'letter'), письмо остаётся «в работе» до исполнения всех. */
export const issueResolutionBodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  instructions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(1000),
        assigneeId: z.uuid(),
        deadline: z.iso.date().nullable(),
      }),
    )
    .max(20)
    .default([]),
});

export type IssueResolutionBody = z.infer<typeof issueResolutionBodySchema>;

/** Создание исходящего (композер): переключатель «письмо / документ Исх-№» —
 *  asDocument; документ регистрируется при отправке (номер присваивает сервер).
 *  Файлы прикрепляются вперёд текста (сценарий «скан → отправка»). */
export const createLetterBodySchema = z.object({
  mailboxId: z.uuid(),
  counterpartyId: z.uuid(),
  projectId: z.uuid().nullable(),
  receiveChannel: receiveChannelSchema.exclude(['smdo']).default('email'),
  asDocument: z.boolean().default(false),
  subject: z.string().trim().min(1).max(512),
  /** Текст сопроводительного — опционален (письмо может быть «только скан»). */
  body: z.string().max(20000).default(''),
  /** Выбранные файлы (имя+размер): загрузка файлов — с бэкендом хранилища. */
  attachments: z
    .array(z.object({ name: z.string().min(1).max(256), size: z.number().int().min(0) }))
    .max(20)
    .default([]),
  inReplyToId: z.uuid().nullable(),
});

export type CreateLetterBody = z.infer<typeof createLetterBodySchema>;
