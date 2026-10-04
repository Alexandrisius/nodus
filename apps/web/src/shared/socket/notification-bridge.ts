import type { NotificationSnapshot } from '@nodus/contracts';

/**
 * Порт-адаптер «сокет → фича уведомлений» (паттерн card-bridge, #100):
 * shared-слой не импортирует features (направление слоёв); приём живых
 * событий регистрирует фича при маунте, сокет-слой только вызывает порт.
 */
export interface NotificationSink {
  /** Уведомление создано/повторено (тост по ярусу + счётчики). */
  dispatched: (snapshot: NotificationSnapshot, attempt: number) => void;
  /** Гашение (вкладки синхронны, D2). */
  read: (payload: { userId: string; sourceId: string | null }) => void;
}

let sink: NotificationSink | null = null;

export function registerNotificationSink(next: NotificationSink | null): void {
  sink = next;
}

/** Вызов порта (тихо, если фича не смонтирована — например, модуль off). */
export function notificationDispatched(snapshot: NotificationSnapshot, attempt: number): void {
  sink?.dispatched(snapshot, attempt);
}

export function notificationRead(userId: string, sourceId: string | null): void {
  sink?.read({ userId, sourceId });
}
