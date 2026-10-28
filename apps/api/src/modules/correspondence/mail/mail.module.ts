import { Module } from '@nestjs/common';

import { ImapFlowMailClientProvider } from './imapflow-mail-client.provider.js';
import { MAIL_CLIENT } from './mail-client.port.js';
import { MailSyncLock } from './mail-lock.service.js';
import { MailParserService } from './mail-parser.service.js';
import { MailSourcesRepository } from './mail-sources.repository.js';
import { MAIL_RECEPTION_CONFIG, MailReceptionConfig } from './mail-reception.config.js';

/**
 * Транспортная обвязка приёма почты (#56, ADR-0035): конфиг env, событийный
 * парсер и порт MAIL_CLIENT с реализацией imapflow. НЕ зависит от сервисов
 * модуля correspondence (письма, цепочки) — доменный цикл приёма
 * (MailInboxService, MailLetterWriter, фолбэк-опрос, SMTP-очередь) живёт в
 * самом CorrespondenceModule, чтобы не тянуть обратный импорт модулей.
 */
@Module({
  providers: [
    // Фабрика по токену: параметр конструктора конфига (env для тестов)
    // не должен попадать в размышления зависимостей Nest.
    { provide: MAIL_RECEPTION_CONFIG, useFactory: () => new MailReceptionConfig() },
    MailParserService,
    MailSourcesRepository,
    MailSyncLock,
    ImapFlowMailClientProvider,
    { provide: MAIL_CLIENT, useExisting: ImapFlowMailClientProvider },
  ],
  exports: [
    MAIL_RECEPTION_CONFIG,
    MailParserService,
    MailSourcesRepository,
    MailSyncLock,
    MAIL_CLIENT,
  ],
})
export class MailModule {}
