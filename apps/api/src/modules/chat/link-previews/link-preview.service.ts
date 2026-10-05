import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { preview as linkpeekPreview, LinkpeekError } from 'linkpeek';
import { Readable } from 'node:stream';
import sharp from 'sharp';

import { CHAT_EVENTS } from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import { LinkPreviewRateLimiter } from './link-preview.rate-limiter.js';
import { ssrfGuardedFetch } from './safe-fetch.js';
import {
  assertFetchableUrl,
  clampField,
  FIELD_LIMITS,
  IMAGE_MAX_BYTES,
  PREVIEW_USER_AGENT,
  SsrfBlockedError,
} from './link-preview.guards.js';
import { LinkPreviewRepository } from './link-preview.repository.js';
import { isSelfDomain, normalizeUrl, urlDomain } from './url-normalize.js';
import type { LinkPreviewJob } from './link-preview.queue.js';

/** DTO превью в сообщении (клиентский снимок; schema — contracts). */
export interface LinkPreviewDto {
  status: 'pending' | 'ready' | 'failed' | 'blocked';
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

/** Self-домены портала (карточка без фетча, спека #212): прод-домен;
 *  dev/песочница добавляет свои через LINK_PREVIEW_SELF_HOSTS. localhost
 *  НЕ входит — по спеке SSRF-прогона блокируется (ссылки на локальные
 *  dev-порты получают заглушку через blocked-ветку). */
const SELF_HOSTS = (process.env.LINK_PREVIEW_SELF_HOSTS ?? 'nodus.by')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

/**
 * Конвейер превью ссылок (#212, ADR-0018): воркер-логика (наши SSRF-гварды
 * + linkpeek + og:image-дериват в SILO) и обогащение DTO чтения. Асинхронно:
 * сообщение летит мгновенно, карточка дозревает фоном → WS
 * chat.link_preview_ready в комнату беседы (gateway-роутинг по
 * conversationId). Главный режим отказа — заглушка из домена (I11).
 */
@Injectable()
export class LinkPreviewService {
  constructor(
    private readonly repo: LinkPreviewRepository,
    private readonly eventBus: EventBus,
    private readonly txRunner: TransactionRunner,
    private readonly signedUrls: SignedUrlService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly rateLimiter: LinkPreviewRateLimiter,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LinkPreviewService.name);
  }

  /** Обогащение чтения: превью по нормализованным URL (батч, страница ≤100).
   *  Отсутствующим/expired — заглушка pending (скелетон; lazy-прогрев
   *  решает отдельно, ставить задачу при чтении не нужно — это делает
   *  слушатель отправки и повторные показы). */
  async previewsForUrls(urls: string[]): Promise<Map<string, LinkPreviewDto>> {
    const normalized = [...new Set(urls.map(normalizeUrl).filter(Boolean) as string[])];
    const cached = await this.repo.findAlive(normalized);
    const out = new Map<string, LinkPreviewDto>();
    for (const url of normalized) {
      const row = cached.get(url);
      out.set(
        url,
        row
          ? this.toDto(row)
          : {
              status: 'pending',
              title: null,
              description: null,
              siteName: urlDomain(url),
              imageUrl: null,
            },
      );
    }
    return out;
  }

  private toDto(row: {
    normalizedUrl: string;
    status: string;
    title: string | null;
    description: string | null;
    siteName: string | null;
    imageFileId: string | null;
  }): LinkPreviewDto {
    // failed/blocked — карточка-заглушка ИЗ ДОМЕНА (бот-блокировка/SSRF):
    // домен всегда берём из URL строки (siteName у blocked не пишется).
    const stub = urlDomain(row.siteName || row.normalizedUrl);
    return {
      status: row.status as LinkPreviewDto['status'],
      title: row.status === 'ready' ? row.title : null,
      description: row.status === 'ready' ? row.description : null,
      siteName: row.status === 'ready' ? (row.siteName ?? stub) : stub,
      imageUrl:
        row.status === 'ready' && row.imageFileId
          ? this.signedUrls.fileContentUrl(row.imageFileId)
          : null,
    };
  }

  /** Воркер: конвейер одной задачи. Идемпотентен (кэш по normalizedUrl). */
  async processJob(job: LinkPreviewJob): Promise<void> {
    try {
      assertFetchableUrl(job.rawUrl);
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        await this.repo.upsertBlocked(job.normalizedUrl);
        await this.emitReady(job, 'blocked');
        return;
      }
      throw error;
    }

