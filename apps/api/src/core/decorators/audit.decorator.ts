import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const AUDIT_KEY = 'nodus:audit';

/** Метаданные аудита действия (точечная нотация, как у событий). */
export interface AuditMetadata {
  /** Действие (`task.create`). */
  action: string;
  /** Тип сущности в ед. числе (`task`); необязателен для системных действий. */
  entity?: string;
}

/**
 * Аудируемое действие (I7): `@Audit({ action: 'task.create', entity: 'task' })`.
 * Запись в `audit_logs` делает глобальный `AuditInterceptor` после успешного ответа.
 */
export const Audit = (metadata: AuditMetadata): CustomDecorator<typeof AUDIT_KEY> =>
  SetMetadata(AUDIT_KEY, metadata);
