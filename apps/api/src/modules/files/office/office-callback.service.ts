import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Readable } from 'node:stream';
import { FILE_EVENTS, type FileVersionCreatedPayload } from '@nodus/contracts';

import { AuditRepository } from '../../../core/audit/audit.repository.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { FilesRepository } from '../files.repository.js';
import { MinioStorageDriver } from '../storage/minio-storage.driver.js';
import { OFFICE_CONFIG, type OfficeConfig } from './office.config.js';

/** Тело колбэка документ-сервера (протокол DS, не наш контракт):
 *  api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/. */
export interface OfficeCallbackBody {
  status: number;
  key: string;
  url?: string;
  filetype?: string;
  users?: string[];
  actions?: { type: number; userid: string }[];
  lastsave?: string;
  forcesavetype?: number;
  notmodified?: boolean;
  /** JWT в теле (при JWT_IN_BODY у DS); обычно токен приходит в заголовке. */
  token?: string;
}

/**
 * Обработка колбэков сохранений ONLYOFFICE (#138): статус 2 (закрытие с
 * изменениями) и 6 (forcesave) скачивают собранный файл и создают новую
 * FileVersion (+ указатель file_objects + событие outbox + аудит, одной
 * транзакцией). Дедуп: повторная доставка того же сохранения (тот же
 * document key + lastsave) не плодит версии.
 */
@Injectable()
export class OfficeCallbackService {
  constructor(
    private readonly repository: FilesRepository,
    private readonly driver: MinioStorageDriver,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly audit: AuditRepository,
    @Inject(OFFICE_CONFIG) private readonly config: OfficeConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OfficeCallbackService.name);
  }

  async handle(fileId: string, body: OfficeCallbackBody): Promise<void> {
    // 1/4 — открытие редактора, 4 — закрытие без изменений, 3/7 — ошибки DS:
    // подтверждаем, версии не касаются (DS повторяет, пока не получит {error:0}).
    if (body.status !== 2 && body.status !== 6) return;
    // 2 без url после forcesave — изменений с прошлого сохранения нет.
    if (!body.url) return;

    const file = await this.repository.findById(fileId);
    if (!file) {
      this.logger.warn({ fileId, key: body.key }, 'Office callback for missing file');
      return;
    }
    const versions = await this.repository.findVersions(file.id);
    const latest = versions[0];

    // Сессия DS живёт под документ-ключом. После forcesave DS продолжает
    // редактирование под ТЕМ ЖЕ ключом, хотя текущая версия уже ушла вперёд:
    // принимаем колбэки ключа текущей версии И ключа, породившего её.
    const currentKey = `${file.id}:v${file.version}`;
    const continuesLatest = latest?.sourceKey === body.key;
    if (body.key !== currentKey && !continuesLatest) {
      this.logger.info(
        { fileId, key: body.key, current: file.version },
        'Office callback for outdated document key',
      );
      return;
    }

    const incomingLastsave = this.toLastsaveMs(body.lastsave);
    const storedLastsave = latest?.sourceLastsave ?? null;
    if (
      latest?.sourceKey === body.key &&
      incomingLastsave !== null &&
      storedLastsave === incomingLastsave
    ) {
      return; // повторная доставка того же сохранения (forcesave → закрытие)
    }

    const nextVersion = file.version + 1;
    const key = `files/${file.id}/v${nextVersion}`;
    const { size, bytes } = await this.downloadTo(body.url, key, file.mime, file.name);
    if (bytes !== size) {
      await this.driver.remove([key]).catch(() => undefined);
      throw new Error(
        `Office save size mismatch for ${file.id}: declared ${size}, streamed ${bytes}`,
      );
    }

    await this.txRunner.run(async (tx) => {
      await this.repository.saveVersion(tx, {
        fileObjectId: file.id,
        version: nextVersion,
        key,
        size: bytes,
        mime: file.mime,
        sourceKey: body.key,
        sourceLastsave: incomingLastsave,
      });
      const payload: FileVersionCreatedPayload = {
        fileId: file.id,
        version: nextVersion,
        size: bytes,
        mime: file.mime,
      };
      await this.eventBus.emit(tx, FILE_EVENTS.VERSION_CREATED, payload, {
        aggregateType: 'file',
        aggregateId: file.id,
      });
    });
    await this.audit.append({
      actorId: null,
      action: 'files.office_save',
      entityType: 'file',
      entityId: file.id,
      details: { version: nextVersion, status: body.status, users: body.users ?? [] },
    });
    this.logger.info({ fileId, version: nextVersion, status: body.status }, 'Office version saved');
  }

  /**
   * Скачивание собранного файла из кэша DS. Хост в body.url строится DS от
   * браузерского origin (X-Forwarded-Host) — из сети api он может не
   * резолвиться, поэтому origin подменяется внутренним адресом DS
   * (механизм: getBaseUrl у DS, DocumentServer#2162); путь и подпись
   * md5+expires сохраняются.
   */
  private async downloadTo(
    url: string,
    key: string,
    mime: string,
    fileName: string,
  ): Promise<{ size: number; bytes: number }> {
    const internal = this.toInternalUrl(url);
    const response = await fetch(internal);
    if (!response.ok || !response.body) {
      throw new Error(`Office save download failed (${response.status}) for ${fileName}`);
    }
    const size = Number(response.headers.get('content-length') ?? 0);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error(`Office save download has no content-length for ${fileName}`);
    }
    const { bytes } = await this.driver.put(
      key,
      size,
      mime,
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    );
    return { size, bytes };
  }

  private toInternalUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const base = new URL(this.config.internalUrl);
      return `${base.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }

  /** lastsave колбэка → мс (bigint для file_versions.source_lastsave);
   *  null — отсутствует/мусор: без lastsave дедуп не делаем (риск потерять
   *  реальные изменения важнее риска дубликата-версии). */
  private toLastsaveMs(iso: string | undefined): bigint | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? BigInt(ms) : null;
  }
}
