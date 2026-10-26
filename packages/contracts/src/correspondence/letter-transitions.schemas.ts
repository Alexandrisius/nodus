import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { workflowTransitionSchema } from '../workflows/workflow.schemas.js';
import { letterDetailSchema } from './letter.schemas.js';
import { LETTER_LIMITS } from './letter-registration.schemas.js';

/**
 * Переходы письма (#55, Р1): кнопки маршрута — общая схема движка
 * (`WorkflowTransition`), тело — `ExecuteTransitionBody` с
 * `form.registration`. Ответ — письмо и НОВЫЕ кнопки одним ходом (как у
 * задач): после регистрации карточка и конвейер не делают повторный GET.
 */
export const executeLetterTransitionResultSchema = z.object({
  letter: letterDetailSchema,
  transitions: z.array(workflowTransitionSchema),
});
export type ExecuteLetterTransitionResult = z.infer<typeof executeLetterTransitionResultSchema>;

/** `GET /letters/resolvers` — держатели `correspondence.resolve` по
 *  алфавиту: группа «Принимают решения» в выборе адресата (Р13). */
export const letterResolversSchema = z.array(userRefSchema).max(LETTER_LIMITS.resolvers);
export type LetterResolvers = z.infer<typeof letterResolversSchema>;
