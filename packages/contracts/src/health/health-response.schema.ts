import { z } from 'zod';

/** Ответ эндпоинта проверки живости `GET /api/v1/health`. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  /** Метка времени сервера, UTC ISO 8601 (I7). */
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
