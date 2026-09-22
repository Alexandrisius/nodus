import type { LetterAttachment, LetterListItem, Resolution } from '@nodus/contracts';
import {
  ErrorCode,
  createLetterBodySchema,
  issueResolutionBodySchema,
  registerLetterBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations } from '../../../../shared/mocks/data/chat.js';
import {
  counterpartyRefById,
  defaultDocumentKind,
  demoDocumentKinds,
  documentKindById,
  sharedMailbox,
} from '../../../../shared/mocks/data/counterparties.js';
import {
  createLetterConversation,
  demoLetters,
  letterDetailOf,
  letterExtrasOf,
  letterTaskIds,
  lid,
  registerComposedLetter,
} from '../../../../shared/mocks/data/letters.js';
import { demoProjects } from '../../../../shared/mocks/data/projects.js';
import {
  demoTasks,
  letterChainPrefix,
  makeInstructionTask,
  tid,
} from '../../../../shared/mocks/data/tasks.js';
import {
  currentAuthUser,
  demoUserListItems,
  userRef,
} from '../../../../shared/mocks/data/users.js';

/** Счётчики серий без щелей и дублей: демо-набор заканчивается Вх-2026/117
 *  и Исх-2026/41 — первая живая регистрация даёт «Вх-2026/118», первое
 *  исходящее-документ — «Исх-2026/42» (демо-сценарий приёмки #69). */
let registerSeq = 118;
let outgoingSeq = 42;
let instructionSeq = 50;
let resolutionSeq = 58;
let letterSeq = 20;

