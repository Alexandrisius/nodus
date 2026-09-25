import { Client } from 'pg';

/**
 * Тест-контур gateway: отдельная БД `nodus_gateway_test` с МИНИМАЛЬНЫМ срезом
 * таблиц, которые gateway реально читает (READ-ONLY — users,
 * conversation_members). Полная схема api не нужна: gateway не владеет
 * миграциями и не должен зависеть от Prisma.
 */

const TEST_DB = 'nodus_gateway_test';

export interface GatewayTestDb {
  url: string;
  /** UUID, засеянные в БД: пользователи и беседа. */
  users: { id: string; displayName: string }[];
  conversationId: string;
  cleanup(): Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export async function ensureGatewayTestDatabase(rootUrl: string): Promise<GatewayTestDb> {
  const admin = new Client({ connectionString: withDatabase(rootUrl, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEST_DB}`).catch(() => undefined);
  await admin.end();

  const url = withDatabase(rootUrl, TEST_DB);
  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      display_name text NOT NULL,
      avatar_url text
    );
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id uuid NOT NULL,
      user_id uuid NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );
  `);

  const runId = crypto.randomUUID().slice(0, 8);
  const users = [
    { id: crypto.randomUUID(), displayName: `Гейт ${runId} Один` },
    { id: crypto.randomUUID(), displayName: `Гейт ${runId} Два` },
    { id: crypto.randomUUID(), displayName: `Гейт ${runId} Три` },
  ];
  const conversationId = crypto.randomUUID();
  for (const user of users) {
    await client.query('INSERT INTO users (id, display_name, avatar_url) VALUES ($1, $2, NULL)', [
      user.id,
      user.displayName,
    ]);
  }
  // Члены беседы — первый и второй; третий (не-член) для негативного кейса.
  await client.query(
    'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
    [conversationId, users[0]!.id, users[1]!.id],
  );

  return {
    url,
    users,
    conversationId,
    async cleanup() {
      await client.query('DELETE FROM conversation_members');
      await client.query('DELETE FROM users');
      await client.end();
    },
  };
}
