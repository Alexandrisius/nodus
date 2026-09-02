import { ErrorCode } from '../errors/error-codes.js';

/**
 * Русские UI-строки для системных кодов ошибок (I15: `message` в ответе —
 * английский технический, пользователю показываем строку по `code`).
 * Доменные коды модулей добавляются сюда же по мере появления модулей.
 */
export const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_FAILED]: 'Проверьте правильность заполнения полей',
  [ErrorCode.UNAUTHENTICATED]: 'Требуется вход в систему',
  [ErrorCode.FORBIDDEN]: 'Недостаточно прав для этого действия',
  [ErrorCode.NOT_FOUND]: 'Объект не найден или у вас нет к нему доступа',
  [ErrorCode.CONFLICT]: 'Действие конфликтует с текущим состоянием объекта',
  [ErrorCode.RATE_LIMITED]: 'Слишком много запросов, повторите чуть позже',
  [ErrorCode.INTERNAL_ERROR]: 'Внутренняя ошибка, мы уже разбираемся',
};
