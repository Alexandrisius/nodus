import { z } from 'zod';

/**
 * Денормализованный снапшот сотрудника в чужих DTO (задачи, письма, чаты):
 * списки не ходят в справочник за каждым именем. Актуальное имя — в directory.
 */
export const userRefSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  avatarUrl: z.url().nullable(),
});

export type UserRef = z.infer<typeof userRefSchema>;
