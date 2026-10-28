import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import nodemailer, { type SentMessageInfo, type Transporter } from 'nodemailer';
import { PinoLogger } from 'nestjs-pino';

import { CORRESPONDENCE_EVENTS } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import { MAIL_RECEPTION_CONFIG, type MailReceptionConfig } from './mail-reception.config.js';

export const SMTP_OUTBOX_QUEUE = 'correspondence-mail-outbox';
const PREFIX = 'nodus';
/** Вложение отправки: 50 МБ (сверх — провал, Р7). */
const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
/** Повторы 4xx: 5 попыток, экспоненциально от 60 с. */
const SMTP_ATTEMPTS = 5;
const SMTP_BACKOFF_MS = 60_000;

/** Задание исходящей почты (#56, Р7; кладёт #464 — окно отправки). */
export interface SmtpOutboxJob {
  /** Карточка письма-источника (событие провала, запись Message-ID — #464). */
  letterId?: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  /** Файлы письма (FILE_STORAGE) как вложения. */
  attachmentFileIds: string[];
  /** Дополнительные заголовки конверта (References, In-Reply-To — #464). */
  headers?: Record<string, string>;
}

export interface SmtpSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/**
 * SMTP-транспорт с очередью и повторами (ADR-0035, Р7): BullMQ
 * `correspondence-mail-outbox` (jobId-идемпотентность), nodemailer 587
 * STARTTLS (465 непригоден — диагностика 23.10), From — общий ящик.
 * 4xx/сеть — повторы ×5 (backoff 60 с ×2ⁿ); 5xx — провал сразу с событием
 * `correspondence.letter_send_failed`; исчерпание повторов — то же событие.
 * Результат ({messageId, accepted, rejected}) — #464 записывает Message-ID
 * исходящего (колонка mail_message_id готова).
 */
@Injectable()
export class SmtpOutboxTransport implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<SmtpOutboxJob>;
  private worker?: Worker<SmtpOutboxJob>;
  private transporter: Transporter | null = null;

  constructor(
    @Inject(MAIL_RECEPTION_CONFIG) private readonly config: MailReceptionConfig,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SmtpOutboxTransport.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue<SmtpOutboxJob>(SMTP_OUTBOX_QUEUE, {
      connection: this.connection,
      prefix: PREFIX,
    });
  }

  /** Готов ли транспорт: рубильник (проверяет вызывающий) и env SMTP. */
  get envReady(): boolean {
    return this.config.smtpReady;
  }

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<SmtpOutboxJob>(SMTP_OUTBOX_QUEUE, (job) => this.send(job), {
      connection: this.connection.duplicate(),
      prefix: PREFIX,
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? SMTP_ATTEMPTS)) {
        void this.reportFailure(job.data, error);
      }
    });
  }

  /** Идемпотентность — jobId: один и тот же ключ не создаёт вторую отправку. */
  async enqueue(job: SmtpOutboxJob, jobId = randomUUID()): Promise<void> {
    await this.queue.add('send', job, {
      jobId,
      attempts: SMTP_ATTEMPTS,
      backoff: { type: 'exponential', delay: SMTP_BACKOFF_MS },
      removeOnComplete: 20,
      removeOnFail: 100,
    });
  }

  private transport(): Transporter {
    if (!this.config.smtp) throw new Error('SMTP не настроен (MAIL_SMTP_*)');
    this.transporter ??= nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: false,
      auth: { user: this.config.smtp.user, pass: this.config.smtp.password },
    });
    return this.transporter;
  }

  /** Отправка: файлы — stream→буфер (воркер фоновый, очереди нет), 5xx —
   *  безнадёжно (событие сразу и discard без повторов), остальное — бросок
   *  на повтор BullMQ. */
  private async send(bullJob: Job<SmtpOutboxJob>): Promise<SmtpSendResult> {
    const job = bullJob.data;
    const attempt = bullJob.attemptsMade;
    try {
      const attachments = [];
      for (const fileId of job.attachmentFileIds) {
        const content = await this.storage.get(fileId);
        if (!content) throw new Error(`Файл вложения не найден: ${fileId}`);
        if (content.size > ATTACHMENT_MAX_BYTES) {
          throw Object.assign(new Error(`Вложение больше ${ATTACHMENT_MAX_BYTES} байт`), {
            permanent: true,
          });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of content.stream) chunks.push(chunk as Buffer);
        attachments.push({
          filename: content.name,
          contentType: content.mime,
          content: Buffer.concat(chunks),
        });
      }
      const info = (await this.transport().sendMail({
        from: this.config.fromAddress!,
        to: job.to,
        subject: job.subject,
        text: job.text,
        html: job.html,
        headers: job.headers,
        attachments,
      })) as SentMessageInfo;
      this.logger.info({ to: job.to, messageId: info.messageId, attempt }, 'Исходящее отправлено');
      return {
        messageId: info.messageId,
        accepted: info.accepted?.map(String) ?? [],
        rejected: info.rejected?.map(String) ?? [],
      };
    } catch (error) {
      const responseCode = (error as { responseCode?: number }).responseCode ?? 0;
      // 5xx — окончательный отказ сервера: повторы бессмысленны (Р7) —
      // событие провала сразу, задание — в failed без повторов.
      if (responseCode >= 500 || (error as { permanent?: boolean }).permanent) {
        await this.reportFailure(job, error);
        // Без повторов: перемещаем задание в failed минуя attempts (BullMQ
        // discard доступен у воркера — через JobProgress-токен не нужен).
        await bullJob.moveToFailed(new Error('SMTP 5xx — без повторов'), 'smtp-permanent', true);
      }
      throw error;
    }
  }

  /** Финальный провал — доменное событие (уведомление канцелярии — Р8). */
  private async reportFailure(job: SmtpOutboxJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    // Лог без содержимого письма (security-ревью #56): только адреса и контекст.
    this.logger.error(
      { err: error, letterId: job.letterId ?? null, to: job.to, subject: job.subject },
      'Исходящее не отправлено',
    );
    await this.txRunner
      .run(async (tx) => {
        await this.eventBus.emit(
          tx,
          CORRESPONDENCE_EVENTS.LETTER_SEND_FAILED,
          { letterId: job.letterId ?? null, error: message.slice(0, 200) },
          // aggregate_id — uuid: без карточки письма агрегата нет (событие
          // журнала без агрегата; отправка вне письма появится с #464).
          ...(job.letterId
            ? [{ aggregateType: 'letter' as const, aggregateId: job.letterId }]
            : []),
        );
      })
      .catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.transporter?.close();
    this.connection.disconnect();
  }
}
