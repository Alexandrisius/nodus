import type { InjectionToken } from '@nestjs/common';

/**
 * Порт проверки права на файл ПО КОНТЕКСТУ потребителя (I8, #138).
 *
 * files не знает, где «живёт» файл (вложение чата, письмо, задача) — таблицы
 * потребителей ему недоступны (I3/I6). Каждый модуль-потребитель регистрирует
 * своего контрибьютора в multi-токене FILE_ACCESS_CONTRIBUTORS (@Global-
 * модуль потребителя); движок просмотра OR-ит решения с владением файла.
 *
 * Паттерн зеркален FILE_STORAGE (ADR-0013): интерфейс — в core/ports,
 * реализация — у владельца данных. Точка расширения появилась вместе с
 * первым потребителем (I13, ADR-0010): chat — сейчас, correspondence —
 * со своими вложениями.
 */
export interface FileAccessDecision {
  canView: boolean;
  canEdit: boolean;
}

export interface FileAccessContributor {
  /**
   * Право пользователя на файл в контексте потребителя.
   * `null` — файл в контексте потребителя не встречается (вклад в решение
   * отсутствует); `{ canView: false, … }` — встречается, но пользователь
   * не участник (явный отказ).
   */
  check(fileId: string, userId: string): Promise<FileAccessDecision | null>;
}

/** Токен-массив контрибьюторов (инжектится @Optional у потребителя). */
export const FILE_ACCESS_CONTRIBUTORS: InjectionToken = 'FILE_ACCESS_CONTRIBUTORS';
