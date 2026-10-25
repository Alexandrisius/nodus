import type { CounterpartyRef } from '@nodus/contracts';

/**
 * Read-порт контрагентов для чужих модулей (ADR-0012, дополнение #460):
 * корреспонденция (#55) читает корреспондента и подписанта, проекты (#52) —
 * заказчика. Модуль-потребитель не трогает таблицы crm (I3/I6) — только этот
 * интерфейс; реализация и репозиторий живут у владельца данных.
 *
 * Порт работает и при выключенном фичефлаге `crm`: флаг закрывает HTTP,
 * но письма и проекты продолжают показывать ссылки (I10).
 * Методы контактов (`contactRefs`, `activeContact`) добавит #55, адреса — #464.
 */
export const COUNTERPARTY_READER = Symbol('COUNTERPARTY_READER');

export interface CounterpartyReader {
  /** Ссылки пачкой для DTO писем/проектов, включая архивных (история
   *  рендерится). Пустой вход — без запроса к БД. */
  refs(ids: readonly string[]): Promise<CounterpartyRef[]>;

  /** Действующий контрагент для записи ссылки (корреспондент, заказчик);
   *  null — записи нет или она в архиве. */
  activeRef(id: string): Promise<CounterpartyRef | null>;
}
