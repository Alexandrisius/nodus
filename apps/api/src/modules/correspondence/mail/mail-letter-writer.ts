import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  LETTER_LIMITS,
  RECEIPT_METHOD_CODES,
  SystemDictionary,
} from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import {
  DICTIONARY_READER,
  type DictionaryReader,
} from '../../dictionaries/ports/dictionary-reader.port.js';
import {
  PROCESS_CATALOG_READER,
  type ProcessCatalogReader,
} from '../../workflows/ports/process-catalog-reader.port.js';
import { LetterBodyPdfQueue } from './body-pdf/letter-body-pdf.queue.js';
import { LetterThreadingService } from '../letters/letter-threading.service.js';
import { LettersRepository } from '../letters/letters.repository.js';
import type { MailClient } from './mail-client.port.js';
import type { ParsedMail } from './mail-parser.service.js';
import { MAIL_RECEPTION_CONFIG, type MailReceptionConfig } from './mail-reception.config.js';
import { MailParserService } from './mail-parser.service.js';

/** Системный автор приёма почты: createdBy и владелец файлов — plain UUID
 *  без FK (у письма нет FK на directory). */
export const MAIL_SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000056';

/** Результат обработки одного письма циклом. */
export interface LetterWriteOutcome {
  /** Курсор двигать (обработано, пропущено как дубль или исчезло). */
  advance: boolean;
  /** Создано письмо (для лога цикла). */
  created: boolean;
}

/**
 * Запись одного принятого письма (#56, Р3): исходник — во временный файл
 * (размер известен до записи в хранилище, память не растёт), разбор —
 * событийный с дедупом Message-ID ДО записи файлов; тела и вложения — в
 * FILE_STORAGE; письмо, вложения, авто-связь «ответ на», курсор и outbox
 * `letter_received` — ОДНОЙ транзакцией; при отказе транзакции файлы
 * компенсируются (паттерн #55). Битое письмо не блокирует очередь: создаётся
 * с флагом parseIssue и без файлов (анти-яд).
 */
@Injectable()
export class MailLetterWriter {
  constructor(
    private readonly repo: LettersRepository,
    private readonly threading: LetterThreadingService,
    @Inject(MAIL_RECEPTION_CONFIG) private readonly reception: MailReceptionConfig,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly parser: MailParserService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(PROCESS_CATALOG_READER) private readonly catalog: ProcessCatalogReader,
    @Inject(DICTIONARY_READER) private readonly dictionaries: DictionaryReader,
    private readonly bodyPdf: LetterBodyPdfQueue,
  ) {}

