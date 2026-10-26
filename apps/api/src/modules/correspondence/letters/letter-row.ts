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
} as const;

export const letterDetailSelect = {
  ...letterListSelect,
  workflowId: true,
  signerId: true,
  registrarId: true,
  createdBy: true,
  customFields: true,
} as const;

export type LetterListRow = Prisma.LetterGetPayload<{ select: typeof letterListSelect }>;
export type LetterDetailRow = Prisma.LetterGetPayload<{ select: typeof letterDetailSelect }>;

export const letterAttachmentSelect = {
  id: true,
  fileId: true,
  role: true,
  sortOrder: true,
} as const;

export type LetterAttachmentRow = Prisma.LetterAttachmentGetPayload<{
  select: typeof letterAttachmentSelect;
}>;

/** Курсор реестра: момент оси и id (tiebreak одного момента). */
export interface LetterCursor {
  at: string;
  id: string;
}
