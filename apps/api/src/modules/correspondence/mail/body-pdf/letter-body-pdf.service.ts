import { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CORRESPONDENCE_EVENTS } from '@nodus/contracts';

import { TransactionRunner } from '../../../../core/database/transaction-runner.js';
import { EventBus } from '../../../../core/events/event-bus.js';
import {
  DOCUMENT_CONVERTER,
  type DocumentConverter,
  type HtmlPdfAsset,
} from '../../../../core/ports/document-converter.port.js';
import {
  FILE_OBJECT_READER,
  type FileObjectReader,
} from '../../../../core/ports/file-object-reader.port.js';
import { FILE_STORAGE, type FileStorage } from '../../../../core/ports/file-storage.port.js';
import { LettersRepository } from '../../letters/letters.repository.js';
import type { LetterAttachmentRow } from '../../letters/letter-row.js';
import { MAIL_SYSTEM_USER_ID } from '../mail-letter-writer.js';

/** Имя файла PDF-копии тела (роль body_pdf, метка «Текст письма»). */
export const BODY_PDF_NAME = 'Текст письма.pdf';

/** Тело больше этого не конвертируется (кандидат недоступен — флаг):
 *  хранится текст, читается вкладкой; печать простыни бессмысленна. */
const BODY_PDF_SOURCE_CAP_BYTES = 10 * 1024 * 1024;

/** Суммарный потолок inline-картинок конвертации: сверх — картинки
 *  заменяются пустыми, текст письма остаётся полным. */
const BODY_PDF_ASSETS_CAP_BYTES = 10 * 1024 * 1024;

/** Прозрачный пиксель: заменяет cid-картинку, не попавшую в ассеты. */
const EMPTY_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Расширение ассета по mime (Chromium понимает и без него, но имя с
 *  расширением честнее в самом PDF-контейнере). */
