import { z } from 'zod';

/**
 * Виды сообщений и блоки ленты (#380): `text` — обычное; `task_transition` —
 * блок перехода задачи (причина/итог окна). Реестр блоков — закрытый union
 * по виду; #313 добавит `system` без переделки. Вынесено из chat.schemas.ts
 * (I5: файл агрегата перерос 300 строк).
 */

export const chatMessageKindSchema = z.enum(['text', 'task_transition']);
export type ChatMessageKind = z.infer<typeof chatMessageKindSchema>;

/** Блок перехода задачи в ленте (#380): данные из payload события
 *  `task.stage_changed`; текст сообщения — причина (поиск/цитаты/превью
 *  уведомлений работают по `text`). */
export const taskTransitionBlockSchema = z.object({
  kind: z.literal('task_transition'),
  taskId: z.uuid(),
  recordId: z.uuid(),
  transitionName: z.string().min(1).max(32),
  fromStageName: z.string().min(1).max(40),
  toStageName: z.string().min(1).max(40),
  commentLabel: z.string().max(60).nullable(),
  result: z
    .object({
      fileCount: z.number().int().min(0),
      messageCount: z.number().int().min(0),
    })
    .nullable(),
});
export type TaskTransitionBlock = z.infer<typeof taskTransitionBlockSchema>;

/** Реестр блоков — закрытый union по виду (#313: + system). */
export const chatMessageBlockSchema = z.discriminatedUnion('kind', [taskTransitionBlockSchema]);
export type ChatMessageBlock = z.infer<typeof chatMessageBlockSchema>;

/** Поиск сообщений по id (окно перехода: файлы/сообщения итога бывают вне
 *  загруженной ленты): `ids=uuid,uuid` — 1..50 уникальных. */
export const lookupMessagesQuerySchema = z.object({
  ids: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform((raw) => raw.split(','))
    .pipe(
      z
        .array(z.uuid())
        .min(1)
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate ids' }),
    ),
});
export type LookupMessagesQuery = z.infer<typeof lookupMessagesQuerySchema>;
