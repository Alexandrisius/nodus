/**
 * Коды ошибок API (канон — `docs/architecture/api-conventions.md`).
 *
 * Системные коды обязательны к единому использованию всеми механизмами
 * (фильтр ошибок, пайпы, гварды, rate-limit). Доменные коды добавляются
 * модулями по маске `MODULE_REASON` (`TASK_INVALID_STAGE_TRANSITION`).
 * Каталог только расширяется: переименование кода ломает клиентов (i18n по
 * коду, I15). До пилота переименования допустимы решением владельца —
 * `TASK_TYPE_*` → `PROCESS_TYPE_*` в #428 (ADR-0024).
 */
export const ErrorCode = {
  /** zod/валидация входа; details.issues — список нарушений. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Нет или просрочена аутентификация. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Нет права (RBAC). */
  FORBIDDEN: 'FORBIDDEN',
  /** Сущность не найдена / нет доступа. */
  NOT_FOUND: 'NOT_FOUND',
  /** Конфликт состояния (в т.ч. идемпотентность с иным payload). */
  CONFLICT: 'CONFLICT',
  /** Превышен лимит запросов. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Непредвиденное (без деталей наружу). */
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Доменные коды модулей (маска MODULE_REASON):
  /** Неверный email или пароль (без уточнения — защита от перебора учёток). */
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** Сессия отозвана, просрочена или refresh-токен скомпрометирован (reuse). */
  AUTH_SESSION_INVALID: 'AUTH_SESSION_INVALID',
  /** Пользователь с таким email уже существует. */
  DIRECTORY_EMAIL_TAKEN: 'DIRECTORY_EMAIL_TAKEN',
  /** Удаление единственной личной стадии «Моего плана» запрещено (ADR-0008). */
  TASK_LAST_STAGE: 'TASK_LAST_STAGE',
  /** Перехода в целевую стадию нет в маршруте или условия «кто» не пройдены (ADR-0020). */
  TASK_TRANSITION_NOT_ALLOWED: 'TASK_TRANSITION_NOT_ALLOWED',
  /** Гейт DoR/DoD не пройден; details.reasons — TransitionBlockReason[] (ADR-0020). */
  TASK_TRANSITION_BLOCKED: 'TASK_TRANSITION_BLOCKED',
  /** Введённое в окне перехода не совпало с настройкой кнопки: лишний или
   *  пропущенный обязательный раздел; details — { transitionId, missing[], unexpected[] } (#380). */
  TASK_TRANSITION_FORM_INVALID: 'TASK_TRANSITION_FORM_INVALID',
  /** Обход гейта без причины или без права task.override_gate. */
  TASK_OVERRIDE_REASON_REQUIRED: 'TASK_OVERRIDE_REASON_REQUIRED',
  /** Родитель задачи образует цикл (задача — предок самой себя). */
  TASK_PARENT_CYCLE: 'TASK_PARENT_CYCLE',
  /** Остановка таймера, который не идёт (старт нового сам останавливает старый). */
  TASK_TIMER_NOT_RUNNING: 'TASK_TIMER_NOT_RUNNING',
  /** Публикация маршрута: версия ушла вперёд (409; ADR-0021, #378). */
  WORKFLOW_VERSION_CONFLICT: 'WORKFLOW_VERSION_CONFLICT',
  /** Документ маршрута не проходит проверки; details.problems — WorkflowProblem[] (#378). */
  WORKFLOW_INVALID: 'WORKFLOW_INVALID',
  /** У архивируемых стадий есть задачи, а перенос не задан; details.stages — [{ stageId, count }] (#378). */
  WORKFLOW_MIGRATION_REQUIRED: 'WORKFLOW_MIGRATION_REQUIRED',
  /** Системный тип процесса нельзя архивировать (#378, #428). */
  PROCESS_TYPE_SYSTEM_LOCKED: 'PROCESS_TYPE_SYSTEM_LOCKED',
  /** Название типа процесса уже занято живым типом (#378, #428). */
  PROCESS_TYPE_NAME_TAKEN: 'PROCESS_TYPE_NAME_TAKEN',
  /** Вложение чата больше лимита (100 МБ на файл; серверная сверка, #57). */
  CHAT_ATTACHMENT_TOO_LARGE: 'CHAT_ATTACHMENT_TOO_LARGE',
  /** Больше 20 загруженных-но-неотправленных вложений у пользователя (#57). */
  CHAT_ATTACHMENT_TOO_MANY: 'CHAT_ATTACHMENT_TOO_MANY',
  /** Файл стикера не прошёл проверку: формат (magic bytes) или лимит (#143). */
  CHAT_STICKER_INVALID: 'CHAT_STICKER_INVALID',
  /** Аватар не прошёл проверку: не изображение PNG/JPEG/WebP или больше
   *  лимита (квадратизация — серверная, sharp, #186). */
  FILE_AVATAR_INVALID: 'FILE_AVATAR_INVALID',
  /** Суточный лимит «важных сообщений» отправителя исчерпан (#100). */
  CHAT_URGENT_LIMIT_EXCEEDED: 'CHAT_URGENT_LIMIT_EXCEEDED',
  /** «Важное сообщение» в беседе больше 20 участников запрещено (#100, I8). */
  CHAT_URGENT_GROUP_TOO_LARGE: 'CHAT_URGENT_GROUP_TOO_LARGE',
  /** Лимит участников беседы (200) достигнут — добавление отклонено (#186). */
  CHAT_MEMBERS_LIMIT_REACHED: 'CHAT_MEMBERS_LIMIT_REACHED',
  /** Фактический размер файла не совпал с заявленным (обрыв/подмена, #57). */
  FILE_SIZE_MISMATCH: 'FILE_SIZE_MISMATCH',
  /** Файл помещён в карантин (сканер пометил) и не отдаётся (ADR-0013). */
  FILE_QUARANTINED: 'FILE_QUARANTINED',
  /** Движок офисного просмотра выключен (ONLYOFFICE не поднят, #138). */
  FILE_OFFICE_DISABLED: 'FILE_OFFICE_DISABLED',
  /** Формат не открывается в ONLYOFFICE (реестр office-formats, #138). */
  FILE_OFFICE_UNSUPPORTED: 'FILE_OFFICE_UNSUPPORTED',
  /** Файл больше потолка открытия в редакторе (#138; открывается скачиванием). */
  FILE_OFFICE_TOO_LARGE: 'FILE_OFFICE_TOO_LARGE',
  /** Контрагент с таким УНП уже есть в справочнике (в т.ч. в архиве);
   *  details — { counterpartyId, shortName, archived } (#460). */
  CRM_UNP_TAKEN: 'CRM_UNP_TAKEN',
  /** Контрагент в архиве: сначала верните его из архива (#460). */
  CRM_COUNTERPARTY_ARCHIVED: 'CRM_COUNTERPARTY_ARCHIVED',
  /** Удалить нельзя: на контрагента ссылаются письма или проекты —
   *  перенесите в архив, история должна сохраниться (#460). */
  CRM_COUNTERPARTY_IN_USE: 'CRM_COUNTERPARTY_IN_USE',
  /** Значение кастомного поля не прошло проверку (#431, ADR-0029):
   *  details.issues[] — { fieldId, reason: unknown|archived|invalid|not_found|inactive, message }. */
  CUSTOM_FIELD_VALUE_INVALID: 'CUSTOM_FIELD_VALUE_INVALID',
  /** Тип поля недоступен: «Проект» до модуля проектов (#431, Р11). */
  CUSTOM_FIELD_TYPE_UNAVAILABLE: 'CUSTOM_FIELD_TYPE_UNAVAILABLE',
  /** Имя занято активным полем области; details — { definitionId, archived } (#431). */
  CUSTOM_FIELD_NAME_TAKEN: 'CUSTOM_FIELD_NAME_TAKEN',
  /** Смена типа несовместима с хранимыми значениями; details — { from, to } (#431, Р3). */
  CUSTOM_FIELD_TYPE_CHANGE_INCOMPATIBLE: 'CUSTOM_FIELD_TYPE_CHANGE_INCOMPATIBLE',
  /** Больше 100 активных полей в области (#431). */
  CUSTOM_FIELD_LIMIT_REACHED: 'CUSTOM_FIELD_LIMIT_REACHED',
  /** Поле в архиве — только чтение; сначала верните из архива (#431). */
  CUSTOM_FIELD_ARCHIVED: 'CUSTOM_FIELD_ARCHIVED',
  /** Системный справочник защищён от архивации и переименования (#431, Р10). */
  DICTIONARY_SYSTEM_LOCKED: 'DICTIONARY_SYSTEM_LOCKED',
  /** Вариант с таким названием уже есть среди активных (#431). */
  DICTIONARY_ITEM_NAME_TAKEN: 'DICTIONARY_ITEM_NAME_TAKEN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Маска доменного кода: `MODULE_REASON` (SCREAMING_SNAKE с одним подчёркиванием-разделителем). */
export const DOMAIN_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/;
