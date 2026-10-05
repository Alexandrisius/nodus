import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';

/** Строка кэша превью (снапшот для DTO/воркера). */
export interface LinkPreviewRow {
  normalizedUrl: string;
  status: 'pending' | 'ready' | 'failed' | 'blocked';
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageFileId: string | null;
  faviconFileId: string | null;
  fetchedAt: Date | null;
  expiresAt: Date | null;
}

const COLS = Prisma.sql`
  normalized_url AS "normalizedUrl", status, title, description,
  site_name AS "siteName", image_file_id AS "imageFileId",
  favicon_file_id AS "faviconFileId", fetched_at AS "fetchedAt",
  expires_at AS "expiresAt"
`;

/** TTL кэша (#212): готовое 24ч, отрицательное 1ч, blocked бессрочно. */
export const READY_TTL_MS = 24 * 3600 * 1000;
export const FAILED_TTL_MS = 3600 * 1000;

/**
 * Кэш link_previews (#212, ADR-0018): единственная точка SQL модуля к своей
 * таблице (Repository pattern). Ключ — нормализованный URL; строки пишут
 * воркер и self-domain short-circuit, читают DTO-обогащение и lazy-прогрев.
 */
@Injectable()
export class LinkPreviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Живые превью по нормализованным URL (страница ≤ 100): expired не
   *  возвращается (воркер перегонит). */
  async findAlive(urls: string[]): Promise<Map<string, LinkPreviewRow>> {
    if (urls.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<LinkPreviewRow[]>(Prisma.sql`
      SELECT ${COLS} FROM link_previews
      WHERE normalized_url = ANY(${urls}::text[])
        AND (expires_at IS NULL OR expires_at > now())
    `);
    return new Map(rows.map((row) => [row.normalizedUrl, row]));
  }

  /** Есть ли хоть одна строка под URL (любого статуса, включая expired):
   *  lazy-прогрев решает «нужно ли ставить задачу». */
  async existsAny(urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ normalizedUrl: string }[]>(Prisma.sql`
      SELECT normalized_url AS "normalizedUrl" FROM link_previews
      WHERE normalized_url = ANY(${urls}::text[])
    `);
    return new Set(rows.map((row) => row.normalizedUrl));
  }

  /** Строка «задача поставлена» (pending, TTL час — защита от зависшей
   *  задачи: повторная отправка того же URL перегонит). */
  async markPending(normalizedUrl: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO link_previews (id, normalized_url, status, expires_at)
      VALUES (gen_random_uuid(), ${normalizedUrl}, 'pending',
              now() + interval '1 hour')
      ON CONFLICT (normalized_url) DO NOTHING
    `);
  }

  /** Фиксация готового превью (или заглушки self-domain без картинки). */
  async upsertReady(
    normalizedUrl: string,
    data: {
      title: string | null;
      description: string | null;
      siteName: string | null;
      imageFileId: string | null;
    },
  ): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO link_previews
        (id, normalized_url, status, title, description, site_name,
         image_file_id, fetched_at, expires_at)
      VALUES (gen_random_uuid(), ${normalizedUrl}, 'ready', ${data.title},
              ${data.description}, ${data.siteName}, ${data.imageFileId},
              now(), now() + interval '24 hours')
      ON CONFLICT (normalized_url) DO UPDATE SET
        status = 'ready', title = ${data.title}, description = ${data.description},
        site_name = ${data.siteName}, image_file_id = ${data.imageFileId},
        fetched_at = now(), expires_at = now() + interval '24 hours',
        updated_at = now()
    `);
  }

  /** Отрицательный кэш (сетевая ошибка/бот-блокировка/таймаут — час). */
  async upsertFailed(normalizedUrl: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO link_previews (id, normalized_url, status, fetched_at, expires_at)
      VALUES (gen_random_uuid(), ${normalizedUrl}, 'failed', now(), now() + interval '1 hour')
      ON CONFLICT (normalized_url) DO UPDATE SET
        status = 'failed', fetched_at = now(),
        expires_at = now() + interval '1 hour', updated_at = now()
    `);
  }

  /** SSRF-отказ гварда — навсегда (кэш «не ходить»). */
  async upsertBlocked(normalizedUrl: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO link_previews (id, normalized_url, status, fetched_at)
      VALUES (gen_random_uuid(), ${normalizedUrl}, 'blocked', now())
      ON CONFLICT (normalized_url) DO UPDATE SET
        status = 'blocked', expires_at = NULL, updated_at = now()
    `);
  }
}
