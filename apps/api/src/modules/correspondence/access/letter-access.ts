import type { LetterAccess } from '@nodus/contracts';
import { Permission } from '@nodus/contracts';

/**
 * Видимость писем (#55, Р7) — одна чистая функция для карточки, списков,
 * моста чата и контрибьютора файлов (#461 добавит одно условие —
 * конфиденциальность). Невидимое письмо отвечает 404 без оракула.
 *
 * Правило: зарегистрированное видят все вошедшие; незарегистрированное —
 * только держатели `correspondence.register` («Новые» — рабочее место
 * канцелярии). Незарегистрированное письмо не имеет номера, поэтому его
 * утечка — утечка входящего документа до учёта.
 */

/** Держатель права регистрации (канцелярия/администратор). */
export function canRegisterLetters(user: { permissions: readonly string[] }): boolean {
  return user.permissions.includes(Permission.CORRESPONDENCE_REGISTER);
}

/** Строка письма в объёме видимости. */
export interface LetterVisibilityRow {
  registeredAt: Date | null;
}

/** Видно ли письмо этому сотруднику. */
export function canViewLetter(
  user: { permissions: readonly string[] },
  row: LetterVisibilityRow,
): boolean {
  return row.registeredAt !== null || canRegisterLetters(user);
}

/**
 * Права карточки (сервер — истина, I8): правка реквизитов и удаление спама —
 * канцелярия (правка незарегистрированного — заполнение полей по месту в
 * карточке, редизайн #56); «Присоединиться» — не участник: канцелярия может
 * «начать обсуждение» и до регистрации, остальные — только зарегистрированное.
 */
export function letterAccessOf(
  user: { id: string; permissions: readonly string[] },
  row: {
    registeredAt: Date | null;
    systemState: string;
    addresseeId: string | null;
  },
  isParticipant: boolean,
): LetterAccess {
  const registrar = canRegisterLetters(user);
  const registered = row.registeredAt !== null;
  // Адресат — участник по построению (владелец беседы письма, Р10).
  const participant = isParticipant || row.addresseeId === user.id;
  return {
    canEdit: registrar,
    canDeleteSpam: !registered && row.systemState !== 'closed' && registrar,
    canJoin: !participant && (registered || registrar),
    isParticipant: participant,
  };
}
