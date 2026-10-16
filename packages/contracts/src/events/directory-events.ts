import { z } from 'zod';

/**
 * Каталог доменных событий модуля directory (I9; префикс = модуль-владелец,
 * api-conventions.md). Подписчики: auth (отзыв сессий деактивированного),
 * gateway (разрыв WS-сокетов деактивированного, #317).
 */
export const DIRECTORY_EVENTS = {
  USER_CREATED: 'directory.user.created',
  USER_UPDATED: 'directory.user.updated',
  USER_DEACTIVATED: 'directory.user.deactivated',
} as const;

export const userDeactivatedPayloadSchema = z.object({
  userId: z.uuid(),
});
export type UserDeactivatedPayload = z.infer<typeof userDeactivatedPayloadSchema>;
