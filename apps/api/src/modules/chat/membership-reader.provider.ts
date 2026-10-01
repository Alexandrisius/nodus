import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../../core/database/prisma.service.js';
import type { ChatConversationState, ChatMembershipReader } from './membership-reader.port.js';

interface MemberStateRow {
  user_id: string;
  muted: boolean;
}

interface ConversationStateRow {
  type: string;
  title: string | null;
}

/** Реализация read-порта членства (таблицы чата — только из модуля chat). */
@Injectable()
export class MembershipReaderProvider implements ChatMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async conversationState(conversationId: string): Promise<ChatConversationState | null> {
    const conversation = await this.prisma.$queryRaw<ConversationStateRow[]>(Prisma.sql`
      SELECT type, title FROM conversations WHERE id = ${conversationId}::uuid
    `);
    if (conversation.length === 0) return null;
    const members = await this.prisma.$queryRaw<MemberStateRow[]>(Prisma.sql`
      SELECT user_id, muted FROM conversation_members
      WHERE conversation_id = ${conversationId}::uuid AND hidden = false
    `);
    return {
      type: conversation[0]!.type as ChatConversationState['type'],
      title: conversation[0]!.title,
      members: members.map((m) => ({ userId: m.user_id, muted: m.muted })),
    };
  }

  async threadWatcherIds(threadRootId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      SELECT user_id FROM thread_participants WHERE thread_root_id = ${threadRootId}::uuid
    `);
    return rows.map((r) => r.user_id);
  }
}
