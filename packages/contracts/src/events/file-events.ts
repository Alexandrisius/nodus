import { z } from 'zod';

/**
 * Каталог доменных событий модуля files (I9: каждое событие — в `events`
 * через outbox; префикс = модуль-владелец в ед. числе). Первое событие
 * модуля — версии файлов из сохранений ONLYOFFICE (#138).
 */
export const FILE_EVENTS = {
  VERSION_CREATED: 'file.version_created',
} as const;

export const fileVersionCreatedPayloadSchema = z.object({
  fileId: z.uuid(),
  /** Номер новой версии (≥ 2: v1 создаётся загрузкой, без события). */
  version: z.number().int().min(2),
  size: z.number().int().min(0),
  mime: z.string().min(1),
});
export type FileVersionCreatedPayload = z.infer<typeof fileVersionCreatedPayloadSchema>;
