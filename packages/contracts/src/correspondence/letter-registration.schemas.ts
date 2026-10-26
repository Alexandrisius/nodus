import { z } from 'zod';

import { customFieldValuesInputSchema } from '../custom-fields/custom-field-values.js';

/**
 * Регистрация входящего письма (#55, ADR-0027): раздел окна перехода
 * `registration` кнопки «Зарегистрировать» (Р1). Файл НЕ импортирует
 * `workflows/*` и `tasks/*`: его подключает `transition-form.schemas.ts`
 * (тело перехода), иначе цикл `workflow.schemas → … → workflow.schemas`.
 * Одна грамматика веба (форма конвейера и окна), моков и сервера
 * (исключение «общая грамматика» patterns.md): обязательность — схема,
 * даты — `checkLetterDates`.
 */

/** Лимиты писем — контракт: подсказки форм и проверки сервера. */
export const LETTER_LIMITS = {
  /** № документа корреспондента. */
  theirNumber: 64,
  /** Тема письма. */
  subject: 500,
  /** Файлов при ручном создании (скан + приложения). */
  files: 20,
  /** Байт одного файла ручного создания (лимит вложений портала). */
  fileBytes: 100 * 1024 * 1024,
  /** Байт HTML/текстового тела, которое веб показывает в песочнице; больше —
   *  карточка скачивания (Р9). */
  bodyPreviewBytes: 2 * 1024 * 1024,
  /** Поиск по спискам писем. */
  search: 128,
  /** Адресатов «Принимают решения» в выдаче `/letters/resolvers`. */
  resolvers: 100,
  /** Изменений в одной записи истории (`letter_updated`). */
  changes: 20,
} as const;

/** Ввод регистрации (`form.registration` тела перехода, Р1): адресат
 *  обязателен (В1), подписант — контакт корреспондента или пусто. */
export const letterRegistrationInputSchema = z
  .object({
    counterpartyId: z.uuid(),
    signerId: z.uuid().nullable(),
    theirNumber: z.string().trim().min(1).max(LETTER_LIMITS.theirNumber),
    theirDate: z.iso.date(),
    subject: z.string().trim().min(1).max(LETTER_LIMITS.subject),
    receiptMethodId: z.uuid(),
    projectId: z.uuid().nullable(),
    addresseeId: z.uuid(),
    responseDeadline: z.iso.date().nullable(),
    customFields: customFieldValuesInputSchema.optional(),
  })
  .strict();
export type LetterRegistrationInput = z.infer<typeof letterRegistrationInputSchema>;

/** Поле формы регистрации (ключ подсветки и `details.field` ответа 422). */
export const letterRegistrationFieldSchema = z.enum([
  'counterpartyId',
  'signerId',
  'theirNumber',
  'theirDate',
  'subject',
  'receiptMethodId',
  'projectId',
  'addresseeId',
  'responseDeadline',
  'customFields',
]);
export type LetterRegistrationField = z.infer<typeof letterRegistrationFieldSchema>;

/** Причина отказа поля (`422 LETTER_REGISTRATION_INVALID`, `details {field,
 *  reason}`): пусто, неверный формат, дата в будущем/прошлом, ссылка не
 *  найдена/неактивна (уволенный адресат, архивный контрагент), подписант не
 *  из контактов корреспондента. */
export const letterRegistrationReasonSchema = z.enum([
  'required',
  'invalid',
  'in_future',
  'in_past',
  'not_found',
  'inactive',
  'not_of_counterparty',
]);
export type LetterRegistrationReason = z.infer<typeof letterRegistrationReasonSchema>;

export const letterRegistrationIssueSchema = z.object({
  field: letterRegistrationFieldSchema,
  reason: letterRegistrationReasonSchema,
});
export type LetterRegistrationIssue = z.infer<typeof letterRegistrationIssueSchema>;

/**
 * Даты регистрации против «сегодня» компании (ISO-дата `YYYY-MM-DD`, часовой
 * пояс компании — сервер, веб берёт локальную дату): дата документа
 * корреспондента — не позже сегодня, срок ответа — не раньше сегодня.
 * ISO-даты сравниваются строками. Пустые значения не проверяются —
 * обязательность решает схема.
 */
export function checkLetterDates(
  input: { theirDate?: string | null; responseDeadline?: string | null },
  today: string,
): LetterRegistrationIssue[] {
  const issues: LetterRegistrationIssue[] = [];
  if (input.theirDate && input.theirDate > today) {
    issues.push({ field: 'theirDate', reason: 'in_future' });
  }
  if (input.responseDeadline && input.responseDeadline < today) {
    issues.push({ field: 'responseDeadline', reason: 'in_past' });
  }
  return issues;
}