const today = () => new Date().toISOString().slice(0, 10);
const validationError = { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' };
const notFound = { code: ErrorCode.NOT_FOUND, message: 'Letter not found' };
const conflict = (message: string) => ({ code: ErrorCode.CONFLICT, message });

function projectRefById(id: string | null) {
  if (!id) return null;
  const project = demoProjects.find((p) => p.id === id);
  return project
    ? { id: project.id, code: project.code, name: project.name, color: project.color }
    : null;
}

function userById(id: string | null) {
  if (!id) return null;
  return demoUserListItems.find((u) => u.id === id) ?? null;
}

export const lettersHandlers = [
  /** Ящики портала: в концепте один общий (личные — фаза 2 продукта,
   *  переключатель «Общий / Личная» — задел направления). */
  http.get('/api/v1/mailboxes', () => HttpResponse.json([sharedMailbox])),

  /** Словарь «вид документа» (сид — бэкенд-issue #54): дефолт «Письмо»,
   *  секретарь словарь не трогает. */
  http.get('/api/v1/dictionaries/document-kinds', () => HttpResponse.json(demoDocumentKinds)),

  http.get('/api/v1/letters', ({ request }) => {
    const params = new URL(request.url).searchParams;
    // Без folder — все письма (связанные письма в карточке контрагента).
    const folder = params.get('folder');
    const counterpartyId = params.get('counterpartyId');
    let items = demoLetters;
    if (folder === 'incoming') items = items.filter((l) => l.type === 'incoming');
    else if (folder === 'outgoing') items = items.filter((l) => l.type === 'outgoing');
    // Журнал — реестр ТОЛЬКО документов (регистрация ≠ null), почта не попадает.
    else if (folder === 'registry') items = items.filter((l) => l.registration !== null);
    if (counterpartyId) items = items.filter((l) => l.counterparty.id === counterpartyId);
    return HttpResponse.json({ items, nextCursor: null });
  }),

  /** Создание исходящего (композер v2): переключатель «письмо / документ
   *  Исх-№» — документ регистрируется при отправке (asDocument). */
  http.post('/api/v1/letters', async ({ request }) => {
    const parsed = createLetterBodySchema.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(validationError, { status: 422 });
    const body = parsed.data;
    const counterparty = counterpartyRefById(body.counterpartyId);
    if (!counterparty) return HttpResponse.json(validationError, { status: 422 });

    letterSeq += 1;
    const letter: LetterListItem = {
      id: lid(letterSeq),
      type: 'outgoing',
      receiveChannel: body.receiveChannel,
      mailbox: sharedMailbox,
      counterparty,
      subject: body.subject,
      recipients: [],
      cc: [],
      date: new Date().toISOString(),
      registration: body.asDocument
        ? {
            regNumber: `Исх-2026/${outgoingSeq}`,
            regDate: today(),
            type: 'outgoing',
            documentKind: defaultDocumentKind,
            counterparty,
            project: projectRefById(body.projectId),
            addressee: userRef(currentAuthUser.id),
            deadline: null,
            correspondentNumber: null,
            correspondentDate: null,
          }
        : null,
      documentStatus: body.asDocument ? 'in_work' : null,
      inReplyToId: body.inReplyToId,
    };
    if (body.asDocument) outgoingSeq += 1;

    const attachments: LetterAttachment[] = body.attachments.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime: 'application/octet-stream',
    }));
    const conversationId = createLetterConversation(letter, [userRef(currentAuthUser.id)]);
    registerComposedLetter(
      letter.id,
      { body: body.body, attachments, resolutions: [] },
      conversationId,
    );
    demoLetters.unshift(letter);
    return HttpResponse.json(letterDetailOf(letter), { status: 201 });
  }),

  http.get('/api/v1/letters/:id', ({ params }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json(letterDetailOf(letter));
  }),

  /** Регистрация письма (карточка регистрации, модель v2): тип подставляется
   *  из папки и сменяем, рег.№ присваивает сервер (счётчик серии), письмо
   *  становится документом «в работе». Повторная регистрация — 409. */
  http.post('/api/v1/letters/:id/register', async ({ params, request }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter) return HttpResponse.json(notFound, { status: 404 });
    if (letter.registration)
      return HttpResponse.json(conflict('Letter already registered'), { status: 409 });
    const parsed = registerLetterBodySchema.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(validationError, { status: 422 });
    const body = parsed.data;
    const counterparty = counterpartyRefById(body.counterpartyId);
    const documentKind = documentKindById(body.documentKindId);
    if (!counterparty || !documentKind) return HttpResponse.json(validationError, { status: 422 });
    if (body.addresseeId && !userById(body.addresseeId))
      return HttpResponse.json(validationError, { status: 422 });

    const prefix = body.type === 'incoming' ? 'Вх' : 'Исх';
    const number = body.type === 'incoming' ? registerSeq : outgoingSeq;
    if (body.type === 'incoming') registerSeq += 1;
    else outgoingSeq += 1;

    letter.registration = {
      regNumber: `${prefix}-2026/${number}`,
      regDate: today(),
      type: body.type,
      documentKind,
      counterparty,
      project: projectRefById(body.projectId),
      addressee: body.addresseeId ? userRef(body.addresseeId) : null,
      deadline: body.deadline,
      correspondentNumber: body.correspondentNumber,
      correspondentDate: body.correspondentDate,
    };
    letter.documentStatus = 'in_work';
    // Корреспондент из справочника становится авторитетным (письмо могло
    // прийти со свободным адресом отправителя).
    letter.counterparty = counterparty;
    // Чип беседы чата письма обновляется (рег.№ появился).
    const conversation = demoConversations.find((c) => c.letter?.id === letter.id);
    if (conversation?.letter) conversation.letter.regNumber = letter.registration.regNumber;
    return HttpResponse.json(letterDetailOf(letter));
  }),

  /** Резолюция → 1..N поручений (поток А, модель v2): каждая строка
   *  поручения становится задачей (source 'letter') с цепочкой
   *  Письмо → Резолюция → Поручение → Задача. Только у документа. */
  http.post('/api/v1/letters/:id/resolutions', async ({ params, request }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter) return HttpResponse.json(notFound, { status: 404 });
    const registration = letter.registration;
    if (!registration)
      return HttpResponse.json(conflict('Letter is not registered'), { status: 409 });
    const parsed = issueResolutionBodySchema.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(validationError, { status: 422 });
    const body = parsed.data;

    const resolutionRef = `Р-${resolutionSeq}`;
    resolutionSeq += 1;
    const now = new Date().toISOString();
    const resolution: Resolution = {
      id: crypto.randomUUID(),
      text: body.text,
      author: userRef(currentAuthUser.id),
      createdAt: now,
      instructions: [],
    };

    for (const line of body.instructions) {
      const assignee = userById(line.assigneeId);
      if (!assignee) return HttpResponse.json(validationError, { status: 422 });
      instructionSeq += 1;
      const task = makeInstructionTask({
        id: tid(instructionSeq),
        number: 200 + instructionSeq,
        title: line.text,
        assigneeId: assignee.id,
        deadline: line.deadline,
        project: registration.project,
      });
      demoTasks.unshift(task);
      letterChainPrefix[task.id] = [
        { kind: 'letter', ref: registration.regNumber, label: letter.subject, entityId: letter.id },
        {
          kind: 'resolution',
          ref: resolutionRef,
          label: body.text.length > 60 ? `${body.text.slice(0, 57)}…` : body.text,
        },
        { kind: 'instruction', ref: `ПП-${instructionSeq}`, label: line.text },
      ];
      letterTaskIds[letter.id] = [...(letterTaskIds[letter.id] ?? []), task.id];
      resolution.instructions.push({
        id: crypto.randomUUID(),
        text: line.text,
        assignee: userRef(assignee.id),
        deadline: line.deadline,
        task: { id: task.id, number: task.number, title: task.title },
        taskStage: task.stage,
      });
    }

    letterExtrasOf(letter.id).resolutions.push(resolution);
    letter.documentStatus = 'in_work';
    return HttpResponse.json(resolution, { status: 201 });
  }),

  /** «В дело» — финал документа: только из «исполнено» (иначе 409). */
  http.post('/api/v1/letters/:id/archive', ({ params }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter) return HttpResponse.json(notFound, { status: 404 });
    if (letter.documentStatus !== 'executed')
      return HttpResponse.json(conflict('Document is not executed'), { status: 409 });
    letter.documentStatus = 'archived';
    return HttpResponse.json(letterDetailOf(letter));
  }),
];
