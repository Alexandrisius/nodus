import type { QueryClient } from '@tanstack/react-query';
import type { LetterBox, LetterDetail, LetterListItem } from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';

import { ApiError } from '../../../shared/api-client.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { mapLetterInPages, type LettersPages } from '../../../shared/api/letters-list.js';

/** Кэш писем (#55): строка из карточки, правка/удаление во всех списках,
 *  разбор ошибок регистрации по `ErrorCode` (не по тексту). */

export function listItemOf(letter: LetterDetail): LetterListItem {
  return {
    id: letter.id,
    typeId: letter.typeId,
    direction: letter.direction,
    stage: letter.stage,
    regNumber: letter.regNumber,
    regDate: letter.regDate,
    registeredAt: letter.registeredAt,
    receivedAt: letter.receivedAt,
    source: letter.source,
    subject: letter.subject,
    counterparty: letter.counterparty,
    theirNumber: letter.theirNumber,
    theirDate: letter.theirDate,
    receiptMethod: letter.receiptMethod,
    project: letter.project,
    addressee: letter.addressee,
    responseDeadline: letter.responseDeadline,
    attachmentCount: letter.attachmentCount,
  };
}

/** Вкладка, которой принадлежит письмо (null — ни одной: закрыто без регистрации). */
export function boxOfLetter(
  letter: Pick<LetterListItem, 'registeredAt' | 'direction' | 'stage'>,
): LetterBox | null {
  if (letter.registeredAt !== null) return letter.direction;
  return letter.stage.systemState === 'backlog' ? 'new' : null;
}

/** Снимок всех списков писем (откат оптимистичной мутации). */
export function snapshotLists(queryClient: QueryClient) {
  return queryClient.getQueriesData<LettersPages>({ queryKey: lettersKeys.lists() });
}

export function restoreLists(
  queryClient: QueryClient,
  snapshot: ReturnType<typeof snapshotLists> | undefined,
) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
}

/** Письмо во всех списках: строка обновляется, а где вкладка больше не
 *  совпадает (зарегистрировали из «Новых») — уходит из списка. */
export function syncLetterInLists(
  queryClient: QueryClient,
  id: string,
  next: LetterListItem | null,
) {
  for (const [key] of snapshotLists(queryClient)) {
    const box = key[2] as LetterBox | 'registered';
    queryClient.setQueryData<LettersPages>(key, (data) =>
      mapLetterInPages(data, id, () => {
        if (!next) return null;
        const own = boxOfLetter(next);
        const fits = box === 'registered' ? next.registeredAt !== null : own === box;
        return fits ? next : null;
      }),
    );
  }
}

/** Ответ сервера с письмом — в карточку и списки одним ходом. */
export function applyLetter(queryClient: QueryClient, letter: LetterDetail) {
  queryClient.setQueryData(lettersKeys.detail(letter.id), letter);
  syncLetterInLists(queryClient, letter.id, listItemOf(letter));
}

/** 422 регистрации → поле и причина (подсветка у поля). */
export function registrationIssueOf(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== ErrorCode.LETTER_REGISTRATION_INVALID) {
    return null;
  }
  const field = error.details?.field;
  const reason = error.details?.reason;
  return typeof field === 'string' && typeof reason === 'string'
    ? ({ field, reason } as { field: string; reason: string })
    : null;
}

/** 409 повторной регистрации (Р3) — номер, который уже выдан. */
export function alreadyRegisteredNumber(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== ErrorCode.LETTER_ALREADY_REGISTERED) {
    return null;
  }
  const number = error.details?.regNumber;
  return typeof number === 'string' ? number : '';
}

/** Текст ошибки мутации письма по коду. */
export function letterErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  return (code ? errorMessages[code as ErrorCode] : undefined) ?? ui.common.sendError;
}