    // Self-link: карточка из домена без внешнего фетча (спека #212).
    if (isSelfDomain(job.rawUrl, SELF_HOSTS)) {
      await this.repo.upsertReady(job.normalizedUrl, {
        title: null,
        description: null,
        siteName: urlDomain(job.rawUrl),
        imageFileId: null,
      });
      await this.emitReady(job, 'ready');
      return;
    }

    if (!(await this.rateLimiter.allow(job.authorId))) {
      this.logger.info({ authorId: job.authorId }, 'Превью: per-user лимит фетчей');
      return; // без кэша: задача повторится, когда счётчик ослабнет
    }

    try {
      const result = await linkpeekPreview(job.rawUrl, {
        timeout: 8000,
        maxBytes: 30_000,
        userAgent: PREVIEW_USER_AGENT,
        followRedirects: true,
        maxRedirects: 3,
        allowPrivateIPs: false,
        // Pinned-DNS агент: каждое соединение (и редирект-хопы) резолвится и
        // проверяется ЗДЕСЬ против приватных диапазонов (security-ревью:
        // linkpeek проверяет только литеральные IP хоста).
        fetch: ssrfGuardedFetch as typeof globalThis.fetch,
      });
      const imageFileId = result.image
        ? await this.saveImageDerivative(result.image, job.authorId, urlDomain(job.rawUrl))
        : null;
      await this.repo.upsertReady(job.normalizedUrl, {
        title: clampField(result.title, FIELD_LIMITS.title),
        description: clampField(result.description, FIELD_LIMITS.description),
        siteName: clampField(result.siteName, FIELD_LIMITS.siteName) ?? urlDomain(job.rawUrl),
        imageFileId,
      });
      await this.emitReady(job, 'ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked =
        (error instanceof LinkpeekError && error.code === 'PRIVATE_NETWORK_BLOCKED') ||
        error instanceof SsrfBlockedError ||
        message.includes('private dns record') ||
        message.includes('private address');
      if (blocked) {
        await this.repo.upsertBlocked(job.normalizedUrl);
        await this.emitReady(job, 'blocked');
        return;
      }
      // Сеть/таймаут/бот-блокировка — отрицательный кэш на час (заглушка).
      this.logger.info({ normalizedUrl: job.normalizedUrl, err: error }, 'Превью: фетч не удался');
      await this.repo.upsertFailed(job.normalizedUrl);
      await this.emitReady(job, 'failed');
    }
  }

  /** og:image → SILO (без хотлинков): гварды адреса + pinned-DNS агент
   *  (редиректы картинки на внутренние адреса блокируются на коннекте,
   *  security-ревью), стрим ≤ 2 МБ, sharp-дериват ≤640px webp (#139),
   *  лимит пикселей 4096² от декомпрессионных бомб. Любой сбой — карточка
   *  без картинки. */
  private async saveImageDerivative(
    rawImageUrl: string,
    ownerId: string,
    domain: string,
  ): Promise<string | null> {
    try {
      assertFetchableUrl(rawImageUrl);
      const res = await ssrfGuardedFetch(rawImageUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': PREVIEW_USER_AGENT },
        redirect: 'follow',
      });
      if (!res.ok || !res.body) return null;
      const chunks: Buffer[] = [];
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value!.byteLength;
        if (size > IMAGE_MAX_BYTES) return null;
        chunks.push(Buffer.from(value!));
      }
      const image = await sharp(Buffer.concat(chunks), {
        failOn: 'none',
        limitInputPixels: 4096 * 4096,
      })
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const { fileId } = await this.storage.save(
        {
          ownerId,
          name: `link-preview-${domain}.webp`,
          mime: 'image/webp',
          size: image.byteLength,
        },
        Readable.from(image),
      );
      return fileId;
    } catch (error) {
      this.logger.info({ rawImageUrl, err: error }, 'Превью: картинка не сохранена');
      return null;
    }
  }

  /** WS-событие дозревания (outbox, I9): клиенты патчат карточку на месте. */
  private async emitReady(job: LinkPreviewJob, status: LinkPreviewDto['status']): Promise<void> {
    const cached = (await this.repo.findAlive([job.normalizedUrl])).get(job.normalizedUrl);
    if (!cached) return;
    const preview = this.toDto(cached);
    preview.status = status;
    await this.txRunner.run(async (tx) => {
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.LINK_PREVIEW_READY,
        {
          conversationId: job.conversationId,
          messageId: job.messageId,
          url: job.rawUrl,
          preview,
        },
        { actorId: job.authorId, aggregateType: 'conversation', aggregateId: job.conversationId },
      );
    });
  }
}
