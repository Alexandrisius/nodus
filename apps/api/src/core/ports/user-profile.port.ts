import type { InjectionToken } from '@nestjs/common';
import type { UserRef } from '@nodus/contracts';

/**
 * Порт чтения профиля сотрудника (ADR-0012): модулям нужны ФИО/аватар для
 * DTO (авторы сообщений, исполнители задач), но таблица users принадлежит
 * directory — прямой доступ из чужих репозиториев запрещён (I3/I6).
 * Первый потребитель — chat (#58). users — core-shared таблица (прецедент
 * auth.repository), реализация — core/ports/user-profile.provider.ts, биндинг
 * токена — в модуле-потребителе (детали — ADR-0012).
 * Появление порта = появление первого потребителя (ADR-0010: пустых портов нет).
 */
export interface UserProfileReader {
  /** Профили по id (без сортировочных гарантий); отсутствующие — пропущены. */
  findRefs(userIds: string[]): Promise<UserRef[]>;

  /** Подстрочный поиск по отображаемому имени (ILIKE, без курсора — объём ≤ штата). */
  searchByDisplayName(query: string, limit: number): Promise<UserRef[]>;
}

export const USER_PROFILE_READER: InjectionToken = 'USER_PROFILE_READER';