const extOf = (mime: string): string => {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'png';
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * PDF-копия тела письма («Основной документ письма» #56): фоновая конвертация
 * текста почты (HTML или plain) в PDF-кандидат основного документа — паттерн
 * СЭД «текст письма → простой документ». Живёт в очереди (BullMQ),
 * идемпотентна (роль body_pdf одна — частичный unique), отказ конвертера не
 * роняет письмо: после ретраев горит флаг `mailBodyPdfIssue`, текст читается
 * вкладкой и хранится в .eml. Главным документом копия становится де-факто
 * (маппер `bodyOf`), пока канцелярия не выбрала файл звёздочкой.
 */
@Injectable()
export class LetterBodyPdfService {
  constructor(
    private readonly repo: LettersRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(FILE_OBJECT_READER) private readonly files: FileObjectReader,
    @Inject(DOCUMENT_CONVERTER) private readonly converter: DocumentConverter,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LetterBodyPdfService.name);
  }

  /** Конвертация одного письма (воркер). 'skipped' — нечего делать (нет тела,
   *  копия есть, конвейер выключен); бросает — ретраи очереди. */
  async convert(letterId: string): Promise<'created' | 'skipped'> {
    if (!this.converter.available) return 'skipped';
    const letter = await this.repo.findDetailById(letterId);
    if (!letter || letter.deletedAt !== null || letter.mailParseIssue) return 'skipped';
    const attachments = await this.repo.attachments(letterId);
    const body = attachments.find((a) => a.role === 'body');
    if (!body || attachments.some((a) => a.role === 'body_pdf')) return 'skipped';

    const html = await this.sourceHtml(letterId, body, attachments);
    const bytes = await this.converter.htmlToPdf(html.html, html.assets);

    const { fileId } = await this.storage.save(
      {
        ownerId: MAIL_SYSTEM_USER_ID,
        name: BODY_PDF_NAME,
        mime: 'application/pdf',
        size: bytes.length,
        derivedFrom: body.fileId,
      },
      Readable.from([bytes]),
    );

    // Де-факто главный до вставки: main нет — копия станет вкладкой «Письмо»
    // (система доопределяет выбор и после регистрации — канцелярия не меняла).
    const becomesMain = !attachments.some((a) => a.role === 'main');
    const sortOrder = Math.max(0, ...attachments.map((a) => a.sortOrder)) + 1;
    try {
      await this.txRunner.run(async (tx) => {
        await this.repo.lock(tx, letterId);
        // Гонка постановок (приём + backfill): уникальная роль уже занята.
        const raced = await this.repo.hasBodyPdf(tx, letterId);
        if (raced) throw new DuplicateBodyPdfError();
        await this.repo.addBodyPdf(tx, letterId, { fileId, sortOrder });
        if (letter.mailBodyPdfIssue) {
          await this.repo.update(tx, letterId, { mailBodyPdfIssue: false });
        }
        if (becomesMain) {
          await this.eventBus.emit(
            tx,
            CORRESPONDENCE_EVENTS.LETTER_UPDATED,
            {
              letterId,
              changes: [{ field: 'mainDocument', from: null, to: BODY_PDF_NAME }],
            },
            { aggregateType: 'letter', aggregateId: letterId },
          );
        }
      });
    } catch (error) {
      if (error instanceof DuplicateBodyPdfError) {
        await this.storage.remove([fileId]).catch(() => undefined);
        return 'skipped';
      }
      // Транзакция не прошла — файл не должен остаться сиротой.
      await this.storage.remove([fileId]).catch(() => undefined);
      throw error;
    }
    this.logger.info({ letterId, bytes: bytes.length }, 'PDF-копия тела готова');
    return 'created';
  }

  /** Ретраи исчерпаны — флаг «кандидат недоступен» (по образцу mailParseIssue):
   *  письмо живёт, текст читается вкладкой; копия появится после починки
   *  конвертера (backfill/повторная постановка сбросит флаг). */
  async markIssue(letterId: string, error: unknown): Promise<void> {
    await this.txRunner
      .run(async (tx) => {
        await this.repo.update(tx, letterId, { mailBodyPdfIssue: true });
      })
      .catch(() => undefined);
    this.logger.warn({ letterId, err: error }, 'PDF-копия тела не создана');
  }

  /** Backfill старта: письма с телом без копии (воркер ставит им задачу). */
  backlogLetterIds(): Promise<string[]> {
    return this.repo.bodyPdfBacklog();
  }

  /** Печатный HTML тела: HTML-письмо с нейтрализованными фонами (копия —
   *  документ на белом листе) и подставленными cid-картинками; текст —
   *  читательской обёрткой. Возврат под тип `LetterDetailRow.mailBodyPdfIssue`
   *  не нужен — флаг пишет `markIssue`. */
  private async sourceHtml(
    letterId: string,
    body: LetterAttachmentRow,
    attachments: readonly LetterAttachmentRow[],
  ): Promise<{ html: string; assets: HtmlPdfAsset[] }> {
    const refs = new Map((await this.files.refs([body.fileId])).map((f) => [f.id, f]));
    const bodyFile = refs.get(body.fileId);
    const bodyBytes = await this.readAll(body.fileId);
    if (bodyBytes === null || bodyBytes.length > BODY_PDF_SOURCE_CAP_BYTES) {
      throw new Error(`Body too large or missing for letter ${letterId}`);
    }
    const text = bodyBytes.toString('utf8');
    const isHtml = (bodyFile?.mime ?? '').includes('html');
    if (!isHtml) {
      return { html: plainHtml(text), assets: [] };
    }

    // cid-картинки → ассеты конвертера; сверх потолка — пустой пиксель.
    const inline = attachments.filter((a) => a.inline && a.contentId !== null);
    const inlineRefs = new Map(
      (await this.files.refs(inline.map((a) => a.fileId))).map((f) => [f.id, f]),
    );
    const assets: HtmlPdfAsset[] = [];
    const replaces = new Map<string, string>();
    let assetsBytes = 0;
    for (const [index, attachment] of inline.entries()) {
      const file = inlineRefs.get(attachment.fileId);
      const cid = attachment.contentId!;
      if (
        !file ||
        file.size > BODY_PDF_ASSETS_CAP_BYTES ||
        assetsBytes + file.size > BODY_PDF_ASSETS_CAP_BYTES
      ) {
        replaces.set(cid, EMPTY_IMAGE);
        continue;
      }
      const bytes = await this.readAll(attachment.fileId);
      if (bytes === null) {
        replaces.set(cid, EMPTY_IMAGE);
        continue;
      }
      assetsBytes += bytes.length;
      const name = `img-${index}.${extOf(file.mime)}`;
      replaces.set(cid, name);
      assets.push({ name, mime: file.mime, bytes });
    }
    let html = text;
    for (const [cid, target] of replaces) {
      html = html.replaceAll(`cid:${cid}`, target);
    }
    return { html: printHtml(html), assets };
  }

  /** Контент файла целиком; null — файла нет (потерянное хранилище). */
  private async readAll(fileId: string): Promise<Buffer | null> {
    const content = await this.storage.get(fileId);
    if (!content) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of content.stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }
}

class DuplicateBodyPdfError extends Error {
  constructor() {
    super('body_pdf already exists');
  }
}

/** Печатный вид HTML-письма: белый лист, чёрный текст — тёмные письма
 *  остаются читаемыми в копии (инъекция в head, картинки не трогаем). */
function printHtml(html: string): string {
  const style =
    '<style>body{background:#fff!important;color:#000!important}body *{background-color:transparent!important}</style>';
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${style}${html.slice(at)}`;
  }
  return `${style}${html}`;
}

/** Текст письма — читательской колонкой (как вкладка «Текст письма»). */
function plainHtml(text: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 serif;margin:0}</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
}
