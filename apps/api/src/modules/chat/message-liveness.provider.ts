import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

import type { ChatMessageLiveness } from './message-liveness.port.js';

/** Реализация read-порта живости сообщений (ADR-0012): любое мягкое
 *  удаление (deleted_at: надгробие #163 и бесследное obliterated) —
 *  «не живо»; знание таблицы messages остаётся у модуля chat. */
@Injectable()
export class MessageLivenessProvider implements ChatMessageLiveness {
  messageAliveGuard(ref: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = ${ref} AND m.deleted_at IS NOT NULL
    )`;
  }
}
