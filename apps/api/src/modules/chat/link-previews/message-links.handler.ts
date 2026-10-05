import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { VaultRepository } from '../vault/vault.repository.js';
import { LinkPreviewRepository } from './link-preview.repository.js';
import { LinkPreviewQueue } from './link-preview.queue.js';
import { normalizeUrl } from './url-normalize.js';

interface MessageLinksPayload {
  conversationId: string;
  messageId: string;
  authorId: string;
}

/**
 * Слушатель `chat.message_sent`/`chat.message_edited` (#212): проекция
 * message_links (#211) уже посчитана в транзакции сообщения — здесь только
 * «какие URL без живого превью → очередь». Транзакцию отправки НЕ трогаем
 * (нулевая цена для latency). Идемпотентен: jobId = нормализованный URL
 * (BullMQ дедупит), существующие строки кэша не переставляются.
 */
@Injectable()
export class MessageLinksPreviewHandler implements DomainEventHandler<MessageLinksPayload> {
  static readonly eventType = 'chat.message_sent';

  constructor(
    private readonly vault: VaultRepository,
    private readonly repo: LinkPreviewRepository,
    private readonly queue: LinkPreviewQueue,
  ) {}

  async handle(event: DomainEvent<MessageLinksPayload>): Promise<void> {
    const payload = event.payload;
    if (!payload?.conversationId || !payload.messageId) return;

    // Ссылки сообщения (все: кэш греется под повторные показы и правки).
    const urls = await this.vault.urlsOfMessage(payload.messageId);
    if (urls.length === 0) return;

    const normalized = [
      ...new Set(urls.map((url) => normalizeUrl(url)).filter(Boolean) as string[]),
    ];
    const existing = await this.repo.existsAny(normalized);
    for (const url of normalized) {
      if (existing.has(url)) continue; // уже в кэше (ready/failed/pending)
      await this.repo.markPending(url);
      await this.queue.enqueue({
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        rawUrl: urls.find((raw) => normalizeUrl(raw) === url) ?? url,
        normalizedUrl: url,
        authorId: payload.authorId,
      });
    }
  }
}

/** Правка (#212): ссылки могли добавиться — тот же конвейер по итогу. */
@Injectable()
export class MessageEditedPreviewHandler implements DomainEventHandler<{
  conversationId: string;
  messageId: string;
  authorId: string;
}> {
  static readonly eventType = 'chat.message_edited';

  constructor(private readonly sent: MessageLinksPreviewHandler) {}

  handle(
    event: DomainEvent<{ conversationId: string; messageId: string; authorId: string }>,
  ): Promise<void> {
    return this.sent.handle(event);
  }
}
