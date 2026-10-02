import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { FilesRepository } from '../files.repository.js';
import { DerivativesQueue } from '../derivatives/derivatives.queue.js';
import { DerivativesService } from '../derivatives/derivatives.service.js';

interface MessageSentAttachment {
  fileId?: string;
}

/**
 * Подписка files на `chat.message_sent` (запуск конвейера производных
 * #139): подтверждение загрузки = привязка к отправленному сообщению
 * (attachmentIds); «трей» композера производных не порождает. Связь
 * модулей событием (I3): files читает fileId из DTO, ничего не зная о
 * таблицах чата. Идемпотентность — jobId очереди `deriv-<fileId>-v<n>`.
 */
@Injectable()
export class AttachmentSentHandler implements DomainEventHandler<Record<string, unknown>> {
  static readonly eventType = 'chat.message_sent';

  constructor(
    private readonly files: FilesRepository,
    private readonly derivatives: DerivativesService,
    private readonly queue: DerivativesQueue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AttachmentSentHandler.name);
  }

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const attachments = (
      event.payload?.message as { attachments?: MessageSentAttachment[] } | undefined
    )?.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    for (const attachment of attachments) {
      const fileId = attachment?.fileId;
      if (typeof fileId !== 'string') continue;
      const file = await this.files.findById(fileId);
      if (!file || !this.derivatives.shouldGeneratePdf(file.name)) continue;
      await this.queue.enqueuePdf(fileId, file.version);
    }
  }
}
