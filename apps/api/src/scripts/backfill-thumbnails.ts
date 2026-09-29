/**
 * Backfill превью вложений (#150): ставит в очередь BullMQ все изображения
 * message_attachments без thumb_file_id (пилотные данные, загруженные до
 * воркера). Обработает работающий api-воркер; повторный запуск безопасен
 * (jobId-дедупликация). Запуск из корня репо:
 *   pnpm --filter @nodus/api exec tsx src/scripts/backfill-thumbnails.ts
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { THUMBNAIL_QUEUE } from '../modules/chat/messages/thumbnail.queue.js';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) throw new Error('DATABASE_URL/REDIS_URL не заданы (.env)');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const rows = await prisma.messageAttachment.findMany({
    where: { kind: 'image', thumbFileId: null },
    select: { id: true, fileId: true },
  });
  console.log(`Вложений-изображений без превью: ${rows.length}`);

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(THUMBNAIL_QUEUE, { connection });
  for (const row of rows) {
    await queue.add(
      'generate',
      { attachmentId: row.id, fileId: row.fileId },
      {
        jobId: `thumb:${row.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  }
  console.log('Задачи поставлены — обработает работающий api-воркер');

  await queue.close();
  connection.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
