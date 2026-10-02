import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Readable } from 'node:stream';
import { fileExtension } from '@nodus/contracts';

import { FilesRepository } from '../files.repository.js';
import { MinioStorageDriver } from '../storage/minio-storage.driver.js';
import { DERIVATIVES_CONFIG, type DerivativesConfig } from './derivatives.config.js';
import { DerivativesRepository } from './derivatives.repository.js';

/** Потолок буферизации конвертации: над лимитом загрузки вложений (100 МБ). */
const CONVERT_CAP_BYTES = 110 * 1024 * 1024;

/**
 * Генерация PDF-производной (#139): файл из SILO → Gotenberg (LibreOffice)
 * → PDF в SILO `files/{id}/v{N}/deriv.pdf` + строка ready. XLSX-семейство и
 * текстовые таблицы НЕ конвертируются (спека: PDF-простыня — антипаттерн).
 * PNG-иконку первой страницы стек не даёт (Gotenberg конвертит только в
 * PDF; скриншоты — про Chromium/HTML) — отложено с обоснованием в issue.
 */
@Injectable()
export class DerivativesService {
  constructor(
    private readonly files: FilesRepository,
    private readonly derivatives: DerivativesRepository,
    private readonly driver: MinioStorageDriver,
    @Inject(DERIVATIVES_CONFIG) private readonly config: DerivativesConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DerivativesService.name);
  }

  /** Есть ли смысл генерировать PDF для этого имени файла (спека #139). */
  shouldGeneratePdf(name: string): boolean {
    return this.config.pdfExtensions.includes(fileExtension(name));
  }

  async generatePdf(fileId: string, version: number): Promise<void> {
    if (!this.config.gotenbergUrl) {
      this.logger.info('Gotenberg не настроен (GOTENBERG_URL) — производные пропущены');
      return;
    }
    const file = await this.files.findById(fileId);
    if (!file || file.scanStatus === 'infected') return;
    if (!this.shouldGeneratePdf(file.name)) return;

    const previous = await this.derivatives.find(fileId, version, 'pdf');
    if (previous?.status === 'ready') return; // готово (идемпотентность job)
    await this.derivatives.ensurePending({ fileObjectId: fileId, version, kind: 'pdf' });

    const source = await this.driver.get(file.key);
    const pdfBytes = await this.convertToPdf(source, file.name);
    const key = `files/${fileId}/v${version}/deriv.pdf`;
    const { bytes } = await this.driver.put(
      key,
      pdfBytes.length,
      'application/pdf',
      Readable.from([pdfBytes]),
    );
    await this.derivatives.markReady({
      fileObjectId: fileId,
      version,
      kind: 'pdf',
      key,
      size: bytes,
    });
    this.logger.info({ fileId, version, bytes }, 'PDF-производная готова');
  }

  /** Конвертация через Gotenberg (LibreOffice): office-байты → PDF-байты.
   * Источник буферизуется с потолком (лимит загрузки вложений — 100 МБ,
   * над ним производные не строятся — конвертация бессмысленна). */
  async convertToPdf(source: Readable, fileName: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of source) {
      total += (chunk as Buffer).length;
      if (total > CONVERT_CAP_BYTES) throw new Error(`source exceeds cap for ${fileName}`);
      chunks.push(Buffer.from(chunk));
    }
    const form = new FormData();
    form.append('files', new Blob([Buffer.concat(chunks)]), fileName);
    const response = await fetch(`${this.config.gotenbergUrl}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Gotenberg convert failed (${response.status}) for ${fileName}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error(`Gotenberg returned empty PDF for ${fileName}`);
    return bytes;
  }

  /** Финал неудачной генерации (исчерпаны ретраи очереди): статус failed с
   * причиной — наблюдаемость конвейера (pending навсегда — дыра статуса). */
  async markFailed(fileId: string, version: number, error: unknown): Promise<void> {
    await this.derivatives
      .markFailed({ fileObjectId: fileId, version, kind: 'pdf' }, String(error))
      .catch(() => undefined);
  }
}
