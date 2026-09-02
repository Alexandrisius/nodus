import { z } from 'zod';

import { userRefSchema } from './user-ref.schema.js';

/** Presence для правой полосы аватарок и чатов (gateway — после M13). */
export const presenceStatusSchema = z.enum(['online', 'away', 'offline']);
export type PresenceStatus = z.infer<typeof presenceStatusSchema>;

export const presenceEntrySchema = z.object({
  user: userRefSchema,
  status: presenceStatusSchema,
});

export type PresenceEntry = z.infer<typeof presenceEntrySchema>;
