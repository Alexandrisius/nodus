import { Pool } from 'pg';
import type { UserRef } from '@nodus/contracts';

/**
 * READ-ONLY доступ gateway к Postgres api — осознанное исключение I3/I6
 * (зафиксировано в README gateway и спеке #104): gateway не тянет Nest/Prisma
 * ради двух SELECT-ов, но и не пишет в чужие таблицы никогда.
 */
export interface MembershipStore {
  isMember(userId: string, conversationId: string): Promise<boolean>;
  /** Участники беседы — user-комнаты для событий, меняющих список бесед. */
  memberIds(conversationId: string): Promise<string[]>;
  /** Профиль для presence-entries (кэш TTL). */
  userRef(userId: string): Promise<UserRef | null>;
}

const USER_REF_TTL_MS = 60_000;
const POOL_MAX = 10;

interface UserRefRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export class PgMembershipStore implements MembershipStore {
  private readonly pool: Pool;
  private readonly refCache = new Map<string, { ref: UserRef | null; expiresAt: number }>();

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: POOL_MAX });
  }

  async isMember(userId: string, conversationId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1',
      [conversationId, userId],
    );
    return rows.length > 0;
  }

  async memberIds(conversationId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
      [conversationId],
    );
    return rows.map((row) => row.user_id);
  }

  async userRef(userId: string): Promise<UserRef | null> {
    const cached = this.refCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ref;
    }
    const { rows } = await this.pool.query<UserRefRow>(
      'SELECT id, display_name, avatar_url FROM users WHERE id = $1',
      [userId],
    );
    const row = rows[0];
    const ref = row
      ? { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url }
      : null;
    this.refCache.set(userId, { ref, expiresAt: Date.now() + USER_REF_TTL_MS });
    return ref;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
