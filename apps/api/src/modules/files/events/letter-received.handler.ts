import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { DerivativesQueue } from '../derivatives/derivatives.queue.js';
import { DerivativesService } from '../derivatives/derivatives.service.js';
import { FilesRepository } from '../files.repository.js';

/**
 * Подписка files на `correspondence.letter_received` (#55, B5): письмо
 * поступило — офисным вложениям нужна PDF-копия (fallback-просмотр и
 * миниатюра, конвейер #139). Тяжёлая работа — очередь, не HTTP-запрос.
 * Идемпотентность — jobId `deriv-<fileId>-v<n>`. Связь модулей событием
 * (I3): files читает только fileIds из payload, таблиц писем не знает.
 */
@Injectable()
export class LetterReceivedHandler implements DomainEventHandler<Record<string, unknown>> {
  static readonly eventType = 'correspondence.letter_received';

  constructor(
    private readonly files: FilesRepository,
    private readonly derivatives: DerivativesService,
    private readonly queue: DerivativesQueue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LetterReceivedHandler.name);
  }

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const fileIds = event.payload?.fileIds;
    if (!Array.isArray(fileIds) || fileIds.length === 0) return;
    for (const raw of fileIds) {
      if (typeof raw !== 'string') continue;
      const file = await this.files.findById(raw);
      if (!file || !this.derivatives.shouldGeneratePdf(file.name)) continue;
      await this.queue.enqueuePdf(raw, file.version);
    }
  }
}
