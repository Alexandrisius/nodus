import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * Выборки строк письма (#55): список — поля реестра, деталь — плюс
 * регистрационные данные и атрибуты. Типы строк выводятся из выборок, чтобы
 * маппер не дублировал поля (как `task-row.ts`).
 */
export const letterListSelect = {
  id: true,
  typeId: true,
  direction: true,
  stageId: true,
  systemState: true,
  regNumber: true,
  regDate: true,
  registeredAt: true,
  receivedAt: true,
  source: true,
  subject: true,
  counterpartyId: true,
  theirNumber: true,
  theirDate: true,
  receiptMethodId: true,
  projectId: true,
  addresseeId: true,
  responseDeadline: true,
  // Конверт почты (#56): строка очереди «Новые» — отправитель и бейдж связи.
  mailFromAddress: true,
  mailFromName: true,
} as const;

export const letterDetailSelect = {
  ...letterListSelect,
  workflowId: true,
  signerId: true,
  registrarId: true,
  createdBy: true,
  customFields: true,
  // Полный конверт и флаги приёма (#56) — карточка письма.
  mailMessageId: true,
  mailInReplyTo: true,
  mailReferences: true,
  mailParseIssue: true,
  mailStorageIncomplete: true,
  // Надгробие спама (Р13): невидимо ни в списках, ни в карточке — фильтр.
  deletedAt: true,
} as const;

export type LetterListRow = Prisma.LetterGetPayload<{ select: typeof letterListSelect }>;
export type LetterDetailRow = Prisma.LetterGetPayload<{ select: typeof letterDetailSelect }>;

export const letterAttachmentSelect = {
  id: true,
  fileId: true,
  role: true,
  sortOrder: true,
  contentId: true,
  inline: true,
} as const;

export type LetterAttachmentRow = Prisma.LetterAttachmentGetPayload<{
  select: typeof letterAttachmentSelect;
}>;

/** Курсор реестра: момент оси и id (tiebreak одного момента). */
export interface LetterCursor {
  at: string;
  id: string;
}