  async write(
    client: MailClient,
    uid: bigint,
    /** Курсор — той же транзакцией, что и письмо (Р3). */
    onLastUid: (tx: TransactionClient, uid: bigint) => Promise<void>,
  ): Promise<LetterWriteOutcome> {
    const raw = await client.source(uid, this.reception.sourceMaxBytes);
    if (!raw) return { advance: true, created: false };
    const dir = await mkdtemp(join(tmpdir(), 'nodus-mail-'));
    const emlPath = join(dir, 'letter.eml');
    try {
      const emlBytes = await this.spool(raw.content, emlPath);
      const internalDate = (await client.internalDateOf(uid)) ?? new Date();
      const outcome = await this.parser.parse(createReadStream(emlPath), async (messageId) =>
        messageId ? !(await this.repo.mailMessageIdTaken(messageId)) : true,
      );
      // Дубль Message-ID: не создано ни строки, ни байта в хранилище.
      if (outcome.skipped) return { advance: true, created: false };
      await this.persist(outcome.mail!, uid, internalDate, emlPath, emlBytes, onLastUid);
      return { advance: true, created: true };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Спул исходника на диск с потолком хранилища: сверх — письмо всё равно
   *  разбираем по обрезанному файлу (parseIssue), .eml не храним (Р12).
   *  Ручной backpressure: пауза источника, пока диск не освободился. */
  private async spool(content: Readable, path: string): Promise<number> {
    const out = createWriteStream(path, { flags: 'wx' });
    let bytes = 0;
    let capped = false;
    await new Promise<void>((resolve, reject) => {
      const settle = (error?: Error): void => {
        if (error) reject(error);
        else resolve();
      };
      content.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > this.reception.sourceMaxBytes) {
          capped = true;
          content.destroy();
          out.end(() => settle());
          return;
        }
        if (!out.write(chunk)) content.pause();
      });
      content.on('end', () => out.end(() => settle()));
      content.on('error', settle);
      out.on('drain', () => content.resume());
      out.on('error', settle);
    });
    return capped ? this.reception.sourceMaxBytes + 1 : bytes;
  }

  private async persist(
    mail: ParsedMail,
    uid: bigint,
    internalDate: Date,
    emlPath: string,
    emlBytes: number,
    onLastUid: (tx: TransactionClient, uid: bigint) => Promise<void>,
  ): Promise<void> {
    const type = await this.catalog.resolveTypeByCode('letter-incoming', { category: 'letter' });
    if (!type) throw new Error('Тип «Входящее письмо» не найден (каталог процессов)');
    const stages = await this.catalog.liveStages(type.workflowId);
    const initial = stages.find((stage) => stage.isInitial);
    if (!initial) throw new Error('У маршрута входящего письма нет начальной стадии');
    const receipt = await this.dictionaries.activeItemByCode(
      SystemDictionary.RECEIPT_METHOD,
      RECEIPT_METHOD_CODES.email,
    );

    const storageIncomplete =
      mail.parseIssue ||
      emlBytes > this.reception.sourceMaxBytes ||
      mail.attachments.length > LETTER_LIMITS.mailFiles;

    const saved: string[] = [];
    const rows: {
      fileId: string;
      role: string;
      sortOrder: number;
      contentId: string | null;
      inline: boolean;
    }[] = [];
    let order = 0;
    const put = async (
      role: string,
      name: string,
      mime: string,
      size: number,
      content: Readable,
      contentId: string | null = null,
      inline = false,
    ): Promise<void> => {
      const { fileId } = await this.storage.save(
        { ownerId: MAIL_SYSTEM_USER_ID, name, mime, size },
        content,
      );
      saved.push(fileId);
      rows.push({ fileId, role, sortOrder: order++, contentId, inline });
    };

    try {
      // Тело — нормализованный UTF-8 (html приоритет); исходник — по потолку;
      // первый PDF — главный документ; приложения — до лимита (флаг сверх).
      if (!mail.parseIssue && mail.html) {
        await put(
          'body',
          'Текст письма.html',
          'text/html',
          Buffer.byteLength(mail.html),
          Readable.from([mail.html]),
        );
      } else if (!mail.parseIssue && mail.text) {
        await put(
          'body',
          'Текст письма.txt',
          'text/plain',
          Buffer.byteLength(mail.text),
          Readable.from([mail.text]),
        );
      }
      if (!mail.parseIssue && emlBytes <= this.reception.sourceMaxBytes) {
        await put(
          'source',
          'Исходное письмо.eml',
          'message/rfc822',
          emlBytes,
          createReadStream(emlPath),
        );
      }
      const keep = mail.parseIssue ? [] : mail.attachments.slice(0, LETTER_LIMITS.mailFiles);
      const pdfIndex = mail.attachments.findIndex(
        (attachment) => !attachment.inline && attachment.mime === 'application/pdf',
      );
      const mainFileId = pdfIndex >= 0 && pdfIndex < keep.length ? keep[pdfIndex] : null;
      for (const attachment of keep) {
        await put(
          attachment === mainFileId ? 'main' : 'attachment',
          attachment.filename,
          attachment.mime,
          attachment.content.length,
          Readable.from([attachment.content]),
          attachment.contentId,
          attachment.inline,
        );
      }

      const letterId = randomUUID();
      const replyTarget = mail.parseIssue
        ? null
        : await this.threading.autoReplyTarget(mail.inReplyTo, mail.references);
      await this.txRunner.run(async (tx) => {
        await this.repo.create(tx, {
          id: letterId,
          typeId: type.id,
          workflowId: type.workflowId,
          stageId: initial.id,
          systemState: initial.systemState,
          direction: 'incoming',
          source: 'mail',
          createdBy: MAIL_SYSTEM_USER_ID,
          receivedAt: internalDate,
          subject: mail.subject,
          mailMessageId: mail.messageId,
          mailInReplyTo: mail.inReplyTo,
          mailReferences: mail.references,
          mailFromAddress: mail.fromAddress,
          mailFromName: mail.fromName,
          mailParseIssue: mail.parseIssue,
          mailStorageIncomplete: storageIncomplete,
          ...(receipt ? { receiptMethodId: receipt.id } : {}),
          attachments: { create: rows },
        });
        if (replyTarget) {
          await this.repo.linkReplyTo(tx, letterId, replyTarget.id, 'auto');
        }
        await onLastUid(tx, uid);
        await this.eventBus.emit(
          tx,
          CORRESPONDENCE_EVENTS.LETTER_RECEIVED,
          {
            letterId,
            typeId: type.id,
            direction: 'incoming',
            source: 'mail',
            subject: mail.subject,
            fileIds: saved.slice(0, LETTER_LIMITS.mailFiles + 2),
          },
          { aggregateType: 'letter', aggregateId: letterId },
        );
      });
      // После коммита («Основной документ письма» #56): у письма с телом —
      // фоновая PDF-копия (кандидат основного документа). Best-effort: сбой
      // постановки не валит приём — backfill старта подберёт.
      if (rows.some((row) => row.role === 'body')) {
        await this.bodyPdf.enqueue(letterId);
      }
    } catch (error) {
      // Компенсация файлов (паттерн #55): транзакция не прошла — хранилище
      // без сирот; курсор НЕ двигаем — повтор в следующем цикле.
      await this.storage.remove(saved).catch(() => undefined);
      throw error;
    }
  }
}
