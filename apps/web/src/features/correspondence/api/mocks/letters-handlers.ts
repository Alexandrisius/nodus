import type { LetterAttachment, LetterListItem, Resolution, TaskListItem } from '@nodus/contracts';
import { ErrorCode, createLetterBodySchema } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  demoLetters,
  letterDetailOf,
  lid,
  registerComposedLetter,
} from '../../../../shared/mocks/data/letters.js';
import { isoIn } from '../../../../shared/mocks/data/dates.js';
import {
  demoTasks,
  personalAnalyzed,
  stageOnControl,
  tid,
} from '../../../../shared/mocks/data/tasks.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

let instructionSeq = 50;
let registerSeq = 130;
let outgoingSeq = 90;
let letterSeq = 20;

export const lettersHandlers = [
  http.get('/api/v1/letters', ({ request }) => {
    const folder = new URL(request.url).searchParams.get('folder') ?? 'incoming';
    const items = demoLetters.filter((l) =>
      folder === 'unregistered'
        ? l.status === 'unregistered'
        : l.type === folder && l.status !== 'unregistered',
    );
    return HttpResponse.json({ items, nextCursor: null });
  }),

  /** Создание исходящего письма (почтовый клиент, createLetterBodySchema):
   *  регистрируется сразу (Исх-2026/NN), статус «Исполнено» — отправлено. */
  http.post('/api/v1/letters', async ({ request }) => {
    const parsed = createLetterBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    letterSeq += 1;
    const letter: LetterListItem = {
      id: lid(letterSeq),
      type: 'outgoing',
      regNumber: `Исх-2026/${outgoingSeq}`,
      regDate: new Date().toISOString().slice(0, 10),
      correspondent: parsed.data.correspondent,
      subject: parsed.data.subject,
      status: 'done',
      addressee: userRef(currentAuthUser.id),
      project: null,
      deadline: null,
      receivedAt: new Date().toISOString(),
    };
    outgoingSeq += 1;
    const attachments: LetterAttachment[] = parsed.data.attachments.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime: `application/octet-stream`,
    }));
    registerComposedLetter(letter.id, { body: parsed.data.body, attachments });
    demoLetters.unshift(letter);
    return HttpResponse.json(letterDetailOf(letter), { status: 201 });
  }),

  http.get('/api/v1/letters/:id', ({ params }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Letter not found' }, { status: 404 });
    return HttpResponse.json(letterDetailOf(letter));
  }),

  /** Резолюция → поручение (поток А): создаёт задачу с source=letter. */
  http.post('/api/v1/letters/:id/resolutions', async ({ params, request }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Letter not found' }, { status: 404 });
    const { text } = (await request.json()) as { text: string };

    const task: TaskListItem = {
      id: tid(instructionSeq),
      number: 200 + instructionSeq,
      title: `Поручение: ${letter.subject}`,
      stage: stageOnControl,
      personalStageId: personalAnalyzed.id,
      priority: 'high',
      deadline: isoIn(7),
      creator: userRef(currentAuthUser.id),
      assignee: userRef(currentAuthUser.id),
      participants: [],
      project: letter.project,
      parentId: null,
      spentMinutes: 0,
      commentsCount: 0,
      checklistDone: 0,
      checklistTotal: 0,
      source: 'letter',
      updatedAt: new Date().toISOString(),
    };
    demoTasks.unshift(task);
    instructionSeq += 1;

    const resolution: Resolution = {
      id: crypto.randomUUID(),
      text,
      author: userRef(currentAuthUser.id),
      taskId: task.id,
      createdAt: new Date().toISOString(),
    };
    letterDetailOf(letter).resolutions.push(resolution);
    const stored = demoLetters.find((l) => l.id === letter.id) as LetterListItem;
    stored.status = 'in_work';
    return HttpResponse.json(resolution, { status: 201 });
  }),

  /** Регистрация письма из очереди «Незарегистрированные». */
  http.post('/api/v1/letters/:id/register', ({ params }) => {
    const letter = demoLetters.find((l) => l.id === params.id);
    if (!letter)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Letter not found' }, { status: 404 });
    letter.status = 'in_work';
    letter.regNumber = `Вх-2026/${registerSeq}`;
    registerSeq += 1;
    letter.regDate = new Date().toISOString().slice(0, 10);
    return HttpResponse.json(letter);
  }),
];
